// noise.js — shared noise-buffer generator. Seeded so instruments that use it can
// stay deterministic from the key; instruments cache one longish buffer and reuse
// it (looped, filtered, re-enveloped, re-pitched) rather than allocating per hit.

export function noiseBuffer(ctx, seconds, rand = Math.random, channels = 1) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(channels, len, ctx.sampleRate);
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = rand() * 2 - 1;
  }
  return buf;
}
