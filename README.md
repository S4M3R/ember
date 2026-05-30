# Ember

An editor for voice agent calls. Built for the YC Voice Agents Hackathon
(Cekura · Daily · NVIDIA · AWS · Twilio).

> Have a conversation with a Pipecat voice agent. Ember builds a timeline of the
> call with four tracks — **STT · LLM · TTS · audio**. Click any event to edit that
> stage: on **STT** see the confidence and edit the transcript; on **LLM** see which
> system-prompt block drove the response (ranked by Nemotron, with reasons) and edit
> it + replay; on **TTS** pick the voice. Play the **audio** track to hear the call,
> and start the call from any point on the timeline.

Real only — no mock data. If Nemotron is unavailable, the UI shows an error rather
than fabricating a result. (Cekura eval integration is deferred; see the runbook.)

See [EMBER-DESIGN.md](./EMBER-DESIGN.md) for the why and [CLAUDE.md](./CLAUDE.md)
for conventions.

## Run it (live agent — the real demo)

```bash
make install                 # uv sync x2 + npm install

# 3 terminals:
make attribution             # :8001  ranks prompt blocks + replay (real Nemotron)
cd viz && npm run dev        # :5173  the editor (starts empty)
# then run the agent and talk to it (it streams turns + audio to the viz):
#   see server/INTEGRATION.md — copy hub.py/observer.py/ember_prompt.py into the
#   official Pipecat starter, attach the observer, run bot-nemotron.py
```

Open http://localhost:5173. It starts empty ("No call yet"). Talk to the agent;
each turn streams in live across the four tracks. Click an LLM event to see the
prompt-block ranking, edit the top block, hit Replay. Click AUDIO to listen.

## Develop the UI without the agent (optional)

If you're not on the venue network, replay a recorded conversation (real transcript
+ real `say`-generated audio) to drive the UI. Attribution + replay are still real Nemotron.

```bash
make feed                    # :8765  replays shared/sample_session.json
```

## The spike that gates the real path

Attribution + replay need Nemotron reachable. Confirm it (also test guided JSON):

```bash
export NEMOTRON_LLM_URL=...   # on the venue network
make spike
```

## Layout

```
shared/        data contract + sample session (the canned demo)
attribution/   FastAPI: /attribute (ablate + log-likelihood), /replay   [Python, uv]
server/        WS hub + Pipecat observer + mock feed                    [Python, uv]
viz/           React + TS + motion + d3-scale-chromatic                 [the demo]
```

## How attribution works

For a failing turn with response `R` and system prompt blocks `{b1..bk}`:
`baseline = logP(R | full prompt)`; for each block, `drop_i = baseline − logP(R | prompt − b_i)`.
A large drop means removing that block made the agent's actual reply much less likely —
so that block caused it. Scores are max-normalized to `0..1` and rendered with
`interpolateInferno`. vLLM's `/v1/completions` echo scoring makes each call a single
forward pass (no generation), so the K ablations run cheap and in parallel.
