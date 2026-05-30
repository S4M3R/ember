// Live call clock. While a call is active, advances "ms since call start" in real
// time, re-anchoring to each turn's now_ms as it arrives. Drives the live playhead
// and the optimistic TTS bar (which grows until the end-of-TTS turn arrives).

import { useEffect, useRef, useState } from "react";
import type { Turn } from "./types";

export interface LiveClock {
  liveMs: number;
  ttsTurnId: string | null; // turn whose TTS bar should grow to liveMs
}

export function useLiveClock(turns: Turn[], active: boolean): LiveClock {
  const [, force] = useState(0);
  const anchor = useRef<{ nowMs: number; local: number } | null>(null);

  const latest = turns.length ? turns[turns.length - 1] : undefined;
  const latestNow = latest?.now_ms;

  // Re-sync the clock to the freshest server timestamp.
  useEffect(() => {
    if (active && latestNow != null) anchor.current = { nowMs: latestNow, local: performance.now() };
    if (!active) anchor.current = null;
  }, [latestNow, active]);

  // Tick while a call is live so the playhead / TTS bar advance smoothly.
  useEffect(() => {
    if (!active) return;
    const iv = setInterval(() => force((x) => x + 1), 80);
    return () => clearInterval(iv);
  }, [active]);

  const liveMs = anchor.current
    ? anchor.current.nowMs + (performance.now() - anchor.current.local)
    : 0;
  const ttsTurn = active ? turns.find((t) => t.tts_speaking && t.trace?.tts?.[0] != null) : undefined;
  return { liveMs, ttsTurnId: ttsTurn?.id ?? null };
}
