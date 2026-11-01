// conductor.js — the shared nervous system of the instrument rack.
//
// Instruments never talk to each other directly. They talk to the Conductor,
// which coordinates them across three channels:
//
//   TIMING  — one lookahead clock. It emits `pulse` events (and, every bar, a
//             `harmony` event) carrying a sample-accurate AudioContext `when`
//             time, so every instrument schedules against the same grid and
//             locks in time. Instruments may follow every pulse or ignore most.
//
//   PITCH   — one shared tonal field. The Key seeds a piece (buildPiece); a
//             `centerIndex` walks the interval gamut deterministically and is
//             broadcast on `harmony`. Instruments draw pitches from the shared
//             gamut so they're consonant, and can `announce` notes they play so
//             others can answer or make room (call-and-response).
//
//   TIMBRE  — one shared field. `field` = {energy, brightness, density} is read
//             from the master analyser (plus each instrument's own reports) and
//             pushed on a `field` event / kept live on `conductor.field`, so an
//             instrument can duck when the mix is loud, brighten when it's dark,
//             or fill the gaps when it's sparse — "locking onto a part of the
//             sound story."
//
// Everything harmonic is deterministic from the Key via stepRng, so a key still
// recreates the whole ensemble.

import { buildPiece, freqAt, gamutFreqs, stepRng, lerp, clamp } from "./piece.js";
import { DEFAULT_KEY } from "./presets.js";

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.3;
const STEPS_PER_BAR = 4;

export class Conductor {
  constructor(audio) {
    this.audio = audio; // { ctx, master, analyser, ... }
    this.ctx = audio.ctx;

    this.key = DEFAULT_KEY;
    this.piece = buildPiece(this.key);
    this.centerIndex = 0;

    this.pace = this.piece.character.pace;
    this.stepDur = 3;
    this.stepIndex = 0;
    this.barIndex = 0;
    this.nextStepTime = 0;

    this.running = false;
    this.timer = null;

    // pub/sub
    this._subs = new Map(); // type -> Set<handler>

    // shared timbre/energy field (live, read synchronously by instruments)
    this.field = { energy: 0, brightness: 0.4, density: 0 };
    this._reports = new Map(); // instrumentId -> { density, ... }
    this._freqData = new Uint8Array(audio.analyser.frequencyBinCount);
    this._fieldRaf = null;
  }

  // ---- pub/sub ------------------------------------------------------------

  on(type, handler) {
    if (!this._subs.has(type)) this._subs.set(type, new Set());
    this._subs.get(type).add(handler);
    return () => this._subs.get(type)?.delete(handler);
  }

  emit(type, payload) {
    const set = this._subs.get(type);
    if (!set) return;
    for (const h of set) {
      try { h(payload); } catch (e) { /* an instrument's handler must not break the clock */ }
    }
  }

  // ---- the shared tonal field --------------------------------------------

  setKey(key) {
    this.key = String(key);
    this.piece = buildPiece(this.key);
    this.centerIndex = 0;
    this.stepIndex = 0;
    this.barIndex = 0;
    this.emit("key", { key: this.key, piece: this.piece });
    if (this.running) {
      // Realign the clock so its NEXT scheduled step is bar 0 — a single harmony
      // source. (Emitting a frame here too would double-trigger instruments.)
      this.nextStepTime = this.ctx.currentTime + 0.08;
    } else {
      // Stopped: hand listeners one harmony frame to settle the display on.
      this.emit("harmony", this._harmonyPayload(this.ctx.currentTime + 0.05));
    }
    return this.key;
  }

  // The frequency for a gamut index in the current piece.
  freq(index) {
    return freqAt(this.piece, index);
  }

  // The pool of pitches instruments draw from (a few periods of the gamut).
  gamut(lo = 0, hi = 4) {
    return gamutFreqs(this.piece, lo, hi);
  }

  // A chord of `size` gamut tones stacked around the current centre.
  chord(size = 3, spread = 1) {
    const out = [];
    for (let i = 0; i < size; i++) out.push(freqAt(this.piece, this.centerIndex + i * spread));
    return out;
  }

