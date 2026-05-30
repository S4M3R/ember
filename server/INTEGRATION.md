# Wiring Ember into the official Pipecat starter

The voice agent lives in the hackathon starter
(`pipecat-ai/yc-voice-agents-hackathon/server`). Don't rebuild it — it already
has the exact Gradium STT/TTS + Nemotron LLM wiring. Ember attaches in ~6 lines.

## 1. Copy these modules next to the starter's `bot-nemotron.py`
```
hub.py
observer.py
ember_prompt.py
```

## 2. Author the agent's system prompt from blocks
Replace the starter's hardcoded system prompt with the rendered blocks so
attribution has labeled units:
```python
from ember_prompt import SYSTEM_BLOCKS, render_system
system_prompt = render_system(SYSTEM_BLOCKS)   # feed this to your LLM context
```

## 3. Start the hub and attach the observer
In the bot's async setup (where the `Pipeline` / `PipelineTask` is created):
```python
from hub import WSHub
from observer import EmberObserver

hub = await WSHub().start()                     # ws://localhost:8765
observer = EmberObserver(hub, SYSTEM_BLOCKS)

task = PipelineTask(
    pipeline,
    params=PipelineParams(...),
    observers=[observer],                       # <-- the one line that matters
)
```
Older Pipecat exposes observers via `task.add_observer(observer)` or on the
`PipelineRunner` instead — use whichever your version supports.

## 4. If turns don't appear
Frame names differ across Pipecat versions. Add one print at the top of
`EmberObserver.on_push_frame`:
```python
print("FRAME", type(frame).__name__)
```
Run a call, watch the names, and adjust the matched names in `observer.py`
(`TranscriptionFrame`, `LLMFullResponseStartFrame`, `LLMTextFrame`,
`LLMFullResponseEndFrame`, `TTSStartedFrame`, `TTSStoppedFrame`).

Escape hatch: skip frame parsing and call `await observer.record_turn(user_text,
response)` from wherever you already have both strings.

## 5. Point the viz at the live hub
The viz defaults to `ws://localhost:8765`. Set `VITE_WS_URL` in `viz/.env` if you
change the port (`EMBER_WS_PORT`).

## Demo without any of this
`uv run python mock_feed.py` streams the canned session over the same hub — the
viz can't tell the difference. Use it to build and rehearse before the network is up.
