// Top-right "Open in Claude" button. Hands the call off to Claude Code: posts the
// Cekura result + the agent's notes to the attribution service, which opens a
// terminal running `claude` seeded with that context. Styled like the chips.

import { useState } from "react";
import { TerminalWindow } from "@phosphor-icons/react";
import { delegateToClaude, type DelegatePayload } from "../api";

type S = "idle" | "opening" | "done" | "error";

export function OpenInClaude({
  build,
  disabled,
}: {
  build: () => DelegatePayload;
  disabled?: boolean;
}) {
  const [state, setState] = useState<S>("idle");

  async function go() {
    if (state === "opening") return;
    setState("opening");
    try {
      await delegateToClaude(build());
      setState("done");
      setTimeout(() => setState("idle"), 2600);
    } catch (e) {
      console.error("[ember] delegate to Claude failed:", e);
      setState("error");
      setTimeout(() => setState("idle"), 3200);
    }
  }

  const label =
    state === "opening" ? "opening…" : state === "done" ? "opened ✓" : state === "error" ? "failed" : "Open in Claude";

  return (
    <button
      type="button"
      className="claude-btn"
      onClick={go}
      disabled={disabled || state === "opening"}
      title="Open a terminal with Claude, seeded with this call's Cekura result and the agent's notes"
    >
      <TerminalWindow size={15} weight="bold" />
      <span>{label}</span>
    </button>
  );
}
