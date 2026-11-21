import { distortionCurve, midiToHz } from './AudioEngine';

/**
 * Tiny Web Audio synth voices for the placeholder band. Every voice is
 * scheduled at an exact AudioContext time → sample-accurate sync with the
 * song timeline. All sounds are generated, no samples.
 */
export class DrumKit {
  private readonly ctx: AudioContext;
  private readonly out: AudioNode;
  private readonly noise: AudioBuffer;

  constructor(ctx: AudioContext, out: AudioNode, noise: AudioBuffer) {
    this.ctx = ctx;
    this.out = out;
    this.noise = noise;
  }

  private noiseSource(t: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start(t, Math.random() * Math.max(0, this.noise.duration - 0.1));
    return src;
  }

  kick(t: number, accent = 1): void {
    const c = this.ctx;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.0 * accent, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.35);
    // Beater click.
    const n = this.noiseSource(t);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.25 * accent, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    n.connect(hp).connect(ng).connect(this.out);
    n.stop(t + 0.03);
  }

  snare(t: number, accent = 1): void {
    const c = this.ctx;
    const n = this.noiseSource(t);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0.7 * accent, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    n.connect(bp).connect(g).connect(this.out);
    n.stop(t + 0.22);
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(230, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.06);
    const og = c.createGain();
    og.gain.setValueAtTime(0.5 * accent, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(og).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  hat(t: number, open = false, accent = 1): void {
    const c = this.ctx;
    const n = this.noiseSource(t);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = c.createGain();
    const len = open ? 0.28 : 0.045;
    g.gain.setValueAtTime(0.22 * accent, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    n.connect(hp).connect(g).connect(this.out);
    n.stop(t + len + 0.02);
  }

  crash(t: number): void {
    const c = this.ctx;
    const n = this.noiseSource(t);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3500;
    const pk = c.createBiquadFilter();
    pk.type = 'peaking';
    pk.frequency.value = 6000;
    pk.gain.value = 6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    n.connect(hp).connect(pk).connect(g).connect(this.out);
    n.stop(t + 1.7);
  }

  tom(t: number, pitch = 110): void {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch * 1.4, t);
    osc.frequency.exponentialRampToValueAtTime(pitch, t + 0.08);
    const g = c.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.4);
  }
}

/** A distorted "amp" bus; notes feed into it so chords distort together. */
export class GuitarAmp {
  readonly input: GainNode;
  private readonly ctx: AudioContext;

  constructor(ctx: AudioContext, out: AudioNode, pan: number, drive = 30) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.input.gain.value = 0.9;
    const shaper = ctx.createWaveShaper();
    shaper.curve = distortionCurve(drive);
    shaper.oversample = '4x';
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 80;
    const cab = ctx.createBiquadFilter();
    cab.type = 'lowpass';
    cab.frequency.value = 3800;
    cab.Q.value = 0.9;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 650;
    mid.Q.value = 0.8;
    mid.gain.value = -5;
    const level = ctx.createGain();
    level.gain.value = 0.16;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    this.input.connect(shaper).connect(hp).connect(mid).connect(cab).connect(level).connect(panner).connect(out);
  }

  /** Power chord (root, fifth, octave). Palm-muted = short + dark. */
  chord(t: number, midi: number, dur: number, muted: boolean, detune = 0): void {
    const c = this.ctx;
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = muted ? 750 : 5200;
    const len = muted ? Math.min(dur, 0.14) : dur;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(muted ? 0.9 : 0.75, t + 0.004);
    g.gain.setValueAtTime(muted ? 0.9 : 0.7, t + Math.max(0.005, len - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.05);
    lp.connect(g).connect(this.input);
    for (const interval of [0, 7, 12]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiToHz(midi + interval);
      o.detune.value = detune + (interval === 12 ? 4 : 0);
      o.connect(lp);
      o.start(t);
      o.stop(t + len + 0.08);
    }
  }

  /** Single lead note an octave up with a little vibrato. */
  lead(t: number, midi: number, dur: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = midiToHz(midi);
    const vib = c.createOscillator();
    vib.frequency.value = 5.5;
    const vg = c.createGain();
    vg.gain.value = 6;
    vib.connect(vg).connect(o.detune);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    g.gain.setValueAtTime(0.3, t + Math.max(0.02, dur - 0.04));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    o.connect(g).connect(this.input);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.06);
    vib.stop(t + dur + 0.06);
  }
}

export class Bass {
  private readonly ctx: AudioContext;
  private readonly bus: GainNode;

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.32;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const drive = ctx.createWaveShaper();
    drive.curve = distortionCurve(4);
    this.bus.connect(drive).connect(lp).connect(out);
  }

  note(t: number, midi: number, dur: number): void {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.005);
    g.gain.setValueAtTime(0.85, t + Math.max(0.01, dur - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    g.connect(this.bus);
    const saw = c.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = midiToHz(midi);
    const sub = c.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = midiToHz(midi - 12);
    const sg = c.createGain();
    sg.gain.value = 0.8;
    saw.connect(g);
    sub.connect(sg).connect(g);
    saw.start(t);
    sub.start(t);
    saw.stop(t + dur + 0.06);
    sub.stop(t + dur + 0.06);
  }
}
