// Session feed. Turns + the full-call stereo recording arrive over the WS hub
// (ws://localhost:8765) from the live agent. No mock data path.

import { useCallback, useEffect, useRef, useState } from "react";
import { stitchRecordings, trimRecording } from "./stitchAudio";
import type { CekuraFeedbackState, Recording, Turn } from "./types";

const WS_URL = (import.meta.env.VITE_WS_URL as string) || "ws://localhost:8765";

export type ConnState = "connecting" | "live" | "closed";

export interface SessionState {
  turns: Turn[];
  recording: Recording | null;
  cekura: CekuraFeedbackState | null;
  conn: ConnState;
  reset: () => void;
  // Send a control message back to the hub (e.g. the resume seed).
  send: (obj: unknown) => boolean;
  truncateAfter: (turnId: string) => void;
  // On "resume from here": stitch the continuation's recording onto the prior one
  // at offsetMs, so playback is one continuous clip (prior up to the branch, then
  // the continuation). Pass the same offset the agent shifts its clock by.
  armStitch: (offsetMs: number) => void;
}

export function useSession(): SessionState {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [cekura, setCekura] = useState<CekuraFeedbackState | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const recordingRef = useRef<Recording | null>(null);
  recordingRef.current = recording;
  // On "resume from here": the prior recording to stitch the continuation onto,
  // and the branch offset. Null when not resuming (recording replaces normally).
  const stitchBaseRef = useRef<string | null>(null);
  const stitchOffsetRef = useRef(0);

  // Upsert by id: partial turns stream in stage-by-stage (STT, then LLM, then
  // TTS) and the final emit replaces the partial with complete data.
  function addTurn(t: Turn) {
    setTurns((prev) => {
      const i = prev.findIndex((x) => x.id === t.id);
      if (i === -1) return [...prev, t];
      const copy = prev.slice();
      copy[i] = t;
      return copy;
    });
  }

  // Wipe accumulated session data for a clean restart. The WS stays connected,
  // so new turns/recording stream straight back in.
  const reset = useCallback(() => {
    setTurns([]);
    setRecording(null);
    setCekura(null);
    stitchBaseRef.current = null;
    stitchOffsetRef.current = 0;
  }, []);

  // Capture the current recording as the base to stitch the continuation onto,
  // then trim the *displayed* recording to the branch point so the audio after it
  // is dropped immediately — before the continuation is recorded. The untrimmed
  // base is what the continuation later splices onto (stitchRecordings re-clips).
  const armStitch = useCallback((offsetMs: number) => {
    const base = recordingRef.current?.url ?? null;
    stitchBaseRef.current = base;
    stitchOffsetRef.current = offsetMs;
    if (base) {
      trimRecording(base, offsetMs)
        .then((url) => setRecording({ url, durationMs: offsetMs }))
        .catch(() => {/* keep the full recording if trimming fails */});
    }
  }, []);

  // Send a control message to the hub. Returns false if the socket isn't open.
  const send = useCallback((obj: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(obj));
    return true;
  }, []);

  // Keep turns up to and including the given turn; drop everything after it.
  // Used by "resume from here" so the prior conversation stays on the timeline.
  const truncateAfter = useCallback((turnId: string) => {
    setTurns((prev) => {
      const i = prev.findIndex((t) => t.id === turnId);
      return i === -1 ? prev : prev.slice(0, i + 1);
    });
  }, []);


  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const open = () => {
      setConn("connecting");
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => setConn("live");
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "turn") addTurn(msg.turn as Turn);
          else if (msg.type === "recording") {
            const base = stitchBaseRef.current;
            if (base) {
              // Resuming: splice the continuation onto the prior recording.
              stitchRecordings(base, msg.audio, stitchOffsetRef.current)
                .then((url) => setRecording({ url, durationMs: msg.duration_ms }))
                .catch(() => setRecording({ url: msg.audio, durationMs: msg.duration_ms }));
            } else {
              setRecording({ url: msg.audio, durationMs: msg.duration_ms });
            }
          }
          else if (msg.type === "cekura")
            setCekura({
              status: msg.status,
              metrics: msg.metrics ?? [],
              call_log_id: msg.call_log_id,
              dashboard_url: msg.dashboard_url,
              message: msg.message,
            });
        } catch {
          /* ignore malformed */
        }
      };
      ws.onclose = () => {
        setConn("closed");
        if (!closed) retry = setTimeout(open, 1500);
      };
      ws.onerror = () => ws?.close();
    };
    open();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { turns, recording, cekura, conn, reset, send, truncateAfter, armStitch };
}
