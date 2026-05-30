import { RTVIEvent } from "@pipecat-ai/client-js";
import { usePipecatClient } from "@pipecat-ai/client-react";
import { Aperture } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { StageEditor } from "./components/StageEditor";
import { Timeline } from "./components/Timeline";
import { Transcript } from "./components/Transcript";
import { buildTimeline, type StageEvent } from "./timeline";
import { useLiveClock } from "./useLiveClock";
import { useRecordingPlayer } from "./useRecordingPlayer";
import { useSession } from "./useSession";

export default function App() {
  const { turns, recording, conn, reset } = useSession();
  const player = useRecordingPlayer(recording?.url);

  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [zoom, setZoom] = useState(1);

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
        <div className="status">
          <span className="stat"><b>{turns.length}</b> turns</span>
          <span className={`conn conn-${conn}`}><span className="dot" /> {conn}</span>
        </div>
      </header>

      <div className="editor-main">
        <div className="editor-top">
          <div className="stage-host">
            {selectedTurn && selectedEvent ? (
              <StageEditor kind={selectedEvent.kind} turn={selectedTurn} />
            ) : turns.length === 0 ? (
              <div className="stage-empty">
                <div className="empty-big">No call yet</div>
                <p>Start talking to the agent — every turn streams in here live, split into
                STT, LLM, TTS, and a stereo recording on a real-time timeline. Click any event
                below to edit that stage.</p>
                <p className="muted-note">
                  status: <b>{conn}</b> · listening on the agent's event stream
                </p>
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
        />
      </div>
    </div>
  );
}
