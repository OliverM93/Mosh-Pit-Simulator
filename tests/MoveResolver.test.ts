import { describe, expect, it } from 'vitest';
import { MOVES } from '../src/data/moves';
import { classifyDirection, MoveResolver } from '../src/gameplay/MoveResolver';

describe('MoveResolver', () => {
  const r = new MoveResolver(MOVES);
  const id = (b: Parameters<MoveResolver['resolve']>[0], d: Parameters<MoveResolver['resolve']>[1], air = false) => r.resolve(b, d, air)?.id ?? null;

  it('maps buttons + directions to moves', () => {
    expect(id('step', 'neutral')).toBe('two_step');
    expect(id('step', 'side')).toBe('two_step');
    expect(id('step', 'forward')).toBe('crowd_push');
    expect(id('arms', 'neutral')).toBe('forward_arms');
    expect(id('arms', 'side')).toBe('side_arms');
    expect(id('arms', 'back')).toBe('pick_up_change');
    expect(id('kick', 'back')).toBe('spinkick');
    expect(id('floor', 'neutral')).toBe('floorwork');
    expect(id('floor', 'side')).toBe('cartwheel');
    expect(id('jump', 'forward')).toBe('hop');
  });

  it('has air variants only in the air', () => {
    expect(id('kick', 'neutral', true)).toBe('tornado_kick');
    expect(id('floor', 'side', true)).toBe('butterfly_kick');
    expect(id('step', 'neutral', true)).toBeNull();
  });

  it('every move id is unique', () => {
    expect(new Set(MOVES.map((m) => m.id)).size).toBe(MOVES.length);
  });
});

describe('classifyDirection', () => {
  it('uses a deadzone and the dominant axis', () => {
    expect(classifyDirection(0.1, 0.2).direction).toBe('neutral');
    expect(classifyDirection(0, 1).direction).toBe('forward');
    expect(classifyDirection(0.2, -0.9).direction).toBe('back');
    expect(classifyDirection(-1, 0.3)).toEqual({ direction: 'side', side: -1 });
  });
});
