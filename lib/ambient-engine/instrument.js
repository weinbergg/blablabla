// instrument.js — the base every instrument extends.
//
// An instrument owns a submix (`output`) that feeds the master (dry) plus a
// reverb send (wet, its "space"), and a private analyser tapping its own output
// for its pane visual. It subscribes to the Conductor for timing/pitch/timbre
// and never references another instrument directly.
//
// Everything the UI needs is declared in `meta` (name, role, hue, param schema),
// so panes and the instrument palette are fully generic — the UI knows nothing
// instrument-specific.

export class Instrument {
  constructor(conductor, audio, meta) {
    this.conductor = conductor;
    this.audio = audio;
    this.ctx = audio.ctx;
    this.meta = meta; // { id, name, role, hue, gain, params:[{key,label,min,max,step,default}], hasSpace }
    this.id = meta.id;

    this.params = {};
    for (const p of meta.params) this.params[p.key] = p.default;

    // Instrument bus: output → master (dry), output → send → shared reverb (wet),
    // output → analyser (its pane visual).
    this.output = this.ctx.createGain();
    this._mix = meta.gain ?? 0.85;
    this.output.gain.value = this._mix;
    this.output.connect(audio.master);

    this.send = this.ctx.createGain();
    this.send.gain.value = this.params.space ?? 0;
    this.output.connect(this.send);
    this.send.connect(audio.reverbSend);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.85;
    this.output.connect(this.analyser);

    this.muted = false;
    this._active = false;
    this._subs = [];
  }

  // Subscribe to a conductor channel; auto-unsubscribed on dispose.
  listen(type, handler) {
    this._subs.push(this.conductor.on(type, handler));
  }

  // Route a finished voice node into the instrument bus (dry + shared wet).
  route(node) {
    node.connect(this.output);
  }

  // Announce a note to the ensemble (see Conductor.announce).
  announce(freq, when, velocity = 0.5, timbre = "tone", index = null) {
    this.conductor.announce({
      when, freq, velocity, timbre, index,
      instrument: this.id, role: this.meta.role, hue: this.meta.hue,
    });
  }

  // ---- lifecycle (subclasses override the on* hooks) ---------------------

  mount() { this.onMount(); return this; }
  onMount() {}

  start() {
    if (this._active) return;
    this._active = true;
    this.onStart();
  }
  onStart() {}

  stop() {
    if (!this._active) return;
    this._active = false;
    this.onStop();
  }
  onStop() {}

  setParam(name, value) {
    this.params[name] = value;
    if (name === "space") this.send.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
    this.onParam(name, value);
  }
  onParam() {}

  // ---- mixing ------------------------------------------------------------

  setMix(v) { this._mix = v; this._applyGain(); }
  setMuted(m) { this.muted = m; this._applyGain(); }
  _applyGain() {
    this.output.gain.setTargetAtTime(this.muted ? 0 : this._mix, this.ctx.currentTime, 0.05);
  }

  getAnalyser() { return this.analyser; }
  isActive() { return this._active; }

  // How long to keep the audio graph alive after stop() so a fade/tail can ring
  // out before the nodes are disconnected. Subclasses with a pedal/tail override.
  get tailMs() { return 200; }

  dispose() {
    this.stop(); // lets onStop() fade/ring out
    for (const un of this._subs) un();
    this._subs = [];
    if (this.conductor.unreport) this.conductor.unreport(this.id);
    // Disconnect only after the tail has sounded, so closing a pane doesn't pop.
    setTimeout(() => {
      try {
        this.output.disconnect();
        this.send.disconnect();
        this.analyser.disconnect();
      } catch (_) {}
    }, this.tailMs);
  }

  // Small envelope helper shared by voices: schedule an ADSR-ish gain.
  _env(gain, when, { attack, hold = 0, release, peak }) {
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + attack);
    if (hold) gain.gain.setValueAtTime(peak, when + attack + hold);
    gain.gain.linearRampToValueAtTime(0, when + attack + hold + release);
    return when + attack + hold + release;
  }

  // Disconnect a transient node once it can no longer sound.
  _cleanup(node, stopAt) {
    const ms = Math.max(0, (stopAt - this.ctx.currentTime) * 1000) + 200;
    setTimeout(() => {
      try { node.disconnect(); } catch (_) {}
    }, ms);
  }
}
