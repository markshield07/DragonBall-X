// All sound is synthesized with WebAudio at runtime: no audio files, no
// licensing questions, tiny download. Sounds scale with player power so a
// strong punch literally sounds heavier than a weak one.
export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.8;
    this.noiseBuffer = null;
    this.loops = {};
  }

  // Must be called from a user gesture (browser autoplay rules).
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      // Muffle filter: closes during slow motion for an underwater feel.
      this.muffle = this.ctx.createBiquadFilter();
      this.muffle.type = 'lowpass';
      this.muffle.frequency.value = 20000;
      this.master.connect(this.muffle).connect(comp).connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  env(gainNode, t, attack, peak, decay) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  noise(t, { duration = 0.3, filter = 'lowpass', freq = 1200, q = 0.8, gain = 0.5, attack = 0.005, freqEnd = null }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, attack, gain, duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + attack + duration + 0.05);
  }

  tone(t, { type = 'sine', freq = 440, freqEnd = null, duration = 0.3, gain = 0.3, attack = 0.005 }) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + duration);
    const g = this.ctx.createGain();
    this.env(g, t, attack, gain, duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + attack + duration + 0.05);
  }

  // ---- One-shots ----------------------------------------------------------
  punch(power = 0.3, transformed = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const p = Math.min(1, power);
    this.tone(t, { type: 'sine', freq: 140 - 60 * p, freqEnd: 45, duration: 0.12 + 0.2 * p, gain: 0.35 + 0.5 * p });
    this.noise(t, { duration: 0.06 + 0.12 * p, freq: 2400 - 1200 * p, gain: 0.25 + 0.35 * p, filter: 'lowpass' });
    if (p > 0.55 || transformed) {
      this.noise(t + 0.01, { duration: 0.35 + 0.3 * p, freq: 400, freqEnd: 90, gain: 0.25 + 0.3 * p, q: 2 });
      if (transformed) this.tone(t, { type: 'sawtooth', freq: 880, freqEnd: 220, duration: 0.18, gain: 0.07 });
    }
  }

  whoosh() {
    if (!this.ready) return;
    this.noise(this.ctx.currentTime, { duration: 0.12, filter: 'bandpass', freq: 900, freqEnd: 2400, q: 1.5, gain: 0.08 });
  }

  kiBlast(power = 0.3, charged = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const p = Math.min(1, power);
    this.tone(t, { type: 'square', freq: charged ? 520 : 900 + 400 * p, freqEnd: charged ? 90 : 180, duration: charged ? 0.45 : 0.16, gain: 0.08 + 0.08 * p });
    this.noise(t, { duration: charged ? 0.5 : 0.15, filter: 'bandpass', freq: charged ? 700 : 2200, freqEnd: 300, q: 1.2, gain: charged ? 0.35 : 0.14 });
    if (charged) this.tone(t, { type: 'sine', freq: 110, freqEnd: 40, duration: 0.5, gain: 0.4 });
  }

  explosion(size = 0.5) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.noise(t, { duration: 0.4 + size, freq: 1500, freqEnd: 120, gain: 0.3 + 0.4 * size });
    this.tone(t, { type: 'sine', freq: 90, freqEnd: 30, duration: 0.4 + 0.5 * size, gain: 0.4 * size + 0.2 });
  }

  block() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(t, { type: 'triangle', freq: 660, freqEnd: 330, duration: 0.15, gain: 0.2 });
    this.noise(t, { duration: 0.12, filter: 'highpass', freq: 2500, gain: 0.15 });
  }

  hurt() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(t, { type: 'sawtooth', freq: 180, freqEnd: 60, duration: 0.25, gain: 0.25 });
    this.noise(t, { duration: 0.2, freq: 800, gain: 0.25 });
  }

  targetHit(pitch = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(t, { type: 'triangle', freq: 660 * pitch, freqEnd: 1320 * pitch, duration: 0.12, gain: 0.2 });
    this.tone(t + 0.06, { type: 'sine', freq: 990 * pitch, duration: 0.15, gain: 0.12 });
  }

  ui() {
    if (!this.ready) return;
    this.tone(this.ctx.currentTime, { type: 'triangle', freq: 880, freqEnd: 1100, duration: 0.06, gain: 0.12 });
  }

  levelUp() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.08, { type: 'triangle', freq: f, duration: 0.25, gain: 0.18 }));
  }

  fanfare() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const notes = [392, 523, 659, 784, 659, 784, 1046];
    notes.forEach((f, i) => {
      this.tone(t + i * 0.11, { type: 'square', freq: f, duration: 0.3, gain: 0.08 });
      this.tone(t + i * 0.11, { type: 'triangle', freq: f / 2, duration: 0.3, gain: 0.12 });
    });
    this.noise(t + 0.6, { duration: 1.2, filter: 'highpass', freq: 5000, gain: 0.06 });
  }

  bossRoar() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(t, { type: 'sawtooth', freq: 95, freqEnd: 70, duration: 1.0, gain: 0.25, attack: 0.08 });
    this.tone(t, { type: 'sawtooth', freq: 143, freqEnd: 100, duration: 1.0, gain: 0.15, attack: 0.08 });
    this.noise(t, { duration: 1.0, filter: 'bandpass', freq: 500, q: 3, gain: 0.25, attack: 0.08 });
  }

  warning() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(t, { type: 'square', freq: 740, duration: 0.12, gain: 0.08 });
    this.tone(t + 0.16, { type: 'square', freq: 740, duration: 0.12, gain: 0.08 });
  }

  // Big transformation burst. `form` changes the timbre.
  transform(form = 'ssj1') {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    // Rising scream into the burst
    this.tone(t, { type: 'sawtooth', freq: 120, freqEnd: 480, duration: 0.9, gain: 0.12, attack: 0.3 });
    this.noise(t, { duration: 1.0, filter: 'bandpass', freq: 400, freqEnd: 4000, q: 1, gain: 0.2, attack: 0.5 });
    // Burst
    const b = t + 1.05;
    this.noise(b, { duration: 2.2, freq: 3000, freqEnd: 150, gain: 0.7 });
    this.tone(b, { type: 'sine', freq: 70, freqEnd: 28, duration: 2.0, gain: 0.8 });
    // Each form has its own chord, rising and darker as forms climb.
    const CHORDS = {
      ssj1: [261, 329, 392, 523],
      ssj2: [293, 369, 440, 587],
      ssj3: [196, 247, 294, 392, 494],
      ssj4: [174, 220, 261, 349],
      ssj5: [233, 293, 349, 466, 587],
    };
    const chord = CHORDS[form] || [220, 277, 330, 440];
    chord.forEach((f) => this.tone(b, { type: 'sawtooth', freq: f, duration: 1.6, gain: 0.05, attack: 0.02 }));
    this.tone(b + 0.05, { type: 'triangle', freq: 1046, freqEnd: 2093, duration: 0.8, gain: 0.1 });
  }

  // Slow motion: a deep time-warp sweep and muffled world sound.
  slowmo(on) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.muffle.frequency.setTargetAtTime(on ? 900 : 20000, t, on ? 0.08 : 0.25);
    if (on) {
      this.tone(t, { type: 'sine', freq: 420, freqEnd: 60, duration: 0.7, gain: 0.35 });
      this.noise(t, { duration: 0.6, filter: 'bandpass', freq: 2400, freqEnd: 200, q: 2, gain: 0.25 });
    } else this.tone(t, { type: 'sine', freq: 80, freqEnd: 400, duration: 0.35, gain: 0.25 });
  }

  // Beam firing: a blast plus a sustained roar (stopped with beamEnd).
  beam(on, power = 1) {
    if (!this.ready) return;
    if (on) {
      const t = this.ctx.currentTime;
      this.noise(t, { duration: 0.6, freq: 3500, freqEnd: 300, gain: 0.5 });
      this.tone(t, { type: 'sine', freq: 120, freqEnd: 50, duration: 0.6, gain: 0.5 });
    }
    this.setLoop('beam', on ? 0.9 * power : 0, 2.4, { base: 110, noiseFreq: 1400 });
  }

  beamCharge(level) {
    this.setLoop('beamCharge', level > 0 ? 0.3 + 0.5 * level : 0, 1 + 1.5 * level, { base: 220, noiseFreq: 2000, type: 'triangle' });
  }

  kaioken() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(t, { type: 'sawtooth', freq: 90, freqEnd: 180, duration: 0.6, gain: 0.25, attack: 0.05 });
    this.noise(t, { duration: 0.8, freq: 900, freqEnd: 2500, gain: 0.35, attack: 0.05 });
  }

  flight(on) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.noise(t, { duration: 0.5, filter: 'bandpass', freq: on ? 500 : 2000, freqEnd: on ? 2500 : 400, q: 1.2, gain: 0.25 });
  }

  powerDown() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.noise(t, { duration: 1.3, filter: 'lowpass', freq: 1800, freqEnd: 120, gain: 0.25, attack: 0.05 });
    this.tone(t, { type: 'sine', freq: 300, freqEnd: 80, duration: 1.2, gain: 0.15 });
  }

  // ---- Continuous loops (charge hum, aura) ---------------------------------
  // A loop is a pair of detuned oscillators + filtered noise whose level/pitch
  // are driven every frame via setLoop(name, intensity, pitch).
  ensureLoop(name, { base = 80, noiseFreq = 600, type = 'sawtooth' } = {}) {
    if (!this.ready) return null;
    if (this.loops[name]) return this.loops[name];
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = type; o2.type = type;
    o1.frequency.value = base; o2.frequency.value = base * 1.012;
    const og = ctx.createGain();
    og.gain.value = 0.35;
    o1.connect(og); o2.connect(og);
    og.connect(lp);
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    n.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = noiseFreq;
    nf.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.8;
    n.connect(nf).connect(ng).connect(lp);
    lp.connect(out).connect(this.master);
    o1.start(); o2.start(); n.start();
    this.loops[name] = { out, lp, o1, o2, nf, base, noiseFreq };
    return this.loops[name];
  }

  setLoop(name, intensity, pitch = 1, opts) {
    if (!this.ready) return;
    const l = this.ensureLoop(name, opts);
    if (!l) return;
    const t = this.ctx.currentTime;
    l.out.gain.setTargetAtTime(Math.max(0, intensity) * 0.35, t, 0.08);
    l.lp.frequency.setTargetAtTime(300 + 2600 * intensity * pitch, t, 0.1);
    l.o1.frequency.setTargetAtTime(l.base * pitch, t, 0.1);
    l.o2.frequency.setTargetAtTime(l.base * pitch * 1.012, t, 0.1);
    l.nf.frequency.setTargetAtTime(l.noiseFreq * (0.6 + pitch), t, 0.1);
  }
}

export const audio = new AudioSystem();
