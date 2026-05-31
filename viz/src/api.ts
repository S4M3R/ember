// Attribution + replay client. Real only — if the backend or Nemotron is down,
// these throw and the UI shows an error (no fabricated results).

import type { AttributionResult, Block, ReplayResult, SynthesizeResult, Turn } from "./types";

const BASE = (import.meta.env.VITE_ATTRIBUTION_URL as string) || "http://localhost:8001";

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`${path} ${r.status} ${detail}`);
  }
  return (await r.json()) as T;
}

export async function attribute(turn: Turn): Promise<AttributionResult> {
  return post<AttributionResult>("/attribute", turn); // default method=llm
}

export async function replay(
  turn: Turn,
  editedBlocks: Block[] = [],
  opts?: { editedSystem?: string },
): Promise<ReplayResult> {
  return post<ReplayResult>("/replay", {
    turn,
    edited_blocks: editedBlocks,
    edited_system: opts?.editedSystem,
  });
}

export async function synthesize(text: string, voice: string): Promise<SynthesizeResult> {
  return post<SynthesizeResult>("/synthesize", { text, voice });
}

// Hand the call off to Claude Code: opens a terminal running `claude` seeded with
// the Cekura result + the notes the agent took. Returns the briefing file path.
export interface DelegatePayload {
  notes: string[];
  cekura: unknown;
  verdict?: string;
  transcript?: { role: string; text: string }[];
}
export async function delegateToClaude(p: DelegatePayload): Promise<{ ok: boolean; path: string; hint?: string }> {
  return post("/delegate-to-claude", p);
}
