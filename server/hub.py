"""Tiny WebSocket broadcast hub.

Producers (the Pipecat observer, or mock_feed) push JSON messages; clients (the
viz) receive them. A short backlog is replayed to late-joining clients so the viz
can connect mid-session and still see every turn.
"""
from __future__ import annotations

import asyncio
import json
import os

import websockets

WS_PORT = int(os.getenv("EMBER_WS_PORT", "8765"))


class WSHub:
    def __init__(self, host: str = "0.0.0.0", port: int = WS_PORT):
        self.host = host
        self.port = port
        self.clients: set = set()
        self.backlog: list[str] = []
        self._server = None
        # Set by the viz over the WS before a "resume from here" call: the
        # conversation history to seed the next connection with, and how far to
        # offset the new call's clock so its turns land after the branch point.
        # run_bot consumes and clears them on_client_connected.
        self.pending_seed: list | None = None
        self.pending_offset_ms: int = 0

    async def _handler(self, ws, *_):  # *_ tolerates older websockets (ws, path)
        self.clients.add(ws)
        for m in self.backlog:
            await ws.send(m)
        try:
            async for raw in ws:  # control messages from the viz (e.g. resume seed)
                try:
                    obj = json.loads(raw)
                except Exception:  # noqa: BLE001
                    continue
                if obj.get("type") == "seed":
                    self.pending_seed = obj.get("messages") or []
                    self.pending_offset_ms = int(obj.get("offset_ms") or 0)
                    print(f"[hub] pending_seed set: {len(self.pending_seed)} msgs, "
                          f"offset {self.pending_offset_ms}ms", flush=True)
                elif obj.get("type") == "seed_clear":
                    self.pending_seed = None
                    self.pending_offset_ms = 0
        finally:
            self.clients.discard(ws)

    async def start(self):
        if self._server is not None:
            return self  # idempotent: already serving
        self._server = await websockets.serve(self._handler, self.host, self.port)
        print(f"[hub] ws://{self.host}:{self.port}")
        return self

    async def broadcast(self, obj: dict):
        m = json.dumps(obj)
        self.backlog.append(m)
        if len(self.backlog) > 200:
            self.backlog.pop(0)
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send(m)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for d in dead:
            self.clients.discard(d)

    def reset_backlog(self):
        self.backlog.clear()


async def serve_forever(hub: WSHub | None = None) -> WSHub:
    hub = hub or WSHub()
    await hub.start()
    return hub


# Process-wide shared hub: started once, reused by every agent connection.
# Starting a new hub per call would try to re-bind the port and crash run_bot.
_SHARED: "WSHub | None" = None


async def shared_hub() -> "WSHub":
    global _SHARED
    if _SHARED is None:
        h = WSHub()
        await h.start()
        _SHARED = h
    return _SHARED


if __name__ == "__main__":
    async def _main():
        await serve_forever()
        await asyncio.Future()  # run forever
    asyncio.run(_main())
