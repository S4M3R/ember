"""Counterfactual log-likelihood attribution (secondary method=loglik) + replay.

Real only — no mock fallback. If Nemotron is unreachable, these raise and the API
returns 502. The default attribution method is llm_rank.py; this loglik path is
kept as the rigorous, fine-grained alternative.
"""
from __future__ import annotations

import asyncio

import httpx

from . import config
from .blocks import apply_edits, prompt_for, render_system
from .nemotron import Nemotron
from .schemas import AttributionResult, BlockAttribution, ReplayResult, Turn


async def attribute(turn: Turn) -> AttributionResult:
    """Ablate each block, score logP(response | prompt\\block), report drops."""
    nem = Nemotron()
    response = turn.response
    async with httpx.AsyncClient() as client:
        sem = asyncio.Semaphore(config.ATTRIBUTION_K)

        async def score(blocks) -> float:
            async with sem:
                return await nem.response_loglik(client, prompt_for(turn, blocks), response)

        baseline = await score(turn.system_blocks)
        ablated = await asyncio.gather(*[
            score([b for b in turn.system_blocks if b.id != blk.id])
            for blk in turn.system_blocks
        ])

    drops = [baseline - a for a in ablated]
    clamped = [max(d, 0.0) for d in drops]
    top = max(clamped) or 1.0
    blocks = [
        BlockAttribution(id=blk.id, label=blk.label, drop=round(d, 3), score=round(c / top, 3))
        for blk, d, c in zip(turn.system_blocks, drops, clamped)
    ]
    blocks.sort(key=lambda x: x.score, reverse=True)
    return AttributionResult(turn_id=turn.id, method="loglik",
                             baseline_logprob=round(baseline, 3), blocks=blocks)


async def replay(turn: Turn, edited_blocks) -> ReplayResult:
    """Re-run the turn at temperature 0 with the edited system prompt."""
    new_blocks = apply_edits(turn.system_blocks, edited_blocks)
    edited_joined = render_system(new_blocks)

    nem = Nemotron()
    messages = [{"role": "system", "content": edited_joined}] + [
        {"role": m.role, "content": m.content} for m in turn.messages
    ]
    async with httpx.AsyncClient() as client:
        new_resp = await nem.chat(client, messages, temperature=0.0)

    return ReplayResult(
        turn_id=turn.id, response=new_resp,
        changed=new_resp.strip() != turn.response.strip(), method="chat",
    )
