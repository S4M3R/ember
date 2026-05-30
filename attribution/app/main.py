"""Ember attribution API (real only — no mock).

  POST /attribute  -> per-block responsibility ranking (default method=llm) with reasons
  POST /replay     -> re-run the turn with edited prompt blocks
  GET  /health     -> readiness + whether Nemotron is reachable

If Nemotron can't produce a result, these return HTTP 502 rather than fabricating one.
"""
from __future__ import annotations

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
        return await core.replay(req.turn, req.edited_blocks)
    except NemotronUnavailable as e:
        raise HTTPException(status_code=502, detail=f"Nemotron unavailable: {e}")


@app.post("/synthesize", response_model=SynthesizeResult)
async def synthesize(req: SynthesizeRequest):
    """Re-speak the same line in a different Gradium voice (TTS-only replay)."""
    try:
        return await tts_svc.synthesize(req.text, req.voice)
    except tts_svc.TTSUnavailable as e:
        raise HTTPException(status_code=502, detail=f"Gradium TTS unavailable: {e}")


def main():
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=config.ATTRIBUTION_PORT, reload=True)


if __name__ == "__main__":
    main()
