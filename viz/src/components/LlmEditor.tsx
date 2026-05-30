import { CaretDown, CaretRight, Play } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import * as api from "../api";
import type { Block, Message, ReplayResult, Turn } from "../types";

// Mirror the backend's render_system() so the single editor shows exactly the
// system text the model received.
function renderSystem(blocks: Block[]): string {
  return blocks
    .filter((b) => b.text.trim())
    .map((b) => `## ${b.label}\n${b.text}`.trim())
    .join("\n\n");
}

// The LLM stage as one editable call trace: the system prompt (collapsed by
// default, one free-text editor) plus the user/assistant messages — all
// editable. Replay re-runs the turn with whatever you changed.
export function LlmEditor({ turn }: { turn: Turn }) {
  const origSystem = useMemo(() => renderSystem(turn.system_blocks), [turn.system_blocks]);
  const origMsgs = useMemo<Message[]>(() => {
    const convo = (turn.messages ?? []).filter((m) => m.role !== "system");
    return convo.length ? convo : [{ role: "user", content: turn.user_text }];
  }, [turn.messages, turn.user_text]);

  const [sysOpen, setSysOpen] = useState(false);
  const [sysDraft, setSysDraft] = useState(origSystem);
  const [msgs, setMsgs] = useState<Message[]>(origMsgs);
  const [replaying, setReplaying] = useState(false);
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setSysDraft(origSystem);
    setMsgs(origMsgs);
    setSysOpen(false);
    setReplay(null);
    setError("");
  }, [turn.id, origSystem, origMsgs]);

  const sysDirty = sysDraft !== origSystem;
  const msgsDirty = JSON.stringify(msgs) !== JSON.stringify(origMsgs);
  const dirty = sysDirty || msgsDirty;

  const setMsg = (i: number, content: string) =>
    setMsgs((ms) => ms.map((m, j) => (j === i ? { ...m, content } : m)));

  async function doReplay() {
    setReplaying(true);
    setError("");
    try {
      const modified: Turn = { ...turn, messages: msgs };
      setReplay(await api.replay(modified, [], { editedSystem: sysDraft }));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setReplaying(false);
    }
  }

  const shownResponse = replay?.response ?? turn.response;
  const llmMs = turn.latencies?.llm_ms;
  const sysRows = Math.min(14, Math.max(4, sysDraft.split("\n").length));

  return (
    <div className="editor-pane">
      <div className="editor-title">
        <span className="stage-dot" style={{ background: "#7c5cd6" }} />
        LLM — call trace · edit and replay to test
      </div>

      <div className="llm-trace">
        <section className="trace-col">
          <div className="trace-head">
            input
            {llmMs != null && <span className="trace-lat mono">{Math.round(llmMs)} ms</span>}
          </div>
          <div className="trace-msgs">
            <div className="trace-msg system">
              <button className="sys-toggle" onClick={() => setSysOpen((o) => !o)}>
                {sysOpen ? <CaretDown weight="bold" size={12} /> : <CaretRight weight="bold" size={12} />}
                <span className="trace-role" style={{ margin: 0 }}>system prompt</span>
                {sysDirty && <span className="sys-dot" title="edited" />}
                <span className="sys-hint">{sysOpen ? "hide" : "edit"}</span>
              </button>
              {sysOpen && (
                <textarea
                  className="block-edit-text sys-edit"
                  value={sysDraft}
                  onChange={(e) => setSysDraft(e.target.value)}
                  rows={sysRows}
                  spellCheck={false}
                />
              )}
            </div>

            {msgs.map((m, i) => {
              const isChanged = m.content !== origMsgs[i]?.content;
              return (
                <div key={i} className={`trace-msg ${m.role} ${isChanged ? "changed" : ""}`}>
                  <div className="trace-role">
                    {m.role}
                    {isChanged && (
                      <button
                        className="block-reset"
                        title="revert this message"
                        onClick={() => setMsg(i, origMsgs[i]?.content ?? "")}
                      >
                        revert
                      </button>
                    )}
                  </div>
                  <textarea
                    className="block-edit-text"
                    value={m.content}
                    onChange={(e) => setMsg(i, e.target.value)}
                    rows={Math.min(8, Math.max(1, m.content.split("\n").length))}
                    spellCheck={false}
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section className="trace-col">
          <div className="trace-head">output{replay ? " · after edit" : ""}</div>
          <AnimatePresence mode="wait">
            <motion.div
              key={shownResponse}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`trace-msg assistant out ${replay?.changed ? "changed" : ""}`}
            >
              <div className="trace-role">assistant</div>
              <div className="trace-body">{shownResponse}</div>
            </motion.div>
          </AnimatePresence>

          <motion.button
            className="replay-btn"
            whileTap={{ scale: 0.97 }}
            disabled={replaying}
            onClick={doReplay}
          >
            {replaying ? (
              "replaying at temp 0…"
            ) : (
              <>
                <Play weight="fill" /> {dirty ? "Replay with edits" : "Replay turn"}
              </>
            )}
          </motion.button>
          {dirty && !replay && (
            <div className="muted-note">edited — replay to test what changes.</div>
          )}
          {error && <div className="heat-error">{error}</div>}
          {replay && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`fixed-banner ${replay.changed ? "" : "nochange"}`}
            >
              {replay.changed
                ? "Response changed with your edits."
                : "Same response — your edits didn't move the output."}
            </motion.div>
          )}
        </section>
      </div>
    </div>
  );
}
