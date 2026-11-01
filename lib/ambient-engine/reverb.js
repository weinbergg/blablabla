// reverb.js — generate a lush impulse response for the convolution reverb.
//
// Rather than ship a binary IR file (which would need a build step and a fetch,
// awkward on GitHub Pages), we synthesise a smooth exponentially-decaying noise
// tail directly into an AudioBuffer. Longer, darker tails read as "bigger space".

export function createReverbImpulse(ctx, seconds = 4, decay = 3) {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = ctx.createBuffer(2, length, rate);

  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // White noise shaped by an exponential envelope. A short fade-in at the
      // very start avoids a hard click on the reverb onset.
      const envelope = Math.pow(1 - t, decay);
      const fadeIn = Math.min(1, i / (rate * 0.01));
      data[i] = (Math.random() * 2 - 1) * envelope * fadeIn;
    }
  }
  return impulse;
}
