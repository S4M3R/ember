"""LLM-as-judge attribution (the default, and the only one that's reliable).

Give the model the system prompt (as labeled blocks), the conversation, and the
agent's response. It ranks how much each block is responsible for that response,
with a one-line reason per block, so a developer with a 2,000-token prompt knows
exactly which block to fix instead of guessing.

Real only — no mock fallback. vLLM guided decoding forces valid JSON, and each
retry uses a fresh connection so it can land on a healthy replica behind the ALB.
If Nemotron can't produce a ranking, we raise (the API returns 502) rather than
fabricate one.
"""
from __future__ import annotations

import json

import httpx

from .nemotron import Nemotron, NemotronUnavailable
from .schemas import AttributionResult, BlockAttribution, Turn

_SYSTEM = (
    "You are a prompt-debugging analyst for voice agents. You are given an agent's "
    "system prompt split into labeled blocks, the conversation so far, and the agent's "
    "final response. Rank how much each block is RESPONSIBLE for that response. Be "
    "decisive: the block that drove the behavior should score near 1.0; unrelated blocks "
    "near 0. Respond with ONLY a JSON array, most-responsible first, one object per block: "
    '[{"id": "<block id>", "score": <0..1>, "reason": "<one sentence>"}]. No prose.'
)

# vLLM guided decoding: constrains output to this schema so the JSON ALWAYS parses.
_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            "score": {"type": "number"},
            "reason": {"type": "string"},
        },
        "required": ["id", "score", "reason"],
    },
}

_MAX_ATTEMPTS = 4


def _build_user(turn: Turn) -> str:
    lines = ["SYSTEM PROMPT BLOCKS:"]
    for b in turn.system_blocks:
        lines.append(f"[{b.id}] ## {b.label}\n{b.text}")
    lines.append("\nCONVERSATION:")
    for m in turn.messages:
        lines.append(f"{m.role.upper()}: {m.content}")
    lines.append(f"\nAGENT RESPONSE:\n{turn.response}")
    lines.append("\nRank which blocks most shaped this response.")
    return "\n".join(lines)


def _parse(raw: str) -> list[dict]:
    s = raw.strip()
    start, end = s.find("["), s.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("no JSON array in model output")
    return json.loads(s[start : end + 1])


async def attribute(turn: Turn) -> AttributionResult:
    nem = Nemotron()
    messages = [{"role": "system", "content": _SYSTEM},
                {"role": "user", "content": _build_user(turn)}]
    last_err: Exception | None = None
    for attempt in range(_MAX_ATTEMPTS):
        # Fresh client per attempt -> new TCP connection -> ALB can route to a
        # different (healthy) replica instead of pinning to a flaky one.
        try:
            async with httpx.AsyncClient() as client:
                raw = await nem.chat(
                    client, messages,
                    temperature=0.0 if attempt == 0 else 0.3,
                    max_tokens=700,
                    extra_body={
                        "chat_template_kwargs": {"enable_thinking": False},
                        "guided_json": _SCHEMA,
                    },
                )
            parsed = _parse(raw)
            break
        except (NemotronUnavailable, ValueError, json.JSONDecodeError) as e:
            last_err = e
            parsed = None
    if parsed is None:
        raise NemotronUnavailable(f"ranking failed after {_MAX_ATTEMPTS} attempts: {last_err}")

    by_id = {p.get("id"): p for p in parsed if isinstance(p, dict)}
    blocks = []
    for b in turn.system_blocks:
        p = by_id.get(b.id, {})
        score = float(p.get("score", 0.0) or 0.0)
        blocks.append(BlockAttribution(
            id=b.id, label=b.label, drop=0.0,
            score=max(0.0, min(score, 1.0)), reason=str(p.get("reason", "")),
        ))
    blocks.sort(key=lambda x: x.score, reverse=True)
    return AttributionResult(turn_id=turn.id, method="llm-rank",
                             baseline_logprob=0.0, blocks=blocks)
