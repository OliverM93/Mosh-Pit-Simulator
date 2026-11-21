import { describe, expect, it } from 'vitest';
import { estimateTempo } from '../src/audio/tempo';
import { Rng } from '../src/core/random';

const SR = 22050;

/** Synthetic hardcore-ish track: kicks/snares on the beat, quieter off-beat hats, noise floor. */
function track(bpm: number, offset: number, seconds: number, halfTimeFrom = Infinity): Float32Array {
  const out = new Float32Array(Math.floor(seconds * SR));
  const rng = new Rng(3);
  for (let i = 0; i < out.length; i++) out[i] = (rng.next() - 0.5) * 0.01;
  const spb = 60 / bpm;
  const hit = (t: number, amp: number, len: number, freq: number) => {
    const s = Math.floor(t * SR);
    for (let i = 0; i < len * SR && s + i < out.length; i++) {
      const env = Math.exp(-i / (SR * len * 0.25));
      out[s + i] += amp * env * (freq > 0 ? Math.sin((2 * Math.PI * freq * i) / SR) : rng.next() - 0.5);
    }
  };
  for (let b = 0; offset + b * spb < seconds; b++) {
    const t = offset + b * spb;
    const half = t >= halfTimeFrom;
    if (!half || b % 2 === 0) hit(t, 0.8, 0.15, 60);
    if (b % 2 === 1 && !half) hit(t, 0.5, 0.12, 0);
    hit(t + spb / 2, 0.12, 0.03, 0); // off-beat hat
  }
  return out;
}

describe('estimateTempo', () => {
  it('finds BPM and first-beat offset of a steady track', () => {
    const est = estimateTempo(track(165, 0.37, 30), SR);
    expect(Math.abs(est.bpm - 165)).toBeLessThan(0.15);
    const spb = 60 / est.bpm;
    const d = (((est.offsetSec - 0.37) % spb) + spb) % spb;
    const phaseErr = Math.min(d, spb - d);
    expect(phaseErr).toBeLessThan(0.015);
    expect(est.confidence).toBeGreaterThan(0.2);
  });

  it('keeps the real tempo when a half-time breakdown follows', () => {
    const est = estimateTempo(track(140, 0.1, 30, 18), SR);
    expect(Math.abs(est.bpm - 140)).toBeLessThan(0.2);
  });

  it('handles a slow beatdown tempo', () => {
    const est = estimateTempo(track(92, 0.8, 30), SR);
    expect(Math.abs(est.bpm - 92)).toBeLessThan(0.15);
  });
});
