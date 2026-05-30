import { Play, SpeakerHigh, Waveform } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import * as api from "../api";
import type { Stage } from "../timeline";
import type { ReplayResult, SynthesizeResult, Turn } from "../types";
import { LlmEditor } from "./LlmEditor";

// Gradium flagship voices (real voice_ids from the Gradium voice library).
// The agent's own turn voice (turn.voice) is added on top as "current" so the
// picked-by-default chip matches what actually spoke the line.
const VOICES = [
  { id: "YTpq7expH9539ERJ", label: "Emma", hint: "US · smooth female" },
  { id: "KWJiFWu2O9nMPYcR", label: "John", hint: "US · warm low male" },
  { id: "jtEKaLYNn6iif5PR", label: "Sydney", hint: "US · airy female" },
  { id: "LFZvm12tW_z0xfGo", label: "Kent", hint: "US · relaxed male" },
  { id: "ubuXFxVQwVYnZQhy", label: "Eva", hint: "GB · dynamic female" },
  { id: "m86j6D7UZpGzHsNu", label: "Jack", hint: "GB · helpful male" },
  { id: "axlOaUiFyOZhy4nv", label: "Leo 🇫🇷🥖", hint: "FR · warm male" },
];

export function StageEditor({
  kind,
  turn,
  eventId,
}: {
  kind: Stage;
  turn: Turn;
  eventId?: string;
}) {
  if (kind === "llm") return <LlmEditor turn={turn} />;
  if (kind === "stt") return <SttEditor turn={turn} />;
  if (kind === "tool") return <ToolEditor turn={turn} eventId={eventId} />;
  return <TtsEditor turn={turn} />;
}

// TOOL stage: show the tool call's name, arguments, and result.
function ToolEditor({ turn, eventId }: { turn: Turn; eventId?: string }) {
  const idx = parseInt(eventId?.match(/-tool-(\d+)$/)?.[1] ?? "0", 10);
  const tc = turn.tool_calls?.[idx];
  if (!tc) {
    return (
      <div className="editor-pane">
        <div className="editor-title">
          <span className="stage-dot" style={{ background: "#0d9488" }} /> TOOL
        </div>
        <div className="heat-hint">No tool data on this event.</div>
      </div>
    );
  }
  const dur = tc.t0 != null && tc.t1 != null ? `${tc.t1 - tc.t0} ms` : "";
  return (
    <div className="editor-pane">
      <div className="editor-title">
        <span className="stage-dot" style={{ background: "#0d9488" }} />
        TOOL — <code>{tc.name}</code>
        {dur && <span className="muted-note" style={{ margin: 0 }}>· {dur}</span>}
      </div>
      <div className="resp-label">arguments</div>
      <div className="resp-text mono">{tc.args || "—"}</div>
      <div className="resp-label" style={{ marginTop: 12 }}>result</div>
      <div className="resp-text mono">{tc.result || "—"}</div>
    </div>
  );
}

// STT stage: confidence + edit the transcript + re-run the agent on the new words.
function SttEditor({ turn }: { turn: Turn }) {
  const [text, setText] = useState(turn.user_text);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setText(turn.user_text);
    setResult(null);
    setError("");
  }, [turn.id]);

  const conf = turn.stt_confidence;

  async function rerun() {
    setRunning(true);
    setError("");
    try {
      // Replace the last user message with the edited transcript, re-run the LLM.
      const msgs = [...turn.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "user") {
          msgs[i] = { ...msgs[i], content: text };
          break;
        }
      }
      const modified: Turn = { ...turn, user_text: text, messages: msgs };
      setResult(await api.replay(modified, []));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="editor-pane">
      <div className="editor-title">
        <span className="stage-dot" style={{ background: "#3b82c4" }} />
        STT — what the caller said
      </div>

      <div className="conf-row">
        <span className="conf-label">confidence</span>
        {conf != null ? (
          <>
            <div className="conf-bar-track">
              <div className="conf-bar" style={{ width: `${Math.round(conf * 100)}%` }} />
            </div>
            <span className="mono conf-val">{Math.round(conf * 100)}%</span>
          </>
        ) : (
          <span className="muted-note">not provided by the STT service</span>
        )}
      </div>

      <div className="editor-head">transcript (edit and re-run the agent)</div>
      <textarea
        className="stt-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        spellCheck={false}
      />
      <motion.button
        className="replay-btn"
        whileTap={{ scale: 0.97 }}
        disabled={running}
        onClick={rerun}
      >
        {running ? (
          "re-running the agent…"
        ) : (
          <>
            <Play weight="fill" /> Re-run agent on this transcript
          </>
        )}
      </motion.button>
      {error && <div className="heat-error">{error}</div>}

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="resp-label">agent now responds</div>
            <div className="resp-text resp-fixed">{result.response}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// TTS stage: pick a voice and re-speak the same line through Gradium TTS.
function TtsEditor({ turn }: { turn: Turn }) {
  // Offer the turn's own voice as "current" alongside the flagship library.
  const voices =
    turn.voice && !VOICES.some((v) => v.id === turn.voice)
      ? [{ id: turn.voice, label: "Current", hint: "voice that spoke this turn" }, ...VOICES]
      : VOICES;

  const [voice, setVoice] = useState(turn.voice ?? voices[0].id);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SynthesizeResult | null>(null);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    setVoice(turn.voice ?? voices[0].id);
    setResult(null);
    setError("");
  }, [turn.id]);

  const pickedLabel = voices.find((v) => v.id === voice)?.label ?? voice;

  async function resynthesize() {
    setRunning(true);
    setError("");
    try {
      const out = await api.synthesize(turn.response, voice);
      setResult(out);
      // The button click is a user gesture, so autoplay-with-sound is allowed.
      requestAnimationFrame(() => audioRef.current?.play().catch(() => {}));
    } catch (e) {
      setResult(null);
      setError(String((e as Error)?.message ?? e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="editor-pane">
      <div className="editor-title">
        <span className="stage-dot" style={{ background: "#2f8a64" }} />
        TTS — how the agent speaks
      </div>

      <div className="resp-label">spoken text</div>
      <div className="resp-text">{turn.response}</div>

      <div className="editor-head">voice — pick one and re-speak this exact line</div>
      <div className="voice-grid">
        {voices.map((v) => (
          <button
            key={v.id}
            className={`voice-chip ${voice === v.id ? "picked" : ""}`}
            title={v.hint}
            onClick={() => {
              setVoice(v.id);
              setResult(null);
              setError("");
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      <motion.button
        className="replay-btn"
        whileTap={{ scale: 0.97 }}
        disabled={running}
        onClick={resynthesize}
      >
        {running ? (
          <>
            <Waveform weight="fill" className="spin-pulse" /> Synthesizing in {pickedLabel}…
          </>
        ) : (
          <>
            <Play weight="fill" /> Re-synthesize in {pickedLabel}
          </>
        )}
      </motion.button>
      {error && <div className="heat-error">{error}</div>}

      <AnimatePresence>
        {result && (
          <motion.div
            className="resynth-card"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="resynth-head">
              <SpeakerHigh weight="fill" />
              <span>
                {pickedLabel} · {(result.duration_ms / 1000).toFixed(1)}s
              </span>
            </div>
            <audio
              ref={audioRef}
              className="resynth-audio"
              src={result.audio}
              controls
              autoPlay
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
