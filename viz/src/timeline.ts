// Build STT / LLM / TTS events on a REAL time axis (ms from call start) from each
// turn's `trace`. The audio track is the full-call stereo recording (handled
// separately), so it isn't built here. Falls back to a synthetic layout for turns
// that have no trace (e.g. older recorded samples).

import type { Turn } from "./types";

export type Stage = "stt" | "llm" | "tts" | "audio";

export interface StageEvent {
  id: string;
  turnId: string;
  index: number;
  kind: Stage;
  t0: number; // ms from call start
  t1: number;
  label: string;
}

export interface BuiltTimeline {
  events: StageEvent[];
  total: number; // ms
}

const SYNTH = { stt: 250, llm: 1200, tts: 200, gap: 350 };

export function buildTimeline(
  turns: Turn[],
  recDurationMs = 0,
  liveTts?: { turnId: string; endMs: number } | null,
): BuiltTimeline {
  const events: StageEvent[] = [];

  const haveTrace = turns.length > 0 && turns.every((t) => t.trace);
  if (haveTrace) {
    for (const t of turns) {
      const tr = t.trace!;
      // null segment (e.g. greeting has no STT) -> skip that stage's event.
      const seg = (s: [number | null, number | null], fb: number): [number, number] | null => {
        if (!s || (s[0] == null && s[1] == null)) return null;
        const a = s[0] ?? fb;
        const b = s[1] ?? a;
        return [a, Math.max(b, a + 40)];
      };
      const stt = seg(tr.stt, 0);
      const llm = seg(tr.llm, stt ? stt[1] : 0);
      let tts = seg(tr.tts, llm ? llm[1] : stt ? stt[1] : 0);
      // Optimistic TTS: while the agent is speaking, grow the bar to live time.
      if (liveTts && liveTts.turnId === t.id && tr.tts?.[0] != null) {
        tts = [tr.tts[0]!, Math.max(liveTts.endMs, tr.tts[0]! + 40)];
      }
      if (stt) events.push({ id: `${t.id}-stt`, turnId: t.id, index: t.index, kind: "stt", t0: stt[0], t1: stt[1], label: t.user_text });
      if (llm) events.push({ id: `${t.id}-llm`, turnId: t.id, index: t.index, kind: "llm", t0: llm[0], t1: llm[1], label: t.response });
      if (tts) events.push({ id: `${t.id}-tts`, turnId: t.id, index: t.index, kind: "tts", t0: tts[0], t1: tts[1], label: t.response });
    }
  } else {
    // synthetic fallback (no real timestamps)
    let cursor = 0;
    for (const t of turns) {
      const stt = t.latencies.stt_ms ?? SYNTH.stt;
      const llm = t.latencies.llm_ms ?? SYNTH.llm;
      const tts = t.latencies.tts_ms ?? SYNTH.tts;
      const sttT0 = cursor, llmT0 = sttT0 + stt, ttsT0 = llmT0 + llm;
      events.push({ id: `${t.id}-stt`, turnId: t.id, index: t.index, kind: "stt", t0: sttT0, t1: llmT0, label: t.user_text });
      events.push({ id: `${t.id}-llm`, turnId: t.id, index: t.index, kind: "llm", t0: llmT0, t1: ttsT0, label: t.response });
      events.push({ id: `${t.id}-tts`, turnId: t.id, index: t.index, kind: "tts", t0: ttsT0, t1: ttsT0 + tts, label: t.response });
      cursor = ttsT0 + tts + SYNTH.gap;
    }
  }

  const maxT1 = events.reduce((m, e) => Math.max(m, e.t1), 0);
  const total = Math.max(maxT1, recDurationMs, 1);
  return { events, total };
}

export const STAGE_LABEL: Record<Stage, string> = { stt: "STT", llm: "LLM", tts: "TTS", audio: "AUDIO" };
export const STAGE_COLOR: Record<Stage, string> = {
  stt: "#3b82c4",
  llm: "#7c5cd6",
  tts: "#2f8a64",
  audio: "#a06a1f",
};
