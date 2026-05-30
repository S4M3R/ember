// Decode the call recording into normalized peak data for the timeline
// waveform. Fetches the audio once per URL, downsamples to `buckets` peaks,
// and caches the result so re-renders (and zooming) don't re-decode.

import { useEffect, useState } from "react";

const cache = new Map<string, number[]>();

export function useWaveform(url: string | undefined, buckets = 800): number[] | null {
  const [peaks, setPeaks] = useState<number[] | null>(() => (url ? cache.get(url) ?? null : null));

  useEffect(() => {
    if (!url) {
      setPeaks(null);
      return;
    }
    const cached = cache.get(url);
    if (cached) {
      setPeaks(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const Ctx: typeof AudioContext =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const audio = await ctx.decodeAudioData(buf);
        await ctx.close();

        const len = audio.length;
        const size = Math.max(1, Math.floor(len / buckets));
        const out = new Array<number>(buckets).fill(0);
        // Peak across all channels per bucket (mono-mix the stereo recording).
        for (let c = 0; c < audio.numberOfChannels; c++) {
          const data = audio.getChannelData(c);
          for (let b = 0; b < buckets; b++) {
            const start = b * size;
            const end = Math.min(start + size, len);
            let peak = 0;
            for (let i = start; i < end; i++) {
              const v = data[i] < 0 ? -data[i] : data[i];
              if (v > peak) peak = v;
            }
            if (peak > out[b]) out[b] = peak;
          }
        }
        let max = 1e-4;
        for (const v of out) if (v > max) max = v;
        const norm = out.map((v) => v / max);

        cache.set(url, norm);
        if (!cancelled) setPeaks(norm);
      } catch {
        if (!cancelled) setPeaks(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, buckets]);

  return peaks;
}
