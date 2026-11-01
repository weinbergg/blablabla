// surpeti.js — an Indian shruti-box / surpeti reed drone. A different kind of
// drone from the Infinite Drone (detuned-saw pedal + pads): this is a sustained
// harmonium bed — paired free-reed tones (Sa / Pa / Sa' / Ma) tuned to the shared
// root, with reed buzz (a soft-clip waveshaper + formant), a slow bellows swell,
// gentle vibrato, and characteristic beating between each reed's paired oscillators.
//
// It anchors the tonic as a meditative bed. Role: bed. Retunes by gliding on key.

import { Instrument } from "../instrument.js";
import { clamp, mulberry32 } from "../piece.js";

// Salt so the per-oscillator detune drift is drawn deterministically from the
// key (the same key must always sound the same), not from Math.random.
const SALT = 0x5f2ee7;

export const meta = {
  id: "surpeti",
  code: "su",
  name: "Surpeti",
  role: "bed",
  hue: 330, // rose
  gain: 0.7,
  blurb: "A shruti-box reed drone — Sa, Pa and the octave, breathing on the bellows.",
  params: [
    { key: "voices", label: "Drones", min: 1, max: 4, step: 1, default: 3 },
    { key: "reed", label: "Reediness", min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: "bellows", label: "Bellows", min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: "beating", label: "Beating", min: 0, max: 18, step: 1, default: 7 },
    { key: "vibrato", label: "Vibrato", min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: "space", label: "Space", min: 0, max: 1, step: 0.01, default: 0.5 },
  ],
};

const LEVELS = [0.9, 0.7, 0.55, 0.62]; // Sa, Pa, Sa', Ma — Sa dominant

export class Surpeti extends Instrument {
  constructor(conductor, audio) {
    super(conductor, audio, meta);
    this._wave = buildReedWave(this.ctx);
    this.reed = null;
  }

  onMount() {
    this.listen("key", () => this._retune());
    this.listen("harmony", (h) => {
      if (this._active) this.announce(this._tones()[0], h.when, 0.5, "reed");
    });
  }

  get tailMs() { return 3000; }

  // Sa in a comfortable mid register, then Pa/Sa'/Ma from the piece's own intervals.
  _tones() {
    const p = this.conductor.piece;
    let sa = p.rootHz;
    while (sa < 130) sa *= 2;
    while (sa >= 260) sa /= 2;
    const nearest = (target) =>
      p.intervals.reduce((b, r) => (Math.abs(r - target) < Math.abs(b - target) ? r : b), p.intervals[0]);
    return [sa, sa * nearest(1.5), sa * 2, sa * nearest(1.3333)];
  }

  onStart() {
    const ctx = this.ctx;
    const t = ctx.currentTime;

    this.bellowsAmp = ctx.createGain();
    this.bellowsAmp.gain.value = 0.0001;
    this.bellowsAmp.gain.linearRampToValueAtTime(0.5, t + 2.2);
    this.bellowsAmp.connect(this.output);

    // Post chain: reedBus → shaper → toneLP → (formant wet + dry) → bellowsAmp.
    this.reedBus = ctx.createGain();
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = tanhCurve(1 + this.params.reed * 6);
    this.shaper.oversample = "2x";
    this.toneLP = ctx.createBiquadFilter();
    this.toneLP.type = "lowpass";
    this.toneLP.frequency.value = 1400 + this.params.reed * 4200;
    this.toneLP.Q.value = 0.6;
    this.formant = ctx.createBiquadFilter();
    this.formant.type = "bandpass";
    this.formant.frequency.value = 1250;
    this.formant.Q.value = 0.8 + this.params.reed * 1.2;
    this.formantWet = ctx.createGain();
    this.formantWet.gain.value = 0.4;
    this.formantDry = ctx.createGain();
    this.formantDry.gain.value = 0.7;
    this.reedBus.connect(this.shaper);
    this.shaper.connect(this.toneLP);
    this.toneLP.connect(this.formant);
    this.formant.connect(this.formantWet);
    this.formantWet.connect(this.bellowsAmp);
    this.toneLP.connect(this.formantDry);
    this.formantDry.connect(this.bellowsAmp);

    // Shared modulators.
    this.bellowsLFO = ctx.createOscillator();
    this.bellowsLFO.frequency.value = 0.28;
    this.bellowsDepth = ctx.createGain();
    this.bellowsDepth.gain.value = 0.5 * this.params.bellows;
    this.bellowsLFO.connect(this.bellowsDepth);
    this.bellowsDepth.connect(this.bellowsAmp.gain);
    this.bellowsLFO.start(t);

    this.vibLFO = ctx.createOscillator();
    this.vibLFO.frequency.value = 5.2;
    this.vibDepth = ctx.createGain();
    this.vibDepth.gain.value = this.params.vibrato * 8;
    this.vibLFO.connect(this.vibDepth);
    this.vibLFO.start(t);

    // Build all four voices; unused ones sit at gain 0 (so voice count is live).
    // A key-seeded RNG gives each oscillator a fixed ±3-cent drift, so the same
    // key always yields the same beating (deterministic, like the sibling drone).
    const tones = this._tones();
    const rng = mulberry32((this.conductor.piece.seedInt ^ SALT) >>> 0);
    this.voices = tones.map((freq, i) => this._buildVoice(freq, i, t, rng));
    this._applyVoices();
  }

