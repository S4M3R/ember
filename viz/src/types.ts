// Mirrors shared/schema.md

export interface Block {
  id: string;
  label: string;
  text: string;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface Latencies {
  stt_ms?: number;
  llm_ms?: number;
  tts_ms?: number;
  total_ms?: number;
}

export interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

// Real wall-clock spans (ms from call start) for each pipeline stage of a turn.
export interface Trace {
  stt: [number | null, number | null];
  llm: [number | null, number | null];
  tts: [number | null, number | null];
}

export interface Turn {
  id: string;
  index: number;
  ts: number;
  user_text: string;
  response: string;
  system_blocks: Block[];
  messages: Message[];
  latencies: Latencies;
  trace?: Trace; // real per-stage timestamps (time-based timeline)
  partial?: boolean; // turn still in progress (streamed stage-by-stage)
  now_ms?: number; // call-clock offset at broadcast time (live clock anchor)
  tts_speaking?: boolean; // agent is actively speaking -> grow the TTS bar
  tool_calls: ToolCall[];
  stt_confidence?: number; // 0..1, from the STT service (live) or recorded sample
  voice?: string; // TTS voice id used for this turn
  audio_user?: string; // caller audio (data: URL or http URL)
  audio_agent?: string; // agent audio (data: URL or http URL)
}

// The full-call stereo recording (left=caller, right=agent), time-aligned to call start.
export interface Recording {
  url: string;
  durationMs: number;
}

export interface BlockAttribution {
  id: string;
  label: string;
  drop: number;
  score: number; // 0..1 responsibility
  reason?: string; // why this block ranks here (llm-rank)
}

export interface AttributionResult {
  turn_id: string;
  method: "llm-rank" | "loglik" | string;
  baseline_logprob: number;
  blocks: BlockAttribution[];
}

export interface ReplayResult {
  turn_id: string;
  response: string;
  changed: boolean;
  method: string;
}

export interface SynthesizeResult {
  voice: string;
  audio: string; // data: WAV URL
  sample_rate: number;
  duration_ms: number;
}
