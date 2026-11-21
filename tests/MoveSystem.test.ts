import { describe, expect, it } from 'vitest';
import { SongTimeline } from '../src/audio/SongTimeline';
import { getMove, MOVES } from '../src/data/moves';
import { MOVE_TUNING, MoveSystem, type MoveEvent, type MoveRequest } from '../src/gameplay/MoveSystem';
import { testSong } from './helpers';

const req = (button: MoveRequest['button'], pressTime: number, direction: MoveRequest['direction'] = 'neutral', side = 0): MoveRequest => ({
  button,
  direction,
  side,
  pressTime,
});

function setup() {
  const ms = new MoveSystem(new SongTimeline(testSong()), MOVES);
  const events: MoveEvent[] = [];
  const step = (t: number) => {
    ms.update(t);
    events.push(...ms.drain());
  };
  const press = (r: MoveRequest) => {
    ms.press(r);
    events.push(...ms.drain());
  };
  return { ms, events, step, press };
}

describe('MoveSystem (groove model)', () => {
  it('plays moves at their natural length and judges timing as a bonus', () => {
    const { ms, press } = setup();
    press(req('kick', 1.01));
    const cur = ms.current!;
    expect(cur.def.id).toBe('spinkick');
    expect(cur.rating).toBe('perfect');
    expect(cur.endTime - cur.startTime).toBeCloseTo(getMove('spinkick').durationSec);
  });

  it('never bails for an off-beat press', () => {
    const { ms, events, press } = setup();
    press(req('arms', 1.25)); // exactly between two beats
    expect(ms.current!.def.id).toBe('forward_arms');
    expect(ms.current!.rating).toBe('miss');
    expect(events.some((e) => e.type === 'bail')).toBe(false);
  });

  it('cancels into the next move inside the cancel window', () => {
    const { ms, press } = setup();
    press(req('arms', 2.0));
    const end = ms.current!.endTime;
    press(req('kick', end - 0.1)); // progress > cancelAt
    expect(ms.current!.def.id).toBe('spinkick');
    expect(ms.current!.cleanLink).toBe(true);
  });

  it('buffers a late press and starts it exactly when the move ends', () => {
    const { ms, press, step } = setup();
    press(req('floor', 9.0, 'side', 1));
    const end = ms.current!.endTime;
    press(req('step', end - MOVE_TUNING.bufferSec + 0.05)); // before cancelAt (0.8), inside buffer
    expect(ms.current!.def.id).toBe('cartwheel');
    step(end);
    expect(ms.current!.def.id).toBe('two_step');
    expect(ms.current!.startTime).toBeCloseTo(end);
    expect(ms.current!.cleanLink).toBe(true);
  });

  it('ignores presses early in a long move', () => {
    const { ms, press } = setup();
    press(req('floor', 3.0, 'side', 1));
    press(req('kick', 3.05));
    expect(ms.current!.def.id).toBe('cartwheel');
  });

  it('converts a hop into an air move', () => {
    const { ms, events, press } = setup();
    press(req('jump', 3.0));
    const hop = ms.current!;
    press(req('kick', 3.2));
    const air = ms.current!;
    expect(air.def.id).toBe('tornado_kick');
    expect(air.rating).toBe(hop.rating);
    expect(air.endTime - 3.2).toBeGreaterThanOrEqual(air.def.durationSec * MOVE_TUNING.airMinShare - 1e-9);
    expect(events.some((e) => e.type === 'convert')).toBe(true);
  });

  it('bails only when forced (crash) and recovers', () => {
    const { ms, events, press, step } = setup();
    press(req('kick', 1.0));
    ms.forceBail(1.0);
    events.push(...ms.drain());
    expect(ms.isBailing).toBe(true);
    press(req('step', 1.2));
    expect(ms.current).toBeNull();
    step(1.0 + MOVE_TUNING.bailSec + 0.01);
    expect(ms.isBailing).toBe(false);
    expect(events.some((e) => e.type === 'recover')).toBe(true);
  });

  it('mirrors alternating moves on consecutive use', () => {
    const { ms, press, step } = setup();
    press(req('step', 1.0));
    const first = ms.current!.mirror;
    const end = ms.current!.endTime;
    step(end);
    press(req('step', end + 0.05));
    expect(ms.current!.mirror).toBe(!first);
  });
});