  _harmonyPayload(when) {
    return {
      when,
      barIndex: this.barIndex,
      centerIndex: this.centerIndex,
      rootFreq: freqAt(this.piece, this.centerIndex),
      chord: this.chord(3, 1),
    };
  }

  // ---- notes: call & response --------------------------------------------

  // An instrument announces a note it just scheduled, so others can react.
  announce(note) {
    // note: { when, freq, index?, velocity, instrument, role, timbre? }
    this.emit("note", note);
  }

  // ---- timbre / energy field ---------------------------------------------

  report(instrumentId, state) {
    this._reports.set(instrumentId, state);
  }

  // Drop an instrument's contribution to the shared field when it's disposed,
  // so its density doesn't linger and the Map doesn't grow unbounded.
  unreport(instrumentId) {
    this._reports.delete(instrumentId);
  }

  _sampleField() {
    const a = this.audio.analyser;
    a.getByteFrequencyData(this._freqData);
    const d = this._freqData;
    const n = d.length;
    let allSum = 0, wsum = 0, wcount = 0;
    for (let i = 0; i < n; i++) {
      const v = d[i] / 255;
      allSum += v;
      wsum += v * i; // for a rough spectral centroid
      wcount += v;
    }
    const energy = allSum / n;
    const centroid = wcount > 0 ? wsum / wcount / n : 0; // 0..1
    const density = [...this._reports.values()].reduce((s, r) => s + (r.density || 0), 0);
    // Smooth so instruments react to trends, not frames.
    const f = this.field;
    f.energy = lerp(f.energy, clamp(energy * 3, 0, 1), 0.08);
    f.brightness = lerp(f.brightness, clamp(centroid * 2.2, 0, 1), 0.06);
    f.density = lerp(f.density, clamp(density, 0, 1), 0.1);
    this.emit("field", f);
  }

  // ---- transport ----------------------------------------------------------

  start() {
    if (this.running) return;
    this.running = true;
    this.nextStepTime = this.ctx.currentTime + 0.12;
    this.timer = setInterval(() => this._tick(), LOOKAHEAD_MS);
    const fieldLoop = () => {
      if (!this.running) return;
      this._sampleField();
      this._fieldRaf = requestAnimationFrame(fieldLoop);
    };
    this._fieldRaf = requestAnimationFrame(fieldLoop);
    this.emit("transport", { running: true });
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    this.timer = null;
    if (this._fieldRaf) cancelAnimationFrame(this._fieldRaf);
    this._fieldRaf = null;
    this.emit("transport", { running: false });
  }

  setPace(v) {
    this.pace = clamp(v, 0, 1);
  }

  _tick() {
    this.stepDur = lerp(6.0, 1.8, this.pace);
    const horizon = this.ctx.currentTime + SCHEDULE_AHEAD;
    while (this.nextStepTime < horizon) {
      const when = this.nextStepTime;
      const index = this.stepIndex;
      const beatInBar = index % STEPS_PER_BAR;

      if (beatInBar === 0) {
        this._advanceHarmony(when, index);
      }
      this.emit("pulse", {
        when,
        index,
        stepDur: this.stepDur,
        barIndex: this.barIndex,
        beatInBar,
        isBarStart: beatInBar === 0,
      });

      this.nextStepTime += this.stepDur;
      this.stepIndex++;
    }
  }

  // Walk the harmonic centre deterministically from the key, then broadcast it.
  _advanceHarmony(when, index) {
    if (index > 0) {
      const rng = stepRng(this.piece.seedInt, this.barIndex + 1);
      const move = rng() < 0.7
        ? [-2, -1, 1, 2][Math.floor(rng() * 4)]
        : [-4, 3, 4, 5][Math.floor(rng() * 4)];
      this.centerIndex += move;
      this.barIndex++;
    }
    this.emit("harmony", this._harmonyPayload(when));
  }
}
