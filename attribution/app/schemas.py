"""Pydantic models mirroring shared/schema.md."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class Block(BaseModel):
    id: str
    label: str
    text: str


class Message(BaseModel):
    role: str
    content: str


class Turn(BaseModel):
    id: str
    index: int = 0
    ts: float = 0.0
    user_text: str = ""
    response: str
    system_blocks: list[Block]
    messages: list[Message] = []
    latencies: dict = {}
    tool_calls: list = []


class BlockAttribution(BaseModel):
    id: str
    label: str
    drop: float = 0.0       # log-likelihood drop (loglik method only)
    score: float            # 0..1 responsibility
    reason: str = ""        # why this block ranks here (llm-rank method)


class AttributionResult(BaseModel):
    turn_id: str
    method: str  # "loglik" | "mock"
    baseline_logprob: float
    blocks: list[BlockAttribution]


class ReplayRequest(BaseModel):
    turn: Turn
    # Edited blocks override the turn's system_blocks by id; others kept as-is.
    edited_blocks: list[Block] = []
    # Raw system-prompt override. When set, used verbatim instead of rendering
    # the (edited) blocks — lets the UI edit the whole prompt as free text.
    edited_system: str | None = None


class ReplayResult(BaseModel):
    turn_id: str
    response: str
    changed: bool
    method: str  # "chat"


class SynthesizeRequest(BaseModel):
    text: str                # the line to speak
    voice: str               # Gradium voice_id


class SynthesizeResult(BaseModel):
    voice: str
    audio: str               # data: WAV URL the browser can play
    sample_rate: int
    duration_ms: int
