"""Render labeled prompt blocks into the text the LLM actually sees, and
reconstruct prompt variants with one block ablated.

The system prompt is rendered as labeled sections so each block is a first-class
unit of attribution. We feed the agent's turn through a consistent pseudo-chat
text template; attribution is a *relative* signal across ablations, so the exact
template need only be stable, not identical to the model's chat template.
"""
from __future__ import annotations

from .schemas import Block, Message, Turn


def render_system(blocks: list[Block]) -> str:
    """Join labeled blocks into one system string."""
    parts = [f"## {b.label}\n{b.text}".strip() for b in blocks if b.text.strip()]
    return "\n\n".join(parts)


def render_prompt_text(system_text: str, messages: list[Message]) -> str:
    """Flatten system + prior messages into a single completions-style prompt,
    ending right before the assistant's reply (which we score separately)."""
    lines = [f"System:\n{system_text}\n"]
    for m in messages:
        role = "User" if m.role == "user" else "Assistant"
        lines.append(f"{role}: {m.content}")
    lines.append("Assistant:")
    return "\n".join(lines)


def prompt_for(turn: Turn, blocks: list[Block]) -> str:
    """Full prompt text for a given set of system blocks."""
    return render_prompt_text(render_system(blocks), turn.messages)


def ablations(turn: Turn) -> list[tuple[Block, list[Block]]]:
    """One (removed_block, remaining_blocks) pair per block."""
    out = []
    for blk in turn.system_blocks:
        remaining = [b for b in turn.system_blocks if b.id != blk.id]
        out.append((blk, remaining))
    return out


def apply_edits(blocks: list[Block], edited: list[Block]) -> list[Block]:
    """Override blocks by id with edited versions; keep order."""
    by_id = {b.id: b for b in edited}
    return [by_id.get(b.id, b) for b in blocks]