  _buildVoice(freq, i, t, rng) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.reedBus);
    const oscs = [];
    const drifts = []; // fixed per-oscillator detune (cents), key-derived
    for (const sign of [0, 1]) {
      const drift = (rng() * 2 - 1) * 3;
      drifts.push(drift);
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(this._wave);
      osc.frequency.value = freq;
      osc.detune.value = sign * this.params.beating + drift; // beating + fixed drift
      this.vibDepth.connect(osc.detune);
      osc.connect(g);
      osc.start(t);
      oscs.push(osc);
    }
    return { g, oscs, freq, drifts };
  }

  _applyVoices() {
    if (!this.voices) return;
    const t = this.ctx.currentTime;
    this.voices.forEach((v, i) => {
      const target = i < this.params.voices ? LEVELS[i] : 0;
      v.g.gain.setTargetAtTime(target, t, 0.4);
    });
  }

  onParam(name, value) {
    if (!this.voices) return;
    const t = this.ctx.currentTime;
    if (name === "voices") this._applyVoices();
    else if (name === "reed") {
      this.shaper.curve = tanhCurve(1 + value * 6);
      this.toneLP.frequency.setTargetAtTime(1400 + value * 4200, t, 0.2);
      this.formant.Q.setTargetAtTime(0.8 + value * 1.2, t, 0.2);
    } else if (name === "bellows") {
      this.bellowsDepth.gain.setTargetAtTime(0.5 * value, t, 0.2);
    } else if (name === "beating") {
      // Keep each oscillator's fixed drift; only the beating component moves.
      for (const v of this.voices) v.oscs[1].detune.setTargetAtTime(value + v.drifts[1], t, 0.2);
    } else if (name === "vibrato") {
      this.vibDepth.gain.setTargetAtTime(value * 8, t, 0.2);
    }
  }

  _retune() {
    if (!this.voices) return;
    const tones = this._tones();
    const t = this.ctx.currentTime;
    this.voices.forEach((v, i) => {
      v.freq = tones[i];
      for (const osc of v.oscs) osc.frequency.setTargetAtTime(tones[i], t, 0.35);
    });
  }

  onStop() {
    if (!this.voices) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.bellowsAmp.gain.cancelScheduledValues(t);
    this.bellowsAmp.gain.setTargetAtTime(0.0001, t, 0.8);
    const stopAt = t + 2.6;
    for (const v of this.voices) for (const osc of v.oscs) { try { osc.stop(stopAt); } catch (_) {} }
    try { this.bellowsLFO.stop(stopAt); this.vibLFO.stop(stopAt); } catch (_) {}
    this.voices = null;
  }
}

// A free-reed-ish spectrum: strong odd and present even harmonics with a buzz
// shelf on 3–7. Built once per context.
function buildReedWave(ctx) {
  const N = 25;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  let norm = 0;
  for (let n = 1; n < N; n++) {
    let a = (n % 2 === 1 ? 1 : 0.55) / Math.pow(n, 0.85);
    if (n >= 3 && n <= 7) a *= 1.4;
    imag[n] = a;
    norm += a;
  }
  for (let n = 1; n < N; n++) imag[n] /= norm;
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

// Soft-clip curve tanh(k·x)/tanh(k) with a touch of even-harmonic asymmetry.
function tanhCurve(k) {
  const N = 1024;
  const c = new Float32Array(N);
  const d = Math.tanh(k);
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1;
    c[i] = clamp((Math.tanh(k * x) + 0.12 * x * x) / d, -1, 1);
  }
  return c;
}
