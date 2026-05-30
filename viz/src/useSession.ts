// Session feed. Turns + the full-call stereo recording arrive over the WS hub
// (ws://localhost:8765) from the live agent. No mock data path.

import { useCallback, useEffect, useState } from "react";
import type { Recording, Turn } from "./types";

const WS_URL = (import.meta.env.VITE_WS_URL as string) || "ws://localhost:8765";

export type ConnState = "connecting" | "live" | "closed";

export interface SessionState {
  turns: Turn[];
  recording: Recording | null;
  conn: ConnState;
  reset: () => void;
}

export function useSession(): SessionState {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");

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
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const open = () => {
      setConn("connecting");
      ws = new WebSocket(WS_URL);
      ws.onopen = () => setConn("live");
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "turn") addTurn(msg.turn as Turn);
          else if (msg.type === "recording")
            setRecording({ url: msg.audio, durationMs: msg.duration_ms });
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

  return { turns, recording, conn, reset };
}
