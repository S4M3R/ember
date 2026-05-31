// Stitch a resumed call's recording onto the prior one. The continuation is
// recorded with a silent prefix of `offsetMs` (the agent shifts its clock back
// by the branch point), so its audio already sits at [offsetMs, end]. We just
// fill that silent prefix with the prior call's audio up to the branch point:
//   final = prior[0, offsetMs)  ++  continuation[offsetMs, end)
// Result is a single continuous mono WAV data URL.

async function decode(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const ab = await (await fetch(url)).arrayBuffer();
  return ctx.decodeAudioData(ab);
}

function encodeWav(samples: Float32Array, sampleRate: number): string {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const wr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  wr(0, "RIFF");
  dv.setUint32(4, 36 + n * 2, true);
  wr(8, "WAVE");
  wr(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  wr(36, "data");
  dv.setUint32(40, n * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return "data:audio/wav;base64," + btoa(bin);
}

// Trim a recording to [0, endMs), returning a mono WAV data URL. Used when a
// branch is armed: the audio after the branch point is dropped immediately, so
// the timeline shows only the conversation up to where it will continue.
export async function trimRecording(url: string, endMs: number): Promise<string> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await decode(ctx, url);
    const sr = buf.sampleRate;
    const cut = Math.min(Math.floor((endMs / 1000) * sr), buf.length);
    return encodeWav(buf.getChannelData(0).slice(0, Math.max(1, cut)), sr);
  } finally {
    void ctx.close();
  }
}

export async function stitchRecordings(
  priorUrl: string,
  contUrl: string,
  offsetMs: number,
): Promise<string> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const [prior, cont] = await Promise.all([decode(ctx, priorUrl), decode(ctx, contUrl)]);
    const sr = cont.sampleRate;
    const out = new Float32Array(cont.length);
    out.set(cont.getChannelData(0)); // continuation (silence before offset, audio after)
    const a = prior.getChannelData(0);
    // Fill the silent prefix with prior audio, clipped to the branch offset.
    const cut = Math.min(Math.floor((offsetMs / 1000) * sr), a.length, out.length);
    for (let i = 0; i < cut; i++) out[i] = a[i];
    return encodeWav(out, sr);
  } finally {
    void ctx.close();
  }
}
