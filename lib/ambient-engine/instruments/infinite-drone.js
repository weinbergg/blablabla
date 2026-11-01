// infinite-drone.js — the first instrument (v1). The original engine, refactored
// to live on the shared Conductor: it holds the low pedal drone, lays evolving
// pads and bass on each harmony change, sprinkles an interval-leaping arpeggio
// and bells on the pulse — all drawn from the shared tonal field, and announced
// so other instruments can answer. Role: the harmonic bed. Signature visual: the
// aurora.

import { Instrument } from "../instrument.js";
import { freqAt, gamutFreqs, stepRng, mulberry32, lerp } from "../piece.js";

const SALT = 0xd51e; // keeps this instrument's per-step RNG distinct from others

export const meta = {
  id: "infinite-drone",
  code: "dr", // stable short code for the shareable config key (never reused)
  name: "Infinite Drone",
  role: "bed",
  hue: 265,
  gain: 0.78,
  blurb: "The pedal drone, pads, bass, and interval arpeggio — the harmonic bed.",
  params: [
    { key: "motion", label: "Motion", min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: "shimmer", label: "Shimmer", min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: "brightness", label: "Brightness", min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: "space", label: "Space", min: 0, max: 1, step: 0.01, default: 0.5 },
  ],
};

export class InfiniteDrone extends Instrument {
  constructor(conductor, audio) {
    super(conductor, audio, { ...meta, params: seedParams(conductor) });
    this.center = 0;
    this.drone = null;
  }

  onMount() {
    const ctx = this.ctx;
    // Pads/bass/arp pass through a brightness lowpass; bells stay open.
    this.toneFilter = ctx.createBiquadFilter();
    this.toneFilter.type = "lowpass";
    this.toneFilter.Q.value = 0.5;
    this.toneFilter.frequency.value = brightnessToHz(this.params.brightness);
    this.toneFilter.connect(this.output);

    this.bellBus = ctx.createGain();
    this.bellBus.connect(this.output);

    this.listen("harmony", (h) => this._onHarmony(h));
    this.listen("pulse", (p) => this._onPulse(p));
    this.listen("key", () => this._retuneDrone());
  }

  onStart() {
    this._startDrone();
  }

  onStop() {
    this._stopDrone();
  }

  onParam(name, value) {
    if (name === "brightness") {
      this.toneFilter.frequency.setTargetAtTime(brightnessToHz(value), this.ctx.currentTime, 0.1);
    } else if (name === "shimmer") {
      this._updateShimmer();
    }
  }

  get tailMs() {
    return 3300; // pedal fade (0.6s) + oscillator stop (+3s) must ring out before disconnect
  }

  _report() {
    // Feed the shared timbre field: the drone contributes steady low density.
    this.conductor.report(this.id, { density: 0.15 + this.params.motion * 0.25 });
  }

  // ---- reactions to the shared clock -------------------------------------

  _onHarmony(h) {
    this.center = h.centerIndex;
    if (!this._active) return;
    this._playPad(h.chord, h.when, this.conductor.stepDur * 4);
    const rng = stepRng(this.conductor.piece.seedInt ^ SALT, h.barIndex);
    if (rng() < 0.85) this._playBass(this.conductor.freq(this.center - this.conductor.piece.intervals.length), h.when, this.conductor.stepDur * 4);
    this._report();
  }

  _onPulse(p) {
    if (!this._active) return;
    const rng = stepRng(this.conductor.piece.seedInt ^ SALT, p.index);
    // A separate, seeded texture RNG for timbre jitter (decay/peak/pan) so those
    // don't perturb the pitch/timing choices — and so a key recreates it exactly.
    const trng = mulberry32((this.conductor.piece.seedInt ^ SALT ^ 0x7ea5 ^ Math.imul(p.index + 1, 2654435761)) >>> 0);
    const notes = Math.round(lerp(0, 7, this.params.motion));
    for (let i = 0; i < notes; i++) {
      const leap = [-3, -2, -1, 1, 1, 2, 3, 4][Math.floor(rng() * 8)];
      const idx = this.center + 2 + i * leap;
      const when = p.when + (i / Math.max(1, notes)) * p.stepDur + rng() * 0.04;
      const f = this.conductor.freq(idx);
      this._playArp(f, when, trng);
      if (i === 0) this.announce(f, when, 0.4, "pluck", idx);
    }
    const bellP = 0.1 + this.params.motion * 0.3;
    if (rng() < bellP) {
      const pool = gamutFreqs(this.conductor.piece, 1, 3);
      const f = pool[Math.floor(rng() * pool.length)];
      const when = p.when + rng() * p.stepDur;
      this._playBell(f, when, trng);
      this.announce(f, when, 0.5, "bell");
    }
  }

  // ---- voices ------------------------------------------------------------

