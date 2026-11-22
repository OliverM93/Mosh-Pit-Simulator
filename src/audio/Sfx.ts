import type { AudioEngine } from './AudioEngine';
import { midiToHz } from './AudioEngine';

/**
 * Synthesised sound effects and crowd ambience. Everything is generated at
 * runtime – no sample files, no licensing questions.
 */
export class Sfx {
  private readonly engine: AudioEngine;
  private ambience: { gain: GainNode; filter: BiquadFilterNode } | null = null;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  private get ctx(): AudioContext | null {
    return this.engine.ready ? this.engine.ctx : null;
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
    const c = this.ctx;
    if (!c) return;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.engine.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, type: BiquadFilterType, freq: number, vol: number, q = 1, sweepTo?: number): void {
    const c = this.ctx;
    if (!c) return;
    const src = c.createBufferSource();
    src.buffer = this.engine.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.engine.sfx);
    // Loop the (2 s) noise buffer so long sounds never run out; random start offset ≥ 0.
    src.loop = true;
    src.start(t, Math.random() * Math.max(0, this.engine.noise.duration - 0.1));
    src.stop(t + dur + 0.05);
  }

  uiMove(): void {
    const c = this.ctx;
    if (c) this.tone(880, c.currentTime, 0.05, 'square', 0.08);
  }

  uiSelect(): void {
    const c = this.ctx;
    if (!c) return;
    this.tone(660, c.currentTime, 0.07, 'square', 0.1);
    this.tone(990, c.currentTime + 0.06, 0.1, 'square', 0.1);
  }

  /** Short chime for a move that earned bonus tags (on beat / clean link). */
  bonusTag(strong: boolean): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    this.tone(strong ? 1318 : 1046, t, 0.07, 'square', 0.06);
    if (strong) this.tone(1760, t + 0.05, 0.1, 'square', 0.05);
  }

  whoosh(strength: number): void {
    const c = this.ctx;
    if (c) this.noise(c.currentTime, 0.22 + strength * 0.1, 'bandpass', 600, 0.25 * strength, 1.5, 3000);
  }

  impact(strength: number): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    this.tone(120, t, 0.18, 'sine', 0.5 * Math.min(1.5, strength), 45);
    this.noise(t, 0.12, 'lowpass', 1200, 0.3 * strength);
  }

  bail(): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    this.tone(400, t, 0.45, 'sawtooth', 0.12, 90);
    this.tone(90, t + 0.25, 0.25, 'sine', 0.6, 40);
    this.noise(t + 0.25, 0.2, 'lowpass', 900, 0.4);
  }

  bank(total: number): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const notes = total > 50000 ? [72, 76, 79, 84, 88] : total > 10000 ? [72, 76, 79, 84] : [72, 79];
    notes.forEach((n, i) => this.tone(midiToHz(n), t + i * 0.055, 0.14, 'square', 0.08));
  }

  bonus(): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    [84, 88, 91].forEach((n, i) => this.tone(midiToHz(n), t + i * 0.04, 0.1, 'triangle', 0.09));
  }

  cheer(strength: number): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const dur = 1.2 + strength;
    // Two formant-ish noise bands = a crowd "WOOO".
    this.noise(t, dur, 'bandpass', 700, 0.35 * strength, 2.2, 1100);
    this.noise(t + 0.05, dur, 'bandpass', 1800, 0.18 * strength, 3, 2400);
  }

  ooh(): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    this.noise(t, 1.1, 'bandpass', 500, 0.3, 4, 320);
  }

  /** Continuous room tone; intensity 0..1 follows the pit energy. */
  setAmbience(intensity: number): void {
    const c = this.ctx;
    if (!c) return;
    if (!this.ambience) {
      const src = c.createBufferSource();
      src.buffer = this.engine.noise;
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 600;
      filter.Q.value = 0.8;
      const gain = c.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.engine.crowd);
      src.start();
      this.ambience = { gain, filter };
    }
    const t = c.currentTime;
    this.ambience.gain.gain.setTargetAtTime(0.025 + intensity * 0.07, t, 0.3);
    this.ambience.filter.frequency.setTargetAtTime(450 + intensity * 600, t, 0.3);
  }
}
