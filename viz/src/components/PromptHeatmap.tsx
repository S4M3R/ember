import { interpolateInferno } from "d3-scale-chromatic";
import { motion } from "motion/react";
import type { AttributionResult, Block } from "../types";

// inferno: perceptually-uniform, dark->bright. The responsible block glows.
function heatColor(score: number): string {
  return interpolateInferno(0.08 + 0.84 * score);
}

function readableText(rgb: string): string {
  const m = rgb.match(/\d+/g);
  if (!m) return "#fff";
  const [r, g, b] = m.map(Number);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1a0b00" : "#fff";
}

export function PromptHeatmap({
  blocks,
  attribution,
  loading,
  error,
  selectedBlock,
  onSelectBlock,
}: {
  blocks: Block[];
  attribution: AttributionResult | null;
  loading: boolean;
  error?: string;
  selectedBlock?: string;
  onSelectBlock: (id: string) => void;
}) {
  const scoreById: Record<string, number> = {};
  const reasonById: Record<string, string> = {};
  if (attribution)
    for (const b of attribution.blocks) {
      scoreById[b.id] = b.score;
      if (b.reason) reasonById[b.id] = b.reason;
    }

  // order by influence when we have attribution
  const ordered = attribution
    ? [...blocks].sort((a, b) => (scoreById[b.id] ?? 0) - (scoreById[a.id] ?? 0))
    : blocks;
  const topId = attribution?.blocks[0]?.id;

  return (
    <div className="heatmap">
      <div className="col-head">
        System prompt — attribution
        {attribution && (
          <span className={`method-chip ${attribution.method}`}>{attribution.method}</span>
        )}
      </div>

      {loading && <div className="heat-loading">ranking blocks with Nemotron…</div>}
      {error && !attribution && <div className="heat-error">attribution failed: {error}</div>}

      <div className="heat-list">
        {ordered.map((b) => {
          const score = scoreById[b.id] ?? 0;
          const bg = attribution ? heatColor(score) : "#fafaf7";
          const fg = attribution ? readableText(bg) : "#5a5852";
          const isTop = attribution != null && b.id === topId && score > 0.15;
          return (
            <motion.button
              layout
              key={b.id}
              onClick={() => onSelectBlock(b.id)}
              className={`heat-block ${selectedBlock === b.id ? "picked" : ""}`}
              style={{ background: bg, color: fg }}
              animate={
                isTop
                  ? { boxShadow: [`0 0 0px ${bg}`, `0 0 26px ${bg}`, `0 0 6px ${bg}`] }
                  : { boxShadow: "0 0 0px rgba(0,0,0,0)" }
              }
              transition={isTop ? { duration: 1.6, repeat: Infinity } : { duration: 0.3 }}
            >
              <div className="heat-block-head">
                <span className="heat-label">## {b.label}</span>
                {attribution && (
                  <span className="heat-score mono">{Math.round(score * 100)}%</span>
                )}
              </div>
              <div className="heat-text">{b.text}</div>
              {reasonById[b.id] && (
                <div className="heat-reason" style={{ color: fg }}>↳ {reasonById[b.id]}</div>
              )}
              {attribution && (
                <div className="heat-bar-track">
                  <motion.div
                    className="heat-bar"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round(score * 100)}%` }}
                    transition={{ duration: 0.5 }}
                    style={{ background: fg === "#fff" ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.45)" }}
                  />
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      {!attribution && !loading && (
        <div className="heat-hint">Select a turn to see which prompt block drove the reply.</div>
      )}
    </div>
  );
}
