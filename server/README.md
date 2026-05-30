# Ember — Server (live data layer)

- `hub.py` — WebSocket broadcast hub (`ws://localhost:8765`), with backlog replay.
- `observer.py` — Pipecat frame observer; assembles a Turn per exchange and broadcasts it.
- `ember_prompt.py` — the agent system prompt, authored as labeled blocks.
- `mock_feed.py` — replay the sample session over the hub (no Pipecat needed).
- `INTEGRATION.md` — merge the observer into the official Pipecat starter (~6 lines).

## Run the mock feed (works offline, now)
```bash
cd server
uv sync                       # installs websockets
uv run python mock_feed.py
```
Then start the viz (`viz/`) — turns stream in, Cekura fails on the refund turn.

## Real agent
Follow `INTEGRATION.md`: copy `hub.py`, `observer.py`, `ember_prompt.py` into the
starter's `server/`, render the system prompt from blocks, and pass the observer to
your `PipelineTask`.
