import { GitBranch, Pause, Play } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import type { Stage, StageEvent } from "../timeline";
import { STAGE_COLOR, STAGE_LABEL } from "../timeline";
import { useWaveform } from "../useWaveform";
import { RecordingWave } from "./RecordingWave";

const TRACKS: Stage[] = ["stt", "llm", "tts", "audio"];

// Video-editor model: the view shows a fixed time WINDOW (default 20s). Zoom
// changes how many seconds fit in that window; the content keeps a constant
// pixels-per-second, so a longer call doesn't compress — it scrolls.
const WINDOW_SEC = 80; // default view spans 80 seconds
const MIN_ZOOM = 0.5; // 160s in view
const MAX_ZOOM = 40; // ~2s in view

function fmt(ms: number) {
  const s = ms / 1000;
  return `${s.toFixed(s < 10 ? 1 : 0)}s`;
}

// Gridline step that keeps ~10 ticks visible at the current zoom.
function niceStep(secInView: number): number {
  const target = secInView / 10;
  const steps = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  return steps.find((s) => s >= target) ?? 600;
}

export function Timeline({
  events,
  total,
  zoom,
  onZoom,
  selectedId,
  onSelect,
  playing,
  live,
  currentMs,
  onTogglePlay,
  onSeek,
  hasRecording,
  recordingUrl,
  recordingDurationMs,
  liveWave,
  liveStartMs = 0,
  feedbackTurns,
  canResume,
  onResumeHere,
}: {
  events: StageEvent[];
  total: number;
  zoom: number;
  onZoom: (z: number) => void;
  selectedId?: string;
  onSelect: (id: string) => void;
  playing: boolean;
  live: boolean;
  currentMs: number;
  onTogglePlay: () => void;
  onSeek: (ms: number) => void;
  hasRecording: boolean;
  recordingUrl?: string;
  recordingDurationMs?: number;
  liveWave?: number[];
  // Timeline ms where the live lane begins. >0 on a resumed call: the prior audio
  // is kept up to here and the live continuation is anchored after it.
  liveStartMs?: number;
  feedbackTurns?: Set<string>;
  canResume: boolean;
  onResumeHere: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wave = useWaveform(recordingUrl);

  const secPerView = WINDOW_SEC / zoom; // seconds visible in the window
  const totalSec = total / 1000;
  // Content spans at least one full window, so a short call still shows 0–20s.
  const contentSec = Math.max(totalSec, secPerView);
  const widthPct = (contentSec / secPerView) * 100; // ≥ 100 → scrolls when > 100
  const posPct = (ms: number) => `${(ms / 1000 / contentSec) * 100}%`;

  const seekFromClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(total, frac * contentSec * 1000)));
  };

  // Follow the playhead while playing: scroll the window so it stays in view
  // once the call runs past the visible span (video-editor scrubbing).
  useEffect(() => {
    if (!playing && !live) return;
    const el = scrollRef.current;
    if (!el) return;
    const x = (currentMs / 1000 / contentSec) * el.scrollWidth;
    const left = el.scrollLeft;
    const right = left + el.clientWidth;
    if (x < left + 24 || x > right - 64) {
      el.scrollTo({ left: Math.max(0, x - el.clientWidth * 0.45), behavior: "smooth" });
    }
  }, [currentMs, playing, live, contentSec]);

  // Keep the playhead framed when the zoom level changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const x = (currentMs / 1000 / contentSec) * el.scrollWidth;
    el.scrollTo({ left: Math.max(0, x - el.clientWidth * 0.45) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const step = niceStep(secPerView);
  const ticks: number[] = [];
  for (let t = 0; t <= contentSec + 1e-6; t += step) ticks.push(t * 1000);

  const viewLabel = secPerView < 1 ? `${secPerView.toFixed(1)}s` : `${Math.round(secPerView)}s`;

  return (
    <div className="timeline-editor">
      <div className="tl-head">
        <button className="tl-play" disabled={!hasRecording} onClick={onTogglePlay}
          title={hasRecording ? "play the call recording" : "no recording yet"}>
          {playing ? <Pause weight="fill" size={13} /> : <Play weight="fill" size={13} />}
          {playing ? "pause" : "play call"}
        </button>
        <span className="tl-time mono">{fmt(currentMs)} / {fmt(total)}</span>
        <button className="tl-resume" disabled={!canResume} onClick={onResumeHere}
          title="Resume from the playhead — seed the agent with the conversation up to here and continue live">
          <GitBranch weight="bold" size={13} /> Resume here
        </button>
        <span className="tl-hint">real time · click to seek · scroll & zoom · STT/LLM/TTS to edit</span>
        <div className="tl-zoom">
          <button onClick={() => onZoom(Math.max(MIN_ZOOM, zoom / 1.6))} title="zoom out (show more time)">−</button>
          <button onClick={() => onZoom(1)} title="reset to 20s view" className="tl-zoom-fit">{viewLabel}</button>
          <button onClick={() => onZoom(Math.min(MAX_ZOOM, zoom * 1.6))} title="zoom in (show less time)">+</button>
        </div>
      </div>

      <div className="tl-body">
        <div className="tl-rail">
          {TRACKS.map((s) => (
            <div className="tl-rail-label" key={s} style={{ color: STAGE_COLOR[s] }}>
              {STAGE_LABEL[s]}
            </div>
          ))}
        </div>

        <div className="tl-scroll" ref={scrollRef}>
          <div className="tl-content" style={{ width: `${widthPct}%` }}>
            {ticks.map((t, i) => (
              <div key={i} className="tl-tick" style={{ left: posPct(t) }} />
            ))}
            <div className="tl-playhead" style={{ left: posPct(currentMs) }} />

            {TRACKS.map((stage) => (
              <div className="tl-lane" key={stage} onClick={seekFromClick}>
                {stage === "audio" ? (
                  live ? (
                    <>
                      {/* Resumed branch: keep the prior recording's wave up to the
                          branch point so the live continuation extends it rather
                          than replacing it. */}
                      {liveStartMs > 0 && wave && wave.length > 1 && recordingDurationMs ? (
                        <div className="tl-rec prior" style={{ left: 0, width: posPct(liveStartMs) }}
                          title="conversation before the branch">
                          <RecordingWave
                            peaks={wave.slice(
                              0,
                              Math.max(1, Math.round(wave.length * Math.min(1, liveStartMs / recordingDurationMs))),
                            )}
                          />
                        </div>
                      ) : null}
                      {/* Live continuation, anchored at the branch point (left:0 on
                          a fresh, non-resumed call). */}
                      {liveWave && liveWave.length > 1 && (
                        <div className="tl-rec live"
                          style={{ left: posPct(liveStartMs), width: posPct(Math.max(0, currentMs - liveStartMs)) }}
                          title="live call audio">
                          <RecordingWave peaks={liveWave} />
                        </div>
                      )}
                      {/* The split between prior audio and the live continuation. */}
                      {liveStartMs > 0 && (
                        <div className="tl-split" style={{ left: posPct(liveStartMs) }} title="branch point" />
                      )}
                    </>
                  ) : (
                    hasRecording && (
                      <div className="tl-rec" style={{ left: 0, width: posPct(total) }}
                        title="full-call recording (mono) — click to seek, play above">
                        {wave ? (
                          <RecordingWave peaks={wave} />
                        ) : (
                          <span className="tl-rec-label">call recording</span>
                        )}
                      </div>
                    )
                  )
                ) : (
                  <>
                    {events
                      .filter((e) => e.kind === stage)
                      .map((e) => {
                        const hasFeedback = stage === "llm" && !!feedbackTurns?.has(e.turnId);
                        return (
                          <button
                            key={e.id}
                            className={`tl-event ${selectedId === e.id ? "selected" : ""} ${hasFeedback ? "has-feedback" : ""}`}
                            style={{
                              left: posPct(e.t0),
                              width: posPct(e.t1 - e.t0),
                              minWidth: "5px",
                              background: STAGE_COLOR[stage],
                            }}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onSelect(e.id);
                            }}
                            title={`${STAGE_LABEL[stage]} · ${fmt(e.t0)}–${fmt(e.t1)} · ${e.label}${hasFeedback ? " · has feedback" : ""}`}
                          >
                            <span className="tl-event-label">{e.label}</span>
                            {hasFeedback && <span className="tl-fb-flag" title="you left feedback here" />}
                          </button>
                        );
                      })}
                    {/* Tool calls annotate the LLM lane: instantaneous events, so
                        fixed-size pins anchored at t0 with the name always shown. */}
                    {stage === "llm" &&
                      events
                        .filter((e) => e.kind === "tool")
                        .map((e) => (
                          <button
                            key={e.id}
                            className={`tl-tool ${selectedId === e.id ? "selected" : ""}`}
                            style={{ left: posPct(e.t0) }}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onSelect(e.id);
                            }}
                            title={`TOOL · ${fmt(e.t0)} · ${e.label}`}
                          >
                            <span className="tl-tool-dot" />
                            <span className="tl-tool-label">{e.label}</span>
                          </button>
                        ))}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
