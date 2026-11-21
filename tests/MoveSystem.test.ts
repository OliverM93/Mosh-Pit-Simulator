import { describe, expect, it } from 'vitest';
import { SongTimeline } from '../src/audio/SongTimeline';
import { MOVES } from '../src/data/moves';
import { MoveSystem, type MoveEvent, type MoveRequest } from '../src/gameplay/MoveSystem';
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

describe('MoveSystem', () => {
  it('starts on-beat presses as perfect and quantises the length to the grid', () => {
    const { ms, press } = setup();
    press(req('kick', 1.01));
    const cur = ms.current!;
    expect(cur.def.id).toBe('spinkick');
    expect(cur.rating).toBe('perfect');
    // 0.7 s natural length at 0.5 s pulses → round(1.4) = 1 pulse, anchored at 1.0.
    expect(cur.endTime).toBeCloseTo(1.5);
  });

  it('bails on an off-beat press and ignores input while bailing', () => {
    const { ms, events, press, step } = setup();
    press(req('arms', 1.25));
    expect(events.some((e) => e.type === 'bail')).toBe(true);
    expect(ms.isBailing).toBe(true);
    press(req('arms', 1.5));
    expect(ms.current).toBeNull();
    step(10);
    expect(ms.isBailing).toBe(false);
    expect(events.some((e) => e.type === 'recover')).toBe(true);
  });

  it('buffers the next move and starts it exactly when the current one ends', () => {
    const { ms, events, press, step } = setup();
    press(req('arms', 2.0)); // forward arms: 0.7 s → 1 pulse (0.5 s) at 120 BPM
    expect(ms.current!.endTime).toBeCloseTo(2.5);
    press(req('kick', 2.49));
    expect(ms.current!.def.id).toBe('spinkick'); // cancel window (progress ≥ 0.65) starts immediately
    expect(ms.current!.cleanLink).toBe(true);
    step(3.0);
    expect(events.filter((e) => e.type === 'start')).toHaveLength(2);
  });

  it('queues presses that come before the cancel window', () => {
    const { ms, press, step } = setup();
    // Breakdown: 1 s pulses. Cartwheel 0.75 s → 1 pulse.
    press(req('floor', 9.0, 'side', 1));
    expect(ms.current!.def.id).toBe('cartwheel');
    press(req('step', 9.03)); // progress 3% → buffered
    expect(ms.current!.def.id).toBe('cartwheel');
    step(10.0);
    expect(ms.current!.def.id).toBe('two_step');
    expect(ms.current!.startTime).toBeCloseTo(10.0);
    expect(ms.current!.cleanLink).toBe(true);
  });

  it('converts a hop into an air move and extends the airtime', () => {
    const { ms, events, press } = setup();
    press(req('jump', 3.0));
    const hop = ms.current!;
    expect(hop.def.id).toBe('hop');
    press(req('kick', 3.2));
    const air = ms.current!;
    expect(air.def.id).toBe('tornado_kick');
    expect(air.rating).toBe(hop.rating);
    expect(air.endTime - 3.2).toBeGreaterThanOrEqual(0.6 * air.def.durationSec - 1e-9);
    expect(events.some((e) => e.type === 'convert')).toBe(true);
  });

  it('mirrors alternating moves on consecutive use', () => {
    const { ms, press, step } = setup();
    press(req('step', 1.0));
    const first = ms.current!.mirror;
    step(1.5);
    press(req('step', 1.5));
    expect(ms.current!.mirror).toBe(!first);
  });
});
