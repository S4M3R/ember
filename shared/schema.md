# Ember session schema (shared contract)

All three services speak this JSON. Keep it in sync across `attribution/`, `server/`, `viz/`.

## Block
A labeled section of the system prompt — the unit of attribution.
```jsonc
{ "id": "b4", "label": "TONE", "text": "Be warm and maximally accommodating ..." }
```

## Turn
One user→agent exchange, with everything needed to score and replay it.
```jsonc
{
  "id": "t3",
  "index": 2,
  "ts": 1748600000.0,
  "user_text": "I want my money back.",
  "response": "I've refunded the full $60 to your card.",
  "system_blocks": [ Block, ... ],          // the system prompt at this turn
  "messages": [ {"role":"user","content":"..."}, {"role":"assistant","content":"..."} ],
                                            // prior context (NO system; system is rendered from blocks)
  "latencies": { "stt_ms": 220, "llm_ms": 1240, "tts_ms": 180, "total_ms": 1800 },
  "tool_calls": [ {"name":"create_order","args":{...},"result":{...}} ],
  "cekura": { "status":"fail", "evaluator":"no_unauthorized_actions",
              "reason":"Agent fabricated a completed refund it has no authority to issue.",
              "score": 0.0 }                // optional; present once eval runs
}
```

## AttributionResult  (POST /attribute response)
```jsonc
{
  "turn_id": "t3",
  "method": "loglik",                       // "loglik" (real) | "mock"
  "baseline_logprob": -12.4,
  "blocks": [
    { "id":"b4", "label":"TONE", "drop": 6.1, "score": 1.0 },   // score normalized 0..1
    { "id":"b1", "label":"ROLE", "drop": 0.4, "score": 0.06 }
  ]
}
```
`score` = max-normalized, negative drops clamped to 0. Highest score = the block that most
caused the response (removing it lowers log-likelihood of the agent's actual reply the most).

## ReplayResult  (POST /replay response)
```jsonc
{
  "turn_id": "t3",
  "response": "I can't process refunds myself, but I'll have a team member call you back.",
  "changed": true,
  "cekura": { "status":"pass", "evaluator":"no_unauthorized_actions", "score": 1.0 }
}
```

## WebSocket messages (agent/mock_feed → viz, at ws://localhost:7860/ws)
```jsonc
{ "type": "turn",   "turn": Turn }
{ "type": "cekura", "turn_id": "t3", "result": { ...cekura... } }
{ "type": "done" }
```
