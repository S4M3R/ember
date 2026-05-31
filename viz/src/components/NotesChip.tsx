// Header chip (next to Cekura): the notes the agent jotted via the take_note tool
// on the LLM step. Same style as the Cekura chip — shows a count, and on hover a
// popover with the note text. Each note is also pinned on the timeline as a
// take_note tool event.

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { NotePencil } from "@phosphor-icons/react";

export interface SessionNote {
  text: string;
  turn: number; // 0-based turn index the note was taken on
}

export function NotesChip({ notes, label = "Notes" }: { notes: SessionNote[]; label?: string }) {
  const [open, setOpen] = useState(false);
  if (notes.length === 0) return null;

  return (
    <div
      className="cekura-chip-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <motion.div
        className="cekura-chip notes-chip"
        initial={{ opacity: 0, y: -6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 340, damping: 26 }}
      >
        <NotePencil size={15} weight="duotone" className="notes-ico" />
        <span className="cekura-title">{label}</span>
        <span className="notes-count">{notes.length}</span>
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="cekura-pop notes-pop"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
          >
            <div className="cekura-pop-head"><span>{label} on responses</span></div>
            {notes.map((n, i) => (
              <div key={i} className="notes-row">
                <span className="notes-bullet" title={`turn ${n.turn + 1}`}>{n.turn + 1}</span>
                <span className="notes-text">{n.text}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
