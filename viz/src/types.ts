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
  t0?: number; // ms from call start
  t1?: number;
  args?: string;
  result?: string;
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

// Cekura auto-evaluation feedback, streamed over the hub when a call ends.
export interface CekuraMetric {
  name: string;
  type: string;
  score: number | null;
  value: string | null;
  display: string; // pre-formatted for display (e.g. "Pass", "4.5/5", "612 ms")
  t: number | null; // 0..1 for heatmap coloring, or null when not applicable
  pass: boolean | null;
}

export interface CekuraFeedbackState {
  status: "evaluating" | "done" | "error";
  metrics: CekuraMetric[];
  call_log_id?: number;
  dashboard_url?: string;
  message?: string;
}

export interface SynthesizeResult {
  voice: string;
  audio: string; // data: WAV URL
  sample_rate: number;
  duration_ms: number;
}