  _playPad(freqs, time, duration) {
    const ctx = this.ctx;
    const attack = Math.min(duration * 0.6, 3.5);
    const release = 3.0;
    const peak = 0.16 / Math.sqrt(freqs.length);
    const cents = this.params.shimmer * 9;
    const group = ctx.createGain();
    group.connect(this.toneFilter);
    const end = this._env(group, time, { attack, hold: duration - attack, release, peak });
    const stopAt = end + 0.1;
    for (const freq of freqs) {
      for (const [type, det, level] of [["sawtooth", -cents, 0.5], ["triangle", cents, 0.7]]) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        osc.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = level;
        osc.connect(g);
        g.connect(group);
        osc.start(time);
        osc.stop(stopAt);
      }
    }
    this._cleanup(group, stopAt);
    this.announce(freqs[freqs.length - 1], time, 0.3, "pad");
  }

  _playBass(freq, time, duration) {
    const ctx = this.ctx;
    const f = Math.max(24, freq);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f;
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = f / 2;
    const g = ctx.createGain();
    const end = this._env(g, time, { attack: 1.2, hold: duration - 1.2, release: 2.5, peak: 0.12 });
    osc.connect(g);
    sub.connect(g);
    g.connect(this.toneFilter);
    const stopAt = end + 0.1;
    osc.start(time); sub.start(time);
    osc.stop(stopAt); sub.stop(stopAt);
    this._cleanup(g, stopAt);
  }

  _playArp(freq, time, rand = Math.random) {
    const ctx = this.ctx;
    const decay = 0.4 + rand() * 0.6;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.07, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, time + decay);
    osc.connect(g);
    g.connect(this.toneFilter);
    const stopAt = time + decay + 0.05;
    osc.start(time);
    osc.stop(stopAt);
    this._cleanup(g, stopAt);
  }

  _playBell(freq, time, rand = Math.random) {
    const ctx = this.ctx;
    const decay = 2 + rand() * 3;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const overtone = ctx.createOscillator();
    overtone.type = "sine";
    overtone.frequency.value = freq * 2.01;
    const otGain = ctx.createGain();
    otGain.gain.value = 0.18;
    const g = ctx.createGain();
    const peak = 0.09 + rand() * 0.05;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, time + decay);
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    osc.connect(g);
    overtone.connect(otGain);
    otGain.connect(g);
    if (panner) {
      panner.pan.value = rand() * 1.6 - 0.8;
      g.connect(panner);
      panner.connect(this.bellBus);
    } else {
      g.connect(this.bellBus);
    }
    const stopAt = time + decay + 0.1;
    osc.start(time);
    overtone.start(time);
    osc.stop(stopAt);
    overtone.stop(stopAt);
    this._cleanup(g, stopAt);
  }

  // ---- the pedal drone (microtonal beating cluster) ----------------------

  _startDrone() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.14, ctx.currentTime, 1.0); // come in promptly & clearly
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.Q.value = 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 250;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    filter.connect(gain);
    gain.connect(this.output);
    lfo.start();
    this.drone = { voices: [], filter, gain, lfo, lfoGain };
    this._buildDroneVoices();
  }

  _droneFreqs() {
    const p = this.conductor.piece;
    const colour = p.intervals[Math.min(1, p.intervals.length - 1)] || 1;
    return [p.rootHz, p.rootHz * colour, p.rootHz * p.period];
  }

  _cents() {
    return 2 + this.params.shimmer * 12;
  }

  // Built ONCE. Shimmer then glides detune and a key change glides frequency, so
  // the oscillators are never hard-restarted (which clicked and churned per tick).
  _buildDroneVoices() {
    if (!this.drone) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const cents = this._cents();
    const voices = [];
    this._droneFreqs().forEach((f, partial) => {
      const signs = partial === 0 ? [-1, 0, 1] : [-1, 1];
      const level = partial === 0 ? 0.5 : 0.28;
      for (const sign of signs) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        osc.detune.value = sign * cents;
        const g = ctx.createGain();
        g.gain.value = 0;
        g.gain.setTargetAtTime(level, t, 0.4); // fade in — no click
        osc.connect(g);
        g.connect(this.drone.filter);
        osc.start(t);
        voices.push({ osc, sign, partial });
      }
    });
    this.drone.voices = voices;
  }

  _updateShimmer() {
    if (!this.drone) return;
    const cents = this._cents();
    const t = this.ctx.currentTime;
    for (const v of this.drone.voices) v.osc.detune.setTargetAtTime(v.sign * cents, t, 0.15);
  }

  _retuneDrone() {
    if (!this.drone) return;
    const freqs = this._droneFreqs();
    const t = this.ctx.currentTime;
    for (const v of this.drone.voices) v.osc.frequency.setTargetAtTime(freqs[v.partial], t, 1.5);
  }

  _stopDrone() {
    if (!this.drone) return;
    const ctx = this.ctx;
    const { voices, gain, lfo } = this.drone;
    const t = ctx.currentTime;
    gain.gain.setTargetAtTime(0, t, 0.6);
    const stopAt = t + 3;
    for (const v of voices) {
      try { v.osc.stop(stopAt); } catch (_) {}
    }
    lfo.stop(stopAt);
    this.drone = null;
  }
}

// Seed the instrument's default params from the piece's character, so a key sets
// the drone's temperament too.
function seedParams(conductor) {
  const c = conductor.piece.character;
  return meta.params.map((p) => ({
    ...p,
    default: c[p.key] !== undefined ? c[p.key] : p.default,
  }));
}

function brightnessToHz(value) {
  return 220 * Math.pow(2, lerp(0, 6, value)); // ~220 Hz … ~14 kHz
}
