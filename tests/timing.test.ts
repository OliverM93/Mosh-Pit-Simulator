import { describe, expect, it } from 'vitest';
import { judgeTiming, windowSeconds } from '../src/gameplay/timing';

describe('judgeTiming', () => {
  const interval = 0.36; // ~166 BPM

  it('rates by distance to the pulse', () => {
    expect(judgeTiming(0, interval)).toBe('perfect');
    expect(judgeTiming(-0.03, interval)).toBe('perfect');
    expect(judgeTiming(0.07, interval)).toBe('good');
    expect(judgeTiming(-0.12, interval)).toBe('okay');
    expect(judgeTiming(0.17, interval)).toBe('miss');
  });

  it('caps windows for slow half-time pulses', () => {
    expect(windowSeconds('perfect', 2)).toBeCloseTo(0.065);
    expect(judgeTiming(0.1, 2)).toBe('good');
    expect(judgeTiming(0.3, 2)).toBe('miss');
  });

  it('is symmetric', () => {
    for (const o of [0.01, 0.05, 0.09, 0.13, 0.2]) expect(judgeTiming(o, interval)).toBe(judgeTiming(-o, interval));
  });
});
