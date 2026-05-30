import { RTVIEvent } from "@pipecat-ai/client-js";
import { usePipecatClient } from "@pipecat-ai/client-react";
import { Aperture } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { StageEditor } from "./components/StageEditor";
import { Timeline } from "./components/Timeline";
import { Transcript } from "./components/Transcript";
import { AGENT_OFFER_URL } from "./call";
import { buildTimeline, type StageEvent } from "./timeline";
import type { Turn } from "./types";
import { useLiveClock } from "./useLiveClock";
import { useRecordingPlayer } from "./useRecordingPlayer";
import { useSession } from "./useSession";

export default function App() {
  const { turns, recording, reset, send } = useSession();
  const player = useRecordingPlayer(recording?.url);

  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [zoom, setZoom] = useState(1);
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);

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

  // Live clock: advances during the call, grows the active TTS bar optimistically.
  const { liveMs, ttsTurnId } = useLiveClock(turns, callActive);
  const liveTts = ttsTurnId ? { turnId: ttsTurnId, endMs: liveMs } : null;
  const { events, total } = useMemo(
    () => buildTimeline(turns, recording?.durationMs ?? 0, liveTts),
    [turns, recording, liveTts?.turnId, liveTts?.endMs],
  );
  // Playhead follows live time during a call, recording position otherwise.
  const headMs = callActive ? liveMs : player.currentMs;

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
    setSelectedId(undefined);
    setZoom(1);
    setResumedFrom(null);
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
  async function resumeFrom(turn: Turn | null) {
    if (!turn || callActive) return;
    const prior = (turn.messages ?? []).filter(
      (m) => (m.role === "user" || m.role === "assistant") && m.content,
    );
    const seed = [...prior, { role: "assistant", content: turn.response }];
    if (!send({ type: "seed", messages: seed })) {
      console.error("[ember] resume: hub socket not open");
      return;
    }
    reset();
    setSelectedId(undefined);
    setResumedFrom(turn.index);
    // Let the seed reach the hub before the WebRTC handshake fires on_connected.
    await new Promise((r) => setTimeout(r, 150));
    try {
      await client.connect({ webrtcRequestParams: { endpoint: AGENT_OFFER_URL } } as never);
    } catch (e) {
      console.error("[ember] resume connect failed:", e);
    }
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
            <div className="brand-sub">an editor for voice agent calls</div>
          </div>
        </button>
      </header>

      <div className="editor-main">
        <div className="editor-top">
          <div className="stage-host">
            {selectedTurn && selectedEvent ? (
              <StageEditor kind={selectedEvent.kind} turn={selectedTurn} eventId={selectedEvent.id} />
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
            activeTurnId={selectedTurn?.id}
            onPickTurn={(turnId) => {
              const llm = events.find((e) => e.turnId === turnId && e.kind === "llm");
              if (llm) selectEvent(llm.id);
            }}
          />
        </div>

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
          canResume={turns.length > 0 && !callActive}
          onResumeHere={() => resumeFrom(selectedTurn ?? turnAtMs(headMs))}
        />
      </div>
    </div>
  );
}
