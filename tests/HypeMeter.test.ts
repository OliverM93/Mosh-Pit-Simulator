import { describe, expect, it } from 'vitest';
import { HYPE_TUNING, HypeMeter } from '../src/gameplay/HypeMeter';

describe('HypeMeter', () => {
  it('triggers a frenzy when full and ends it after its duration', () => {
    const h = new HypeMeter();
    expect(h.add(0.5)).toBe(false);
    expect(h.add(0.6)).toBe(true);
    expect(h.frenzy).toBe(true);
    let ended = false;
    for (let t = 0; t < HYPE_TUNING.frenzyDuration + 1 && !ended; t += 0.1) ended = h.update(0.1);
    expect(ended).toBe(true);
    expect(h.frenzy).toBe(false);
  });

  it('drops on a bail', () => {
    const h = new HypeMeter();
    h.add(0.6);
    h.bail();
    expect(h.value).toBeCloseTo(0.3);
  });
});
