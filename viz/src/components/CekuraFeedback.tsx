// Top-right CHIP: Cekura's auto-evaluation of the call. When a call ends the
// agent ships the transcript to Cekura, which scores it; results stream in here
// as `{type:"cekura"}` hub messages. Collapsed to a small chip (logo + status +
// metric pips); click it to expand the per-metric breakdown. Empty until the
// first call finishes.

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle, WarningCircle, XCircle } from "@phosphor-icons/react";
import { interpolateInferno } from "d3-scale-chromatic";
import cekuraLogo from "../assets/cekura.png";
import type { CekuraFeedbackState, CekuraMetric } from "../types";

function swatch(m: CekuraMetric): string {
  if (m.pass === true) return "#1f8a65"; // --pass
  if (m.pass === false) return "#cf2d56"; // --fail
  if (m.t != null) return interpolateInferno(0.25 + 0.6 * m.t);
  return "#807d72"; // --muted (raw numeric)
}

export function CekuraFeedback({ state }: { state: CekuraFeedbackState | null }) {
  const [open, setOpen] = useState(false);
  if (!state) return null;

  const evaluating = state.status === "evaluating";
  const error = state.status === "error";
  const metrics = state.metrics;
  const expandable = !evaluating && !error && metrics.length > 0;

  return (
    <div className="cekura-chip-wrap">
      <motion.button
        type="button"
        className="cekura-chip"
        onClick={() => expandable && setOpen((o) => !o)}
        initial={{ opacity: 0, y: -6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 340, damping: 26 }}
        title={expandable ? "Cekura evaluation — click for details" : "Cekura"}
        style={{ cursor: expandable ? "pointer" : "default" }}
      >
        <img src={cekuraLogo} className="cekura-logo" alt="Cekura" />
        <span className="cekura-title">Cekura</span>
        {evaluating ? (
          <span className="cekura-status"><span className="cekura-dot" /> evaluating…</span>
        ) : error ? (
          <span className="cekura-err-tag"><WarningCircle size={12} weight="fill" /> error</span>
        ) : metrics.length === 0 ? (
          <span className="cekura-status cekura-muted">no metrics</span>
        ) : (
          <span className="cekura-pips">
            {metrics.map((m) => (
              <span key={m.name} className="cekura-pip" style={{ background: swatch(m) }} title={`${m.name}: ${m.display}`} />
            ))}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && expandable && (
          <motion.div
            className="cekura-pop"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
          >
            <div className="cekura-pop-head">
              <span>Call evaluation</span>
              {state.dashboard_url && (
                <a href={state.dashboard_url} target="_blank" rel="noreferrer">open ↗</a>
              )}
            </div>
            {metrics.map((m) => (
              <div key={m.name} className="cekura-metric">
                <span className="cekura-swatch" style={{ background: swatch(m) }} />
                <span className="cekura-name">{m.name}</span>
                <span className="cekura-value" style={{ color: swatch(m) }}>
                  {m.pass === true ? <CheckCircle size={13} weight="fill" /> : m.pass === false ? <XCircle size={13} weight="fill" /> : null}
                  {m.display}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
