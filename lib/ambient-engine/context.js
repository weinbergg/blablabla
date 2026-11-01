// context.js — the one shared audio system every instrument plugs into.
//
// A single AudioContext, a single master chain, and a single shared reverb send
// so the whole rack breathes in one room and reads on one global analyser. Each
// instrument owns a submix that connects to `master` (dry) and, as much as it
// likes, to `reverbSend` (wet) — so "space" is a property of the ensemble, not a
// pile of separate rooms.

import { createReverbImpulse } from "./reverb.js";

export function createAudioSystem() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();

  const master = ctx.createGain();
  master.gain.value = 0.5; // initial volume 50% (the slider mirrors this)

  // A gentle limiter keeps a stack of simultaneous instruments from clipping.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 10;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.25;

  // One master analyser drives the global background visual.
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.85;

  master.connect(limiter);
  limiter.connect(analyser);
  analyser.connect(ctx.destination);

  // Shared reverb: instruments send into `reverbSend`; the wet return folds back
  // into the master just before the limiter.
  const reverbSend = ctx.createGain();
  const reverb = ctx.createConvolver();
  reverb.buffer = createReverbImpulse(ctx, 5.0, 3);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.9;
  reverbSend.connect(reverb);
  reverb.connect(reverbReturn);
  reverbReturn.connect(master);

  return {
    ctx,
    master,
    reverbSend,
    analyser,
    now: () => ctx.currentTime,
    resume: () => (ctx.state === "suspended" ? ctx.resume() : Promise.resolve()),
    setMasterVolume(v) {
      master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    },
  };
}
