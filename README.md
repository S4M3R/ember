# Ember

**Edit, replay & debug voice agent calls.** Built for the YC Voice Agents Hackathon
(Cekura · Daily · NVIDIA · AWS · Twilio).

[![Watch the 60-second demo](https://img.youtube.com/vi/sGRjSvqLtag/maxresdefault.jpg)](https://youtu.be/sGRjSvqLtag)

▶️ **[Watch the demo (under 60s)](https://youtu.be/sGRjSvqLtag)**

---

## 1. What is this?

Ember is a debugger for voice agents — think "video editor for a phone call." You
talk to a live Pipecat agent inside the browser; Ember lays the call out as a
real-time timeline with four tracks (**STT · LLM · TTS · audio**) and a live
waveform. Click any LLM turn and you get the full call trace — the system prompt
and every message that went in, and the response that came out — all **editable**.
Change the prompt or a message, hit **Replay**, and the turn re-runs on the same
model so you see exactly what your edit changes.

The loop: **Cekura grades the call → you find the failing turn → edit the prompt →
replay → confirm the fix.** You can also branch the conversation (resume from any
point with the agent's full prior context) and hand the whole thing — your notes +
Cekura's verdict — to a Claude Code agent to draft the fix.

Real only: if the model is unreachable, the UI errors instead of fabricating.

## 2. Demo video

**[youtu.be/sGRjSvqLtag](https://youtu.be/sGRjSvqLtag)** (under 60 seconds — a demo, not narration).

## 3. How we used Cekura, Nemotron, and Pipecat

**Pipecat** is the agent. We forked the hackathon starter and run a full voice
pipeline — **Nemotron streaming STT → Nemotron-3-Super-120B (LLM) → Gradium TTS** —
over SmallWebRTC so the whole call happens in the browser. We attached a custom
**frame observer** that streams every STT/LLM/TTS frame + the call audio to Ember's
UI over a WebSocket, which is what makes the live timeline possible.

**Nemotron** does double duty:
- It's the agent's brain (Nemotron-3-Super-120B via vLLM, with `guided_json` for
  structured tool calls).
- It powers Ember's core trick — **counterfactual replay**. Because vLLM's
  `/v1/completions` exposes echo scoring (`echo=true, max_tokens=0, logprobs`), we
  get `logP(response | prompt)` in a single forward pass. We ablate each system-prompt
  block and measure the log-likelihood drop to attribute *which block drove a
  response*, and we replay edited turns at `temperature=0` to show the output flip.

**Cekura** closes the loop. When a call ends, the agent ships the transcript to
Cekura's **observability** ingest (`/observability/v1/observe/`), which scores it
against our metrics (Tool-Call Success, Unnecessary Repetition, Talk Ratio, Latency,
AI-interrupting-user, Infrastructure Issues). We poll the call log and stream the
per-metric pass/fail back into the UI as a live chip.

*What we were testing:* whether our "YC Partner" agent stays on-script, doesn't talk
over the user, and uses tools correctly. *Improvement:* Cekura is what surfaces a
real failing turn (the model is well-behaved, so you can't script a failure) — Ember
then localizes the responsible prompt block and lets you edit + replay until the
metric that was failing comes back green. The improvement story is **per-turn and
verified by Cekura** rather than a hand-waved aggregate: failing metric → edit →
replay → re-score → pass.

## 4. What we built during the hackathon

**Everything in this repo is new this hackathon**, except where noted:
- The entire **Ember UI** (React/Vite): the four-track real-time timeline, live
  transcript with word-level TTS captions, live audio waveform, the editable
  LLM call-trace, resume-from-turn branching with audio stitching, the Cekura
  feedback chip, and the "Open in Claude" hand-off.
- The **attribution service** (FastAPI): block ablation + log-likelihood scoring and
  the replay endpoint on Nemotron.
- The **frame observer + WS hub** that turns a Pipecat call into a live data feed.
- The **Cekura observability integration** (post-call scoring streamed to the UI).

**Borrowed:** the Pipecat hackathon starter (`bot-nemotron.py` skeleton), the hosted
Nemotron + Gradium endpoints, and the Cekura platform itself.

## 5. Feedback on the tools

**Nemotron-3-Super.** We picked it mainly for its **latency — it's genuinely fast**,
which matters a lot for a real-time voice loop. And it earned its keep: echo scoring + `prompt_logprobs` is the feature our whole attribution method
rests on — many hosted models won't return logprobs for an arbitrary completion
cleanly, and Nemotron does, in one pass. It's also genuinely well-behaved: it
*won't* hallucinate a refund or fall for a lazy jailbreak, which is great for
production but means a failure demo can't be scripted — you need a real adversarial
scenario. The main shortcoming we hit: **no native tool calling.** We had to lean on
`guided_json` and prompt-driven function calls to get structured tool use, which
works but is more fragile than a model with first-class tools. Wishlist: native tool
calling, per-request logprobs over the chat endpoint (not just `/completions`), and
slightly more stable results across the load-balanced fleet (we used fresh
connections per retry to dodge replica variance).

**Cekura (self-improvement loops).** The observability path is the right primitive
for a debugger: POST a finished transcript, get categorized metric verdicts back.
The Instruction-Following / critical-category breakdown is the actionable part — a
score alone wouldn't be enough to drive a fix. Friction we hit: evaluation is
**async with no webhook**, so we poll the call log (fine, but a callback would be
cleaner); some metrics are **audio-only** and silently produce no result on a
text-only transcript (we filter those out, but it's not obvious up front); and per
the API's own notes, passing `metric_ids` on ingest 500s on staging, so we evaluate
after creating the log. Reachability only bites the *simulation* path (Cekura must
dial your agent) — observability worked great for local calls.

**Pipecat.** Smooth to fork and run; SmallWebRTC made the in-browser demo trivial.
The frame observer hook was exactly the extension point we needed to tap the call.

## 6. Live link

There's no hosted demo — Ember runs locally because it needs the venue Nemotron
endpoints, a mic, and the agent process. To run it yourself, see **Run it** below.

---

## Run it

```bash
make install                 # uv sync ×2 + npm install
make attribution             # :8001  attribution + replay (real Nemotron)
cd viz && npm run dev        # :5173  the editor UI
# then run the Pipecat agent and talk to it (see server/INTEGRATION.md):
cd agent/server && uv run bot-nemotron.py
```

Open http://localhost:5173, start the call, and talk. Each turn streams in across
the four tracks; click an LLM turn to edit + replay; when the call ends, Cekura's
scores appear top-right.

## How attribution works

For a turn with response `R` and prompt blocks `{b1..bk}`:
`baseline = logP(R | full prompt)`; `drop_i = baseline − logP(R | prompt − b_i)`.
A large drop means removing that block made the agent's actual reply much less
likely — so that block caused it. Each score is one echo-scored forward pass, so
the K ablations run cheap and in parallel.

## Layout

```
agent/server/  forked Pipecat agent (Nemotron STT+LLM, Gradium TTS) + observer + Cekura observe
attribution/   FastAPI: /attribute (ablate + log-likelihood), /replay        [Python, uv]
server/        WS hub + observer + sample feed                               [Python, uv]
viz/           React + TS + motion — the editor UI                           [the demo]
```
