"""Auto-evaluate a finished Ember call through Cekura observability.

When a call ends, the observer hands its transcript here. We POST it to Cekura's
observability ingest endpoint (which schedules metric evaluation), poll the call
log until the metric scores land, and stream them back over the Ember hub as
`{"type": "cekura", ...}` messages so the viz can render the feedback top-right.

Env (all optional except the key, which comes from the agent's .env):
    CEKURA_API_KEY        — required; without it this module no-ops.
    CEKURA_API_BASE       — default https://api.cekura.ai
    CEKURA_AGENT_ID       — Cekura agent that owns these calls (default 18082)
    CEKURA_PROJECT_ID     — for the dashboard link (default 5872)
    CEKURA_METRIC_IDS     — comma-separated metric ids to evaluate (sensible default)
    CEKURA_DASHBOARD_BASE — default https://dashboard.cekura.ai
"""
from __future__ import annotations

import asyncio
import os
import uuid

import httpx
from loguru import logger

_BASE = os.getenv("CEKURA_API_BASE", "https://api.cekura.ai").rstrip("/")
_KEY = os.getenv("CEKURA_API_KEY", "")
_AGENT_ID = int(os.getenv("CEKURA_AGENT_ID", "18082"))
_PROJECT_ID = int(os.getenv("CEKURA_PROJECT_ID", "5872"))
_DASHBOARD = os.getenv("CEKURA_DASHBOARD_BASE", "https://dashboard.cekura.ai").rstrip("/")

# Observability-enabled metrics for the YC Partner agent that score a text
# transcript (no audio): Tool Call Success, Unnecessary Repetition, Talk Ratio,
# Latency, Infrastructure Issues, AI interrupting user. Override via env.
_DEFAULT_METRICS = "147219,147221,147218,147216,147214,147211"
_METRIC_IDS = os.getenv("CEKURA_METRIC_IDS", _DEFAULT_METRICS)

_POLL_EVERY = 3.0
_POLL_MAX = 25  # ~75s ceiling


def enabled() -> bool:
    return bool(_KEY)


def _headers() -> dict:
    return {"X-CEKURA-API-KEY": _KEY, "Content-Type": "application/json"}


def _normalize(m: dict) -> dict | None:
    """Shape one raw Cekura metric into something the viz can render directly.

    Returns None for metrics that produced no result (e.g. audio-only metrics on
    a text transcript) so the panel stays clean.
    """
    name = m.get("name") or m.get("metric_name") or "Metric"
    typ = m.get("type") or m.get("eval_type") or ""
    score = m.get("score")
    if score is None:
        score = m.get("score_normalized")
    value = m.get("value")
    if score is None and (value is None or value == ""):
        return None  # nothing to show

    display, t, passed = None, None, None
    if typ == "binary_workflow_adherence":
        passed = (score == 5) or (str(value).lower() in ("true", "pass", "yes", "1"))
        display = "Pass" if passed else "Fail"
        t = 1.0 if passed else 0.0
    elif typ == "continuous_qualitative" and isinstance(score, (int, float)):
        display = f"{score:.1f}/5"
        t = max(0.0, min(1.0, score / 5.0))
        passed = score >= 4.0
    elif isinstance(score, (int, float)):
        low = name.lower()
        if "(ms)" in low or "(in ms)" in low or low.endswith(" ms"):
            display = f"{score:.0f} ms"
        elif score == int(score):
            display = str(int(score))
        else:
            display = f"{score:.2f}"
    elif value not in (None, ""):
        display = str(value)
    else:
        return None

    return {"name": name, "type": typ, "score": score, "value": value,
            "display": display, "t": t, "pass": passed}


def _extract_metrics(call_log: dict) -> list[dict]:
    # Call logs nest scores under `evaluation.metrics`; fall back to a top-level
    # `metrics` array just in case the shape varies.
    raw = (call_log.get("evaluation") or {}).get("metrics") or call_log.get("metrics") or []
    out = []
    for m in raw:
        norm = _normalize(m)
        if norm:
            out.append(norm)
    return out


async def evaluate(transcript: list[dict], hub) -> None:
    """Ingest `transcript` into Cekura, poll for metric scores, stream to the hub."""
    if not enabled():
        logger.info("[cekura] CEKURA_API_KEY not set — skipping auto-evaluation")
        return
    if not transcript:
        logger.info("[cekura] empty transcript — skipping auto-evaluation")
        return

    call_id = f"ember-{uuid.uuid4().hex[:12]}"
    payload = {
        "call_id": call_id,
        "agent": _AGENT_ID,
        "transcript_type": "cekura",
        "transcript_json": transcript,
        "metric_ids": _METRIC_IDS,
        "call_ended_reason": "completed",
    }

    await hub.broadcast({"type": "cekura", "status": "evaluating", "metrics": []})

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f"{_BASE}/observability/v1/observe/",
                                  headers=_headers(), json=payload)
            if r.status_code >= 300:
                logger.error(f"[cekura] ingest failed {r.status_code}: {r.text[:300]}")
                await hub.broadcast({"type": "cekura", "status": "error",
                                     "message": f"ingest {r.status_code}"})
                return
            call_log = r.json()
            call_log_id = call_log.get("id")
            logger.info(f"[cekura] ingested call_log={call_log_id} ({call_id})")
            dashboard_url = f"{_DASHBOARD}/{_PROJECT_ID}/observability"

            # Poll the call log until metric scores land.
            metrics: list[dict] = _extract_metrics(call_log)
            for _ in range(_POLL_MAX):
                await asyncio.sleep(_POLL_EVERY)
                try:
                    g = await client.get(
                        f"{_BASE}/observability/v1/call-logs/{call_log_id}/",
                        headers=_headers())
                    if g.status_code >= 300:
                        continue
                    cl = g.json()
                except Exception as e:  # noqa: BLE001 - transient, keep polling
                    logger.warning(f"[cekura] poll error: {e!r}")
                    continue
                metrics = _extract_metrics(cl)
                status = str(cl.get("status", "")).lower()
                if metrics and status not in ("evaluating", "running", "in_progress", ""):
                    break
                if len(metrics) >= len(_METRIC_IDS.split(",")):
                    break

            await hub.broadcast({
                "type": "cekura", "status": "done",
                "call_log_id": call_log_id, "dashboard_url": dashboard_url,
                "metrics": metrics,
            })
            logger.info(f"[cekura] evaluation done — {len(metrics)} metric(s) streamed")
    except Exception as e:  # noqa: BLE001 - eval is best-effort, never crash the call
        logger.exception(f"[cekura] auto-evaluation failed: {e}")
        await hub.broadcast({"type": "cekura", "status": "error", "message": str(e)[:200]})
