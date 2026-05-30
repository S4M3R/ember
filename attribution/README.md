# Ember — Attribution service

Counterfactual prompt attribution: ablate each system-prompt block, score the
log-likelihood of the agent's actual response under the ablated prompt, and report
the drop. Big drop = that block caused the response.

## Run
```bash
cd attribution
uv sync
uv run uvicorn app.main:app --reload --port 8001
# or: uv run python -m app.main
```

## Endpoints
- `GET  /health` — shows mode (real/mock) and whether Nemotron is reachable.
- `POST /attribute` — body = a `Turn` (see ../shared/schema.md) → `AttributionResult`.
- `POST /replay` — body = `{ "turn": Turn, "edited_blocks": [Block] }` → `ReplayResult`.
- `POST /synthesize` — body = `{ "text": str, "voice": gradium_voice_id }` → `SynthesizeResult`
  (`{voice, audio (data: WAV URL), sample_rate, duration_ms}`). Re-speaks the same line
  in a different Gradium voice; needs `GRADIUM_API_KEY`. 502 if Gradium errors/unreachable.

## Real vs mock
- Set `NEMOTRON_LLM_URL` (+ `NEMOTRON_API_KEY` if needed) in the repo-root `.env`.
- Force mock with `EMBER_MOCK=1`. If a real call fails, we auto-fall-back to mock so
  the demo never goes dark.

## Smoke test
```bash
# attribute the sample failing turn (t3)
curl -s localhost:8001/attribute \
  -d "$(python3 -c 'import json,sys; s=json.load(open("../shared/sample_session.json"));
t=s["turns"][2]; t["system_blocks"]=s["system_blocks"]; print(json.dumps(t))')" \
  -H 'content-type: application/json' | python3 -m json.tool
```
The `TONE` block ("never refuse / always say yes") should score highest.

## The spike that decides everything
Before trusting the real path, confirm the endpoint echo-scores:
```bash
curl "$NEMOTRON_LLM_URL/completions" -H 'content-type: application/json' \
  -d '{"model":"'"$NEMOTRON_LLM_MODEL"'","prompt":"hello world","echo":true,"max_tokens":0,"logprobs":1}'
```
If you get back `logprobs.token_logprobs`, the real path works. If not, stay on mock /
switch to the Cekura-score-delta method (see ../EMBER-DESIGN.md).
