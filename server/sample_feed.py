"""Replay a recorded conversation over the WS hub to drive the viz when the live
agent isn't running.

This is NOT a mock of results — it's a recorded transcript (real input). Every
ranking and replay the viz computes on these turns is real Nemotron. Swap this for
the live agent (see server/INTEGRATION.md) to stream real calls instead.

    cd server && uv run python sample_feed.py
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from hub import WSHub

SAMPLE = Path(__file__).resolve().parents[1] / "shared" / "sample_session.json"


def load_turns() -> list[dict]:
    data = json.loads(SAMPLE.read_text())
    blocks = data["system_blocks"]
    turns = []
    for t in data["turns"]:
        t = dict(t)
        t.setdefault("system_blocks", blocks)
        turns.append(t)
    return turns


async def run(delay: float = 2.0):
    hub = await WSHub().start()
    print("[sample_feed] hub up. Open the viz; turns stream in. Attribution is real.")
    await asyncio.sleep(3)
    while True:
        hub.reset_backlog()
        for t in load_turns():
            await hub.broadcast({"type": "turn", "turn": t})
            print(f"[sample_feed] sent {t['id']}")
            await asyncio.sleep(delay)
        await hub.broadcast({"type": "done"})
        await asyncio.sleep(8)


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        print("\n[sample_feed] bye")
