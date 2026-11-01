// Quiet fallback when the library has no approved recordings yet.
// A slow sine chord, very low. The old drone was too loud and rough for reading.

export async function startReadingBed() {
  const ctx = new AudioContext();
  await ctx.resume();

  const master = ctx.createGain();
  master.gain.value = 0.035;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 340;
  filter.Q.value = 0.35;
  filter.connect(master);
  master.connect(ctx.destination);

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.04;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 60;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  const chord = [174.61, 220, 261.63];
  const voices = chord.map((freq, index) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = index === 0 ? 0.5 : 0.22;
    osc.connect(gain);
    gain.connect(filter);
    osc.start();
    return osc;
  });

  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      for (const osc of voices) {
        try {
          osc.stop();
        } catch {
          /* already stopped */
        }
      }
      try {
        lfo.stop();
      } catch {
        /* already stopped */
      }
      window.setTimeout(() => {
        void ctx.close();
      }, 200);
    },
  };
}
