import { describe, expect, it } from 'vitest';
import { getMove, MOVES } from '../src/data/moves';
import { MOVE_TUNING, MoveController, type MoveEvent } from '../src/gameplay/MoveController';
import type { MoveSituation } from '../src/gameplay/moveTypes';

const STILL: MoveSituation = { stickX: 0, stickY: 0, speed: 0 };
const SPRINT: MoveSituation = { stickX: 0, stickY: 1, speed: 6 };
const SIDE: MoveSituation = { stickX: 1, stickY: 0, speed: 1 };

function step(mc: MoveController, from: number, to: number, s = STILL): MoveEvent[] {
  const out: MoveEvent[] = [];
  for (let t = from; t <= to + 1e-9; t += 1 / 120) {
    mc.update(t, s);
    out.push(...mc.drain());
  }
  return out;
}

describe('MoveController', () => {
  it('picks the move from category + situation (hybrid input)', () => {
    const mc = new MoveController(MOVES);
    expect(mc.resolve('kick', STILL)?.id).toBe('spinkick');
    expect(mc.resolve('kick', SPRINT)?.id).toBe('tornado_kick');
    expect(mc.resolve('acro', SIDE)?.id).toBe('cartwheel');
    expect(mc.resolve('acro', STILL)?.id).toBe('butterfly_kick');
    expect(mc.resolve('footwork', SPRINT)?.id).toBe('two_step');
    expect(mc.resolve('arms', STILL)?.layer).toBe('upper');
  });

  it('layers arms over footwork', () => {
    const mc = new MoveController(MOVES);
    mc.press('footwork', 0, STILL);
    mc.press('arms', 0.05, STILL);
    expect(mc.full?.def.id).toBe('two_step');
    expect(mc.upper?.def.id).toBe('windmill');
    expect(mc.upper?.layered).toBe(true);
  });

  it('buffers a press before the cancel window and fires when it opens', () => {
    const mc = new MoveController(MOVES);
    const kick = getMove('spinkick');
    mc.press('kick', 0, STILL);
    mc.drain();
    const open = kick.duration * kick.cancelFrom;
    mc.press('footwork', open - 0.1, STILL);
    expect(mc.full?.def.id).toBe('spinkick');
    const events = step(mc, open - 0.09, open + 0.02);
    const start = events.find((e) => e.type === 'start');
    expect(start?.type === 'start' && start.move.def.id).toBe('two_step');
    expect(start?.type === 'start' && start.move.linked).toBe(true);
    expect(start?.type === 'start' && Math.abs(start.move.startTime - open)).toBeLessThan(0.01);
  });

  it('drops presses made too early (no queueing ahead)', () => {
    const mc = new MoveController(MOVES);
    const kick = getMove('butterfly_kick');
    mc.press('acro', 0, STILL);
    mc.press('footwork', 0.05, STILL);
    mc.drain();
    const events = step(mc, 0.06, kick.duration * kick.cancelFrom + 0.05);
    expect(events.some((e) => e.type === 'start')).toBe(false);
    expect(0.05 + MOVE_TUNING.bufferSec).toBeLessThan(kick.duration * kick.cancelFrom);
  });

  it('runs takeoff → air → landing phases', () => {
    const mc = new MoveController(MOVES);
    const def = getMove('butterfly_kick');
    mc.press('acro', 0, STILL);
    expect(mc.airborne(def.duration * (def.air!.takeoff - 0.05))).toBe(false);
    expect(mc.airborne(def.duration * (def.air!.takeoff + 0.05))).toBe(true);
    const events = step(mc, 0, def.duration + 0.01);
    const land = events.find((e) => e.type === 'land');
    expect(land?.type === 'land' && land.time).toBeCloseTo(def.duration * def.air!.land, 2);
    expect(events.some((e) => e.type === 'end')).toBe(true);
  });

  it('alternates sides on repeated moves and blocks input while bailing', () => {
    const mc = new MoveController(MOVES);
    mc.press('footwork', 0, STILL);
    const first = mc.full!.mirror;
    mc.press('footwork', 0.4, STILL);
    expect(mc.full!.mirror).toBe(!first);
    mc.bail(0.45);
    mc.press('kick', 0.5, STILL);
    expect(mc.full).toBeNull();
    expect(mc.isBailing(0.5)).toBe(true);
  });
});
