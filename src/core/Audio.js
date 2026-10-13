// Procedural sound: every sample is synthesized at startup (no asset files). The bot's beam and footsteps are
// positional (HRTF) so you can hear where it is. Hitsounds differ for shield vs health hits.
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
  }

  init() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    this.sr = ctx.sampleRate;
    this.buf = {};
    this.synthAll();
    this.loops = {};
    this.loops.lgSelf = this.makeLoop(this.buf.lgHum, null, 0.32);
    this.loops.lgBot = this.makeLoop(this.buf.lgHum, this.makePanner(), 0.5);
    this.loops.lift = this.makeLoop(this.buf.liftHum, null, 0);
  }

  resume() {
    this.init();
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  // --- synthesis helpers ---
  render(seconds, fn) {
    const n = Math.max(1, Math.floor(seconds * this.sr));
    const b = this.ctx.createBuffer(1, n, this.sr);
    const d = b.getChannelData(0);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / this.sr;
      d[i] = fn(t, (f) => (phase += (2 * Math.PI * f) / this.sr));
    }
    return b;
  }

  synthAll() {
    const B = this.buf;
    const rnd = () => Math.random() * 2 - 1;
    const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
    // Shield hit: bright QL-style "tink". Health hit: lower, meatier "tock" so you hear the shields are gone.
    B.hitShield = this.render(0.08, (t) => env(t, 0.001, 0.018) * (Math.sin(2 * Math.PI * 1760 * t) * 0.7 + Math.sin(2 * Math.PI * 3520 * t) * 0.25));
    B.hitHealth = this.render(0.09, (t) => env(t, 0.001, 0.025) * (Math.sin(2 * Math.PI * 820 * t) * 0.8 + Math.sin(2 * Math.PI * 1640 * t) * 0.2));
    B.shieldPop = this.render(0.45, (t, ph) => {
      const f = 1700 * Math.exp(-t * 7) + 180;
      return env(t, 0.003, 0.12) * (Math.sin(ph(f)) * 0.6 + rnd() * 0.35 * Math.exp(-t * 18));
    });
    B.recharge = this.render(1.1, (t, ph) => {
      const f = 260 + 900 * (t / 1.1) ** 1.4;
      return Math.min(1, t * 12) * Math.min(1, (1.1 - t) * 8) * 0.35 * Math.sin(ph(f)) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 22 * t));
    });
    B.kill = this.render(0.9, (t) => {
      const chord = [523.25, 659.25, 783.99, 1046.5].reduce((a, f, k) => a + Math.sin(2 * Math.PI * f * t) * (k === 3 ? 0.4 : 1), 0) / 3.4;
      const thump = Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 14);
      return env(t, 0.004, 0.32) * chord * 0.75 + thump * 0.6;
    });
    B.death = this.render(0.8, (t, ph) => env(t, 0.005, 0.3) * Math.sin(ph(320 * Math.exp(-t * 3) + 40)) * 0.7);
    B.hurt = this.render(0.1, (t) => env(t, 0.002, 0.03) * (rnd() * 0.5 + Math.sin(2 * Math.PI * 140 * t) * 0.6));
    B.jump = this.render(0.16, (t, ph) => env(t, 0.01, 0.05) * (Math.sin(ph(300 + t * 1400)) * 0.18 + rnd() * 0.08));
    B.land = this.render(0.14, (t) => env(t, 0.002, 0.035) * (Math.sin(2 * Math.PI * 85 * t) * 0.8 + rnd() * 0.2));
    B.step = this.render(0.06, (t) => env(t, 0.001, 0.012) * rnd() * 0.7);
    B.pad = this.render(0.8, (t, ph) => env(t, 0.02, 0.25) * (Math.sin(ph(180 + t * 900)) * 0.35 + rnd() * 0.25 * Math.exp(-t * 4)));
    B.count = this.render(0.14, (t) => env(t, 0.002, 0.05) * Math.sin(2 * Math.PI * 880 * t) * 0.5);
    B.go = this.render(0.4, (t) => env(t, 0.002, 0.14) * (Math.sin(2 * Math.PI * 1320 * t) + Math.sin(2 * Math.PI * 1760 * t) * 0.5) * 0.4);
    B.lowShield = this.render(0.07, (t) => env(t, 0.002, 0.02) * Math.sin(2 * Math.PI * 1150 * t) * 0.35);
    B.lgStart = this.render(0.12, (t, ph) => env(t, 0.002, 0.04) * (Math.sin(ph(400 + t * 6000)) * 0.4 + rnd() * 0.25));
    // 1 s seamless electric hum: integer-Hz partials + crackle.
    B.lgHum = this.render(1.0, (t) => {
      const saw = (f) => 2 * ((t * f) % 1) - 1;
      let s = saw(100) * 0.35 + saw(150) * 0.2 + Math.sin(2 * Math.PI * 50 * t) * 0.3;
      s += (Math.random() < 0.02 ? rnd() : 0) * 0.8 + rnd() * 0.12;
      return Math.tanh(s * 1.4) * 0.5;
    });
    B.liftHum = this.render(1.0, (t) => (Math.sin(2 * Math.PI * 60 * t) * 0.5 + Math.sin(2 * Math.PI * 90 * t) * 0.25 + rnd() * 0.05) * 0.4);
  }

  makePanner() {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 160;
    p.rolloffFactor = 1.1;
    p.maxDistance = 4000;
    p.connect(this.master);
    return p;
  }

  makeLoop(buffer, panner, level) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(g);
    g.connect(panner || this.master);
    src.start();
    return { src, g, panner, level, on: false };
  }

  setLoop(name, on, pos, level) {
    const l = this.loops?.[name];
    if (!l) return;
    const lv = level ?? l.level;
    if (on !== l.on || level !== undefined) {
      l.g.gain.setTargetAtTime(on ? lv : 0, this.ctx.currentTime, on ? 0.01 : 0.04);
      l.on = on;
    }
    if (pos && l.panner) this.place(l.panner, pos);
  }

  place(p, pos) {
    const t = this.ctx.currentTime;
    p.positionX.setValueAtTime(pos.x, t);
    p.positionY.setValueAtTime(pos.y, t);
    p.positionZ.setValueAtTime(pos.z, t);
  }

  setListener(pos, fwd) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(pos.x, t);
      L.positionY.setValueAtTime(pos.y, t);
      L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(fwd.x, t);
      L.forwardY.setValueAtTime(fwd.y, t);
      L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(0, t);
      L.upY.setValueAtTime(1, t);
      L.upZ.setValueAtTime(0, t);
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  play(name, { vol = 1, rate = 1, at = null } = {}) {
    if (!this.ctx || !this.buf[name]) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buf[name];
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    if (at) {
      const p = this.makePanner();
      this.place(p, at);
      g.connect(p);
      src.onended = () => p.disconnect();
    } else g.connect(this.master);
    src.start();
  }
}
