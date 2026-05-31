import { RTVIEvent } from "@pipecat-ai/client-js";
import { usePipecatClient } from "@pipecat-ai/client-react";
import { Aperture } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CekuraFeedback } from "./components/CekuraFeedback";
import { NotesChip, type SessionNote } from "./components/NotesChip";
import { OpenInClaude } from "./components/OpenInClaude";
import { StageEditor } from "./components/StageEditor";
import { Timeline } from "./components/Timeline";
import { Transcript } from "./components/Transcript";
import type { DelegatePayload } from "./api";
import { buildTimeline, type StageEvent } from "./timeline";
import type { Turn } from "./types";
import { useLiveClock } from "./useLiveClock";
import { useLiveWaveform } from "./useLiveWaveform";
import { useRecordingPlayer } from "./useRecordingPlayer";
import { useSession } from "./useSession";

export default function App() {
  const { turns, recording, cekura, conn, reset, send, truncateAfter, armStitch } = useSession();
  const player = useRecordingPlayer(recording?.url);

  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [zoom, setZoom] = useState(1);
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);
  // The branch offset (ms) of an armed/active resume: where the prior audio ends
  // and the live continuation begins on the timeline. 0 = no branch (fresh call).
  const [resumeOffset, setResumeOffset] = useState(0);

  // Track whether a call is active (disable "play call" + drive the live clock).
  const client = usePipecatClient();
  const [callActive, setCallActive] = useState(false);
  useEffect(() => {
    const onState = (s: unknown) => {
      const st = String(s);
      setCallActive(["connecting", "connected", "ready", "authenticating", "initializing"].includes(st));
    };
    client.on(RTVIEvent.TransportStateChanged, onState);
    return () => client.off(RTVIEvent.TransportStateChanged, onState);
  }, [client]);

  // Once the (resumed) call actually starts, drop the "armed" banner.
  useEffect(() => {
    if (callActive) setResumedFrom(null);
  }, [callActive]);

  // Live audio waveform: taps the call's audio tracks while connected.
  const liveWave = useLiveWaveform(client, callActive);

  // Live clock: advances during the call, grows the active TTS bar optimistically.
  const { liveMs, ttsTurnId } = useLiveClock(turns, callActive);
  const liveTts = ttsTurnId ? { turnId: ttsTurnId, endMs: liveMs } : null;
  const { events, total } = useMemo(
    () => buildTimeline(turns, recording?.durationMs ?? 0, liveTts),
    [turns, recording, liveTts?.turnId, liveTts?.endMs],
  );
  // Playhead follows live time during a call, recording position otherwise.
  const headMs = callActive ? liveMs : player.currentMs;

  // User feedback on individual LLM responses, authored in the LLM tab and keyed
  // by turn id. Lifted here so the header chip, timeline marker, and Claude
  // hand-off all share it.
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const setFeedbackFor = useCallback((turnId: string, text: string) => {
    setFeedback((f) => {
      const next = { ...f };
      if (text.trim()) next[turnId] = text;
      else delete next[turnId];
      return next;
    });
  }, []);
  const feedbackTurns = useMemo(() => new Set(Object.keys(feedback)), [feedback]);

  // Feedback notes for the header chip, ordered by turn.
  const notes = useMemo<SessionNote[]>(() => {
    return Object.entries(feedback)
      .map(([turnId, text]) => ({ text, turn: turns.find((t) => t.id === turnId)?.index ?? 0 }))
      .sort((a, b) => a.turn - b.turn);
  }, [feedback, turns]);

  // The partner's final verdict, if it reached one (from the final_report tool).
  const verdict = useMemo<string | undefined>(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const fr = (turns[i].tool_calls ?? []).find((tc) => tc.name === "final_report");
      if (fr?.result) return fr.result;
    }
    return undefined;
  }, [turns]);

  // Build the Claude hand-off payload lazily (fresh at click time).
  const buildDelegatePayload = (): DelegatePayload => ({
    notes: notes.map((n) => `(turn ${n.turn + 1}) ${n.text}`),
    cekura,
    verdict,
    transcript: turns.flatMap((t) => {
      const rows: { role: string; text: string }[] = [];
      if (t.user_text?.trim()) rows.push({ role: "Testing Agent", text: t.user_text.trim() });
      if (t.response?.trim()) rows.push({ role: "Main Agent", text: t.response.trim() });
      return rows;
    }),
  });

  // No auto-select: the stage editor stays empty until you click a timeline event.

  const selectedEvent: StageEvent | null = events.find((e) => e.id === selectedId) ?? null;
  const selectedTurn = selectedEvent
    ? turns.find((t) => t.id === selectedEvent.turnId) ?? null
    : null;

  // Selecting a stage event also moves the playhead to that stage's real time.
  function selectEvent(id: string) {
    setSelectedId(id);
    const ev = events.find((e) => e.id === id);
    if (ev) player.seekMs(ev.t0);
  }

  // Tap the logo to wipe everything and restart the demo with clean data.
  function restart() {
    if (player.playing) player.toggle();
    player.seekMs(0);
    reset();
    send({ type: "seed_clear" }); // drop any armed branch so it can't leak into the next call
    setFeedback({});
    setSelectedId(undefined);
    setZoom(1);
    setResumedFrom(null);
    setResumeOffset(0);
  }

  // The turn the playhead is sitting in (or just before) — the branch point.
  function turnAtMs(ms: number): Turn | null {
    if (turns.length === 0) return null;
    const sorted = [...turns].sort((a, b) => (a.now_ms ?? 0) - (b.now_ms ?? 0));
    for (const t of sorted) if ((t.now_ms ?? 0) >= ms) return t;
    return sorted[sorted.length - 1];
  }

  // Resume the conversation from a chosen turn: seed the agent with the history
  // through that turn, wipe the canvas, and start a fresh call. The partner keeps
  // every prior message in context; you continue from that one point.
  // Arm a branch: seed the agent with history through this turn, trim the
  // timeline to that point, and keep the prior audio. Does NOT start the call —
  // the user presses Start call to continue from here.
  async function resumeFrom(turn: Turn | null) {
    if (!turn || callActive) return;
    const prior = (turn.messages ?? []).filter(
      (m) => (m.role === "user" || m.role === "assistant") && m.content,
    );
    const seed = [...prior, { role: "assistant", content: turn.response }];
    // The continuation should land AFTER the branch point on the timeline, not
    // overlap at t=0 — so the agent offsets its clock by the branch turn's end.
    const offsetMs = Math.round((turn.now_ms ?? turn.trace?.tts?.[1] ?? 0) + 600);
    // The hub WS can be briefly down right after a call ends; retry until it
    // reconnects (useSession auto-reconnects within ~1.5s).
    let ok = false;
    for (let i = 0; i < 15 && !ok; i++) {
      ok = send({ type: "seed", messages: seed, offset_ms: offsetMs });
      if (!ok) await new Promise((r) => setTimeout(r, 200));
    }
    console.log(`[ember] resume armed: seed ${seed.length} msgs, offset ${offsetMs}ms, ok=${ok}, conn=${conn}`);
    if (!ok) {
      console.error("[ember] resume: hub socket never opened — cannot seed");
      return;
    }
    truncateAfter(turn.id);   // keep the conversation up to the branch point
    armStitch(offsetMs);      // trim the audio here; splice the continuation on later
    setSelectedId(undefined);
    setResumedFrom(turn.index);
    setResumeOffset(offsetMs); // anchor the live waveform after the branch point
    // Park the playhead at the branch point — where the conversation will continue.
    if (player.playing) player.toggle();
    player.seekMs(offsetMs);
  }

  // Cancel an armed branch (before pressing Start call).
  function cancelResume() {
    send({ type: "seed_clear" });
    setResumedFrom(null);
    setResumeOffset(0);
  }

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="brand"
          onClick={restart}
          title="Reset — clear the call and restart with clean data"
        >
          <Aperture className="logo" weight="duotone" size={26} />
          <div>
            <div className="brand-name">Ember</div>
            <div className="brand-sub">edit, replay & debug voice agent calls</div>
          </div>
        </button>
        <div className="topbar-right">
          <NotesChip notes={notes} label="Feedback" />
          <CekuraFeedback state={cekura} />
          <OpenInClaude
            build={buildDelegatePayload}
            disabled={notes.length === 0 && !cekura}
          />
        </div>
      </header>

      <div className="editor-main">
        <div className="editor-top">
          <div className="stage-host">
            {selectedTurn && selectedEvent ? (
              <StageEditor
                kind={selectedEvent.kind}
                turn={selectedTurn}
                eventId={selectedEvent.id}
                feedback={feedback[selectedTurn.id] ?? ""}
                onFeedback={(text) => setFeedbackFor(selectedTurn.id, text)}
              />
            ) : turns.length === 0 ? (
              <div className="stage-empty">
                <div className="empty-big">{resumedFrom != null ? "Resuming…" : "No call yet"}</div>
                {resumedFrom != null ? (
                  <p>Resumed from turn {resumedFrom + 1}. The partner remembers everything up to
                  that point — keep talking to continue this branch. New turns stream in below.</p>
                ) : (
                  <p>Start talking to the agent — every turn streams in here live, split into
                  STT, LLM, TTS, and a stereo recording on a real-time timeline. Click any event
                  below to edit that stage.</p>
                )}
                <p className="muted-note">listening on the agent's event stream</p>
              </div>
            ) : (
              <div className="stage-empty">Click an event on the timeline to edit that stage.</div>
            )}
          </div>
          <Transcript
            turns={turns}
            resuming={resumedFrom != null}
            activeTurnId={selectedTurn?.id}
            onPickTurn={(turnId) => {
              const llm = events.find((e) => e.turnId === turnId && e.kind === "llm");
              if (llm) selectEvent(llm.id);
            }}
          />
        </div>

        {resumedFrom != null && !callActive && (
          <div className="resume-banner">
            <span>
              <b>Branch armed</b> from turn {resumedFrom + 1} — press <b>Start call</b> to
              continue. The partner remembers everything up to here.
            </span>
            <button className="resume-cancel" onClick={cancelResume}>Cancel</button>
          </div>
        )}

        <Timeline
          events={events}
          total={total}
          zoom={zoom}
          onZoom={setZoom}
          selectedId={selectedId}
          onSelect={selectEvent}
          playing={player.playing}
          live={callActive}
          currentMs={headMs}
          onTogglePlay={player.toggle}
          onSeek={player.seekMs}
          hasRecording={!!recording && !callActive}
          recordingUrl={recording?.url}
          recordingDurationMs={recording?.durationMs}
          liveWave={liveWave}
          liveStartMs={resumeOffset}
          feedbackTurns={feedbackTurns}
          canResume={turns.length > 0 && !callActive}
          onResumeHere={() => resumeFrom(selectedTurn ?? turnAtMs(headMs))}
        />
      </div>
    </div>
  );
}
