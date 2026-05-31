// Live audio visualization. While a call is active, tap the call's audio tracks
// (caller mic + agent voice) through a Web Audio AnalyserNode and sample the
// peak amplitude on a fixed cadence, growing a normalized peaks array that the
// timeline renders as a live waveform — no need to wait for the recording.

import { useEffect, useRef, useState } from "react";
import type { PipecatClient } from "@pipecat-ai/client-js";

const SAMPLE_MS = 80; // one peak every 80ms (~12.5 buckets/sec)
const MAX_PEAKS = 6000; // ~8 min cap, then stop growing
const GAIN = 1.6; // boost so quiet speech is visible

export function useLiveWaveform(client: PipecatClient | null, active: boolean): number[] {
  const [peaks, setPeaks] = useState<number[]>([]);
  const peaksRef = useRef<number[]>([]);

  useEffect(() => {
    if (!active || !client) {
      setPeaks([]);
      peaksRef.current = [];
      return;
    }
    peaksRef.current = [];
    setPeaks([]);

    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    ctx.resume().catch(() => {});
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const buf = new Uint8Array(analyser.fftSize);
    const seen = new Set<MediaStreamTrack>();

    const attach = (track?: MediaStreamTrack | null) => {
      if (!track || track.kind !== "audio" || seen.has(track)) return;
      seen.add(track);
      try {
        ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
      } catch {
        /* track not connectable yet */
      }
    };
    // Re-grab each tick: bot audio often starts a beat after connect, and this
    // dedups via `seen`, so it cheaply picks up tracks as they appear.
    const grab = () => {
      try {
        const t = client.tracks();
        attach(t?.local?.audio);
        attach(t?.bot?.audio);
      } catch {
        /* not connected yet */
      }
    };

    const timer = setInterval(() => {
      grab();
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i] - 128) / 128;
        if (v > peak) peak = v;
      }
      const next = peaksRef.current;
      if (next.length < MAX_PEAKS) {
        next.push(Math.min(1, peak * GAIN));
        setPeaks(next.slice());
      }
    }, SAMPLE_MS);

    return () => {
      clearInterval(timer);
      ctx.close().catch(() => {});
    };
  }, [client, active]);

  return peaks;
}
