import { Play } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import * as api from "../api";
import type { AttributionResult, Block, ReplayResult, Turn } from "../types";
import { PromptHeatmap } from "./PromptHeatmap";

// The LLM stage: rank which system-prompt block drove the response, edit the
// top block, replay on Nemotron, see the response change. All real.
export function LlmEditor({ turn }: { turn: Turn }) {
  const [attrib, setAttrib] = useState<AttributionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [blockId, setBlockId] = useState<string | undefined>();
  const [draft, setDraft] = useState("");
  const [replaying, setReplaying] = useState(false);
  const [replay, setReplay] = useState<ReplayResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setReplay(null);
    api
      .attribute(turn)
      .then((res) => {
        if (cancelled) return;
        setAttrib(res);
        setBlockId(res.blocks[0]?.id);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setAttrib(null);
        setError(String(e?.message ?? e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [turn.id]);

  const editBlock: Block | null =
    (blockId && turn.system_blocks.find((b) => b.id === blockId)) || null;

  useEffect(() => {
    setDraft(editBlock?.text ?? "");
  }, [editBlock?.id, turn.id]);

  async function doReplay() {
    if (!editBlock) return;
    setReplaying(true);
    try {
      const res = await api.replay(turn, [{ ...editBlock, text: draft }]);
      setReplay(res);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setReplaying(false);
    }
  }

  const shownResponse = replay?.response ?? turn.response;

  return (
    <div className="editor-pane">
      <div className="editor-title">
        <span className="stage-dot" style={{ background: "#7c5cd6" }} />
        LLM — which prompt block drove this response
      </div>

      <div className="llm-grid">
        <PromptHeatmap
          blocks={turn.system_blocks}
          attribution={attrib}
          loading={loading}
          error={error}
          selectedBlock={blockId}
          onSelectBlock={setBlockId}
        />

        <div className="llm-right">
          <div className="resp-label">agent response{replay ? " (after edit)" : ""}</div>
          <AnimatePresence mode="wait">
            <motion.div
              key={shownResponse}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`resp-text ${replay?.changed ? "resp-fixed" : ""}`}
            >
              {shownResponse}
            </motion.div>
          </AnimatePresence>

          <div className="editor">
            <div className="editor-head">
              Edit block {editBlock ? <code>## {editBlock.label}</code> : "—"} and replay
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!editBlock}
              rows={5}
              spellCheck={false}
            />
            <motion.button
              className="replay-btn"
              whileTap={{ scale: 0.97 }}
              disabled={!editBlock || replaying}
              onClick={doReplay}
            >
              {replaying ? (
                "replaying at temp 0…"
              ) : (
                <>
                  <Play weight="fill" /> Replay turn with edit
                </>
              )}
            </motion.button>
            {replay?.changed && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="fixed-banner"
              >
                Response changed — one block edited.
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
