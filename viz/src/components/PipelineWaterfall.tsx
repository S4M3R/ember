import { motion } from "motion/react";
import type { Latencies } from "../types";

const STAGES: { key: keyof Latencies; label: string; color: string }[] = [
  { key: "stt_ms", label: "STT", color: "#3b82c4" },
  { key: "llm_ms", label: "LLM", color: "#7c5cd6" },
  { key: "tts_ms", label: "TTS", color: "#2f8a64" },
];

export function PipelineWaterfall({ latencies }: { latencies: Latencies }) {
  const total = latencies.total_ms || STAGES.reduce((s, st) => s + (latencies[st.key] || 0), 0) || 1;
  return (
    <div className="waterfall">
      <div className="waterfall-head">
        <span>pipeline latency</span>
        <span className="mono">{latencies.total_ms ?? total} ms</span>
      </div>
      <div className="waterfall-track">
        {STAGES.map((st) => {
          const ms = latencies[st.key] || 0;
          const pct = (ms / total) * 100;
          return (
            <motion.div
              key={st.label}
              className="waterfall-seg"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ background: st.color }}
              title={`${st.label}: ${ms} ms`}
            >
              {pct > 12 && <span className="waterfall-label">{st.label} {ms}</span>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
