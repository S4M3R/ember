import { memo } from "react";

// A symmetric filled waveform drawn as a single SVG path. The viewBox stretches
// to the lane (preserveAspectRatio="none"), so it scales horizontally with the
// timeline zoom. Memoized: only re-renders when the peak data changes.
export const RecordingWave = memo(function RecordingWave({ peaks }: { peaks: number[] }) {
  const n = peaks.length;
  if (n < 2) return null;

  const amp = 46; // max half-height in viewBox units (0..100 tall, centered at 50)
  let d = "M 0 50";
  for (let i = 0; i < n; i++) d += ` L ${i} ${(50 - peaks[i] * amp).toFixed(2)}`;
  for (let i = n - 1; i >= 0; i--) d += ` L ${i} ${(50 + peaks[i] * amp).toFixed(2)}`;
  d += " Z";

  return (
    <svg className="tl-wave" viewBox={`0 0 ${n - 1} 100`} preserveAspectRatio="none" aria-hidden>
      <path d={d} />
    </svg>
  );
});
