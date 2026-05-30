// Plays the full-call stereo recording. Exposes current position (ms) for the
// playhead, and play/pause/seek so the timeline can scrub the real audio.

import { useCallback, useEffect, useRef, useState } from "react";

export function useRecordingPlayer(url: string | undefined) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);

  useEffect(() => {
    const a = new Audio();
    ref.current = a;
    const onTime = () => setCurrentMs(a.currentTime * 1000);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onPause);
    };
  }, []);

  // Recording grows as the call goes; swap src but keep the playhead position.
  useEffect(() => {
    const a = ref.current;
    if (!a || !url || a.src === url) return;
    const t = a.currentTime;
    const wasPlaying = !a.paused;
    const restore = () => {
      try {
        if (t) a.currentTime = t;
      } catch {
        /* not seekable yet */
      }
      if (wasPlaying) a.play().catch(() => {});
      a.removeEventListener("loadeddata", restore);
    };
    a.addEventListener("loadeddata", restore);
    a.src = url;
    a.load();
  }, [url]);

  const toggle = useCallback(() => {
    const a = ref.current;
    if (!a || !a.src) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, []);

  const seekMs = useCallback((ms: number) => {
    const a = ref.current;
    if (!a) return;
    a.currentTime = Math.max(0, ms / 1000);
    setCurrentMs(ms);
  }, []);

  const playFrom = useCallback((ms: number) => {
    const a = ref.current;
    if (!a) return;
    a.currentTime = Math.max(0, ms / 1000);
    a.play().catch(() => {});
  }, []);

  return { playing, currentMs, toggle, seekMs, playFrom };
}
