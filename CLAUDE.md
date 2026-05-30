# Ember

A counterfactual prompt-attribution debugger for voice agents. Built for the YC Voice
Agents Hackathon (Cekura + Daily; NVIDIA, AWS, Twilio). One-day build, **60-second demo**.

Full rationale, architecture decision, and hour-by-hour build order live in
[EMBER-DESIGN.md](./EMBER-DESIGN.md). Read it before making structural changes.

## What it does

Talk to a Pipecat voice agent. Ember shows the conversation as a turn timeline with
Cekura failures pinned to it. Click a failing turn → see the system prompt as a **saliency
heatmap** (which prompt block caused the response) → edit only the hot block → replay the
turn → watch the output flip and Cekura re-score it green.

Core insight: "which prompt block drove this response" is a counterfactual. Ablate a block,
re-score the response the agent actually gave, measure the log-likelihood drop. Replay and
attribution are the same engine.

## Architecture

```
voice (SmallWebRTC / Twilio)
        │
        ▼
Pipecat agent (bot-nemotron.py)  ──frame observer──▶  session JSONL  {messages, response, latencies, tool_calls}
        │                                                     │
   Nemotron (vLLM /v1)                                        ▼
        ▲                                          Attribution service (FastAPI)
        │   echo-scoring (echo=true, max_tokens=0)            │  block-split prompt
        └────────────────────────────────────────────────────┘  K parallel logprob scores → per-block drop
                                                              │
Cekura (/cekura-report) ──failures mapped to turns──▶  React viz (timeline · heatmap · replay)
```

## Tech stack

- **Agent / backend:** Python 3.11+, `uv`, Pipecat (forked from the hackathon starter `server/`).
  LLM = NVIDIA Nemotron 3 Super 120B via vLLM OpenAI-compatible endpoint. STT/TTS = Gradium.
- **Attribution service:** Python + FastAPI. Splits the system prompt into labeled blocks,
  fires K parallel echo-scoring calls to Nemotron's `/v1/completions`, returns per-block
  log-likelihood drops.
- **Visualization:** **React + TypeScript + Vite.** This is the demo — it must look gorgeous.
- **Eval:** Cekura via Claude Code MCP/skills (`/cekura-report`).

## Frontend conventions (React)

- **Vite + React + TypeScript.** `npm create vite@latest viz -- --template react-ts`.
- Three panels: **turn timeline** (Cekura pins) · **prompt heatmap** · **response + replay**.
- Live session data streams over a **WebSocket** from the Pipecat observer; render incrementally.

### Libraries — deliberately minimal, NO charting library

The two core visuals are not charts. The prompt heatmap is **colored text spans**, not a grid;
the timeline is a **clickable sequence**, not a time-series plot. Charting libs (recharts, nivo,
visx) are built for axes/series/matrices and would fight this use case all day. Don't add one.

- **`motion` (^12.40)** — animation, the highest-leverage pick. This is what makes the 60-second
  demo pop: the responsible block glowing in, the Cekura score flipping green, smooth replay
  transitions, layout animations. (Formerly `framer-motion`; the rebrand is complete — install
  the `motion` package, import from `motion/react`.) Use it everywhere.
- **`d3-scale-chromatic` (^3.1)** — heatmap color ramp. Map attribution score `t ∈ [0,1]` to a
  color with `interpolateInferno(t)` (or `interpolateViridis`). Perceptually uniform, so the hot
  block genuinely stands out; it's the recognizable "real heatmap" look that reads as credible to
  ML judges. Tiny and tree-shakeable. Use `chroma-js` instead only if you need custom brand colors.
  Avoid rainbow scales.
- **Plain React + SVG/CSS** for the timeline and heatmap structure. Tens of elements at this
  scale — no library needed. Don't reach for canvas/WebGL unless profiling says so.
- **`@xyflow/react` (React Flow, ^12.10) — STRETCH ONLY.** If you build the live pipeline-graph
  view (STT→VAD→LLM→TTS nodes lighting up as you talk), React Flow is purpose-built, gorgeous out
  of the box, and directly flatters the Pipecat judges. Do not add it until Approach A demos cleanly.

### Structure & taste

- Keep state simple: `useState`/`useReducer` + a thin WebSocket hook. No Redux for a one-day build.
- Components small and named for what they show: `TurnTimeline`, `PromptHeatmap`, `ResponsePanel`,
  `ReplayButton`. Match the surrounding file's style.
- Design taste matters more than feature count. Dark theme, generous spacing, one accent color,
  monospace for prompt/response text. The viz carries the 60-second demo — polish it.

```bash
# viz/ install line
npm install motion d3-scale-chromatic
npm install -D @types/d3-scale-chromatic
# stretch (pipeline graph only): npm install @xyflow/react
```

## Repo layout (planned)

```
server/        # forked Pipecat agent + frame observer (Python, uv)
attribution/   # FastAPI ablation-scoring service (Python)
viz/           # React + TS + Vite frontend
EMBER-DESIGN.md
CLAUDE.md
```

## Commands

```bash
# Agent (from server/)
uv sync
uv run bot-nemotron.py          # talk at http://localhost:7860

# Attribution service (from attribution/)
uv run uvicorn main:app --reload --port 8001

# Viz (from viz/)
npm install
npm run dev                     # Vite dev server

# Eval
/cekura-report                  # via Claude Code Cekura plugin
```

## Critical path — do this first

Confirm Nemotron's endpoint exposes `echo`/`prompt_logprobs` (the whole attribution method
depends on it). Spike in the first 30 minutes:

```bash
curl $NEMOTRON_LLM_URL/completions \
  -d '{"model":"'"$NEMOTRON_LLM_MODEL"'","prompt":"hello world","echo":true,"max_tokens":0,"logprobs":1}'
```

If logprobs come back → build as designed. If not → switch to the **Cekura-score-delta**
fallback immediately (ablate block → replay turn → measure Cekura score change). Decide by
minute 30, not at 4 PM.

## Working rules for this hackathon

- **Protect the 60-second demo above all.** A working minimal slice (Approach A in the design
  doc) beats a half-built replay debugger. Freeze features at 5:15 PM and rehearse.
- Author the agent's system prompt as **labeled blocks** (`## ROLE`, `## REFUND POLICY`, ...)
  so attribution has first-class units to ablate.
- Replay determinism: `temperature=0` + identical message list.
- Pre-stage the demo turn — nothing computed live on stage that can hang.

## Skill routing (gstack)

When a request matches an available skill, invoke it via the Skill tool.
- Product ideas / brainstorming → `/office-hours`
- Bugs / errors → `/investigate`
- QA / testing the viz in a browser → `/qa`
- Visual polish on the viz → `/design-review`
- Web browsing → `/browse`
