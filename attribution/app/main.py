"""Ember attribution API (real only — no mock).

  POST /attribute  -> per-block responsibility ranking (default method=llm) with reasons
  POST /replay     -> re-run the turn with edited prompt blocks
  GET  /health     -> readiness + whether Nemotron is reachable

If Nemotron can't produce a result, these return HTTP 502 rather than fabricating one.
"""
from __future__ import annotations

import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import attribute as core
from . import config
from . import llm_rank
from . import tts as tts_svc
from .nemotron import Nemotron, NemotronUnavailable
from .schemas import (
    AttributionResult,
    ReplayRequest,
    ReplayResult,
    SynthesizeRequest,
    SynthesizeResult,
    Turn,
)

app = FastAPI(title="Ember Attribution", version="0.2.0")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


@app.get("/health")
async def health():
    reachable = False
    detail = ""
    try:
        async with httpx.AsyncClient() as client:
            await Nemotron().response_loglik(client, "ping", " pong")
        reachable = True
    except NemotronUnavailable as e:
        detail = str(e)
    return {
        "ok": True,
        "nemotron_url": config.NEMOTRON_LLM_URL,
        "nemotron_model": config.NEMOTRON_LLM_MODEL,
        "nemotron_reachable": reachable,
        "detail": detail,
        "k": config.ATTRIBUTION_K,
    }


@app.post("/attribute", response_model=AttributionResult)
async def attribute(turn: Turn, method: str = "llm"):
    """method=llm (default): LLM ranks which blocks shaped the response, with reasons.
    method=loglik: counterfactual ablation + log-likelihood drop."""
    try:
        if method == "loglik":
            return await core.attribute(turn)
        return await llm_rank.attribute(turn)
    except NemotronUnavailable as e:
        raise HTTPException(status_code=502, detail=f"Nemotron unavailable: {e}")


@app.post("/replay", response_model=ReplayResult)
async def replay(req: ReplayRequest):
    try:
        return await core.replay(req.turn, req.edited_blocks, req.edited_system)
    except NemotronUnavailable as e:
        raise HTTPException(status_code=502, detail=f"Nemotron unavailable: {e}")


@app.post("/synthesize", response_model=SynthesizeResult)
async def synthesize(req: SynthesizeRequest):
    """Re-speak the same line in a different Gradium voice (TTS-only replay)."""
    try:
        return await tts_svc.synthesize(req.text, req.voice)
    except tts_svc.TTSUnavailable as e:
        raise HTTPException(status_code=502, detail=f"Gradium TTS unavailable: {e}")


# Repo root: attribution/app/main.py -> parents[2] == yc-cekura/
_REPO = Path(__file__).resolve().parents[2]


def _build_context(payload: dict) -> str:
    """Render the call's Cekura result + agent notes into a Claude briefing."""
    cekura = payload.get("cekura") or {}
    metrics = cekura.get("metrics") or []
    notes = [n for n in (payload.get("notes") or []) if str(n).strip()]
    verdict = payload.get("verdict")
    transcript = payload.get("transcript") or []

    lines = [
        "# Ember — voice-agent call review",
        "",
        "You are helping improve a voice AI agent: a **YC partner** running rapid-fire "
        "office hours with founders. The agent's prompt lives in "
        "`agent/server/ember_prompt.py` (labeled blocks: ROLE / STYLE / PLAYBOOK / "
        "WRAP_UP / TONE). Below is the latest call's Cekura evaluation and the notes the "
        "agent jotted during it. Review them and suggest concrete improvements to the "
        "prompt or behavior.",
        "",
        "## Cekura evaluation",
    ]
    if metrics:
        for m in metrics:
            tag = ""
            if m.get("pass") is True:
                tag = " — PASS"
            elif m.get("pass") is False:
                tag = " — FAIL"
            lines.append(f"- **{m.get('name')}**: {m.get('display')}{tag}")
    else:
        lines.append("- (no metric scores available)")
    if cekura.get("dashboard_url"):
        lines += ["", f"Dashboard: {cekura['dashboard_url']}"]
    if cekura.get("call_log_id"):
        lines.append(f"Call log: {cekura['call_log_id']}")

    lines += ["", "## Notes the agent took during the call"]
    if notes:
        lines += [f"{i + 1}. {n}" for i, n in enumerate(notes)]
    else:
        lines.append("- (none)")

    if verdict:
        lines += ["", f"## Verdict\n{verdict}"]

    if transcript:
        lines += ["", "## Transcript"]
        for t in transcript:
            role = t.get("role", "?")
            text = (t.get("text") or "").strip()
            if text:
                lines.append(f"- **{role}:** {text}")

    lines += [
        "",
        "## Your task",
        "1. Tie each weak Cekura metric and each note to the prompt block most likely "
        "responsible.",
        "2. Propose specific edits to `agent/server/ember_prompt.py`.",
        "3. Keep the partner blunt-but-fair; don't regress the passing behaviors.",
    ]
    return "\n".join(lines)


@app.post("/delegate-to-claude")
async def delegate_to_claude(payload: dict):
    """Write the call's Cekura result + agent notes to a briefing file and open a
    Terminal running `claude` seeded with it. macOS only (uses osascript)."""
    context = _build_context(payload)
    ts = int(time.time())
    path = Path(f"/tmp/ember-claude-{ts}.md")
    try:
        path.write_text(context, encoding="utf-8")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"could not write context: {e}")

    prompt = (f"Read the Ember call-review briefing in {path} and help me improve the "
              f"YC partner voice agent based on the Cekura metrics and the notes it took.")
    # Launch claude with permission prompts disabled so the delegated session can act freely.
    inner = (f"cd {shlex.quote(str(_REPO))} && "
             f"claude --dangerously-skip-permissions {shlex.quote(prompt)}")

    if sys.platform != "darwin":
        # Non-macOS: can't open a GUI terminal; hand back the command to run manually.
        return {"ok": False, "path": str(path), "hint": inner}

    # Preferred terminal: Ghostty. Falls back to Terminal.app if it isn't installed.
    ghostty = shutil.which("ghostty") or "/Applications/Ghostty.app/Contents/MacOS/ghostty"
    if Path(ghostty).exists():
        try:
            # `ghostty -e <argv...>` opens a new window running that command directly.
            subprocess.Popen([ghostty, "-e", "zsh", "-lc", inner])
            return {"ok": True, "path": str(path), "terminal": "ghostty"}
        except Exception as e:  # noqa: BLE001 - fall through to Terminal.app
            print(f"[ember] ghostty launch failed, falling back to Terminal: {e}", flush=True)

    applescript = (
        'tell application "Terminal"\n'
        f'  do script "{inner.replace(chr(92), chr(92) * 2).replace(chr(34), chr(92) + chr(34))}"\n'
        "  activate\n"
        "end tell"
    )
    try:
        subprocess.Popen(["osascript", "-e", applescript])
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"could not open a terminal: {e}")
    return {"ok": True, "path": str(path), "terminal": "terminal"}


def main():
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=config.ATTRIBUTION_PORT, reload=True)


if __name__ == "__main__":
    main()
