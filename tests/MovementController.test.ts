import { describe, expect, it } from 'vitest';
import { MOVEMENT_TUNING, MovementController } from '../src/gameplay/MovementController';

const DT = 1 / 60;

function run(m: MovementController, sec: number, moveX: number, moveZ: number, sprint = false) {
  for (let t = 0; t < sec; t += DT) m.update(DT, { moveX, moveZ, sprint }, null);
}

describe('MovementController', () => {
  it('reaches walking speed quickly and sprint speed only with a run-up', () => {
    const m = new MovementController();
    m.reset(0, 0, 0);
    run(m, 0.25, 0, 1);
    expect(m.speed).toBeGreaterThan(MOVEMENT_TUNING.walkSpeed * 0.95);
    run(m, 0.3, 0, 1, true);
    expect(m.speed).toBeLessThan(MOVEMENT_TUNING.sprintSpeed * 0.75);
    run(m, 1.2, 0, 1, true);
    expect(m.speed).toBeCloseTo(MOVEMENT_TUNING.sprintSpeed, 1);
    expect(m.momentum).toBeCloseTo(1, 1);
  });

  it('pivots instantly when slow but turns in an arc at speed', () => {
    const slow = new MovementController();
    slow.reset(0, 0, 0);
    run(slow, 0.15, 1, 0);
    expect(Math.abs(slow.heading - Math.PI / 2)).toBeLessThan(0.15);

    const fast = new MovementController();
    fast.reset(0, 0, 0);
    run(fast, 1.5, 0, 1, true);
    run(fast, 0.1, 1, 0, true);
    // After 0.1 s at sprint speed the heading has only turned part of the way.
    expect(fast.heading).toBeGreaterThan(0.2);
    expect(fast.heading).toBeLessThan(Math.PI / 2 - 0.5);
  });

  it('skids (brakes) when reversing at speed and keeps momentum without input', () => {
    const m = new MovementController();
    m.reset(0, 0, 0);
    run(m, 1, 0, 1);
    m.update(DT, { moveX: 0, moveZ: -1, sprint: false }, null);
    expect(m.skidding).toBe(true);
    const before = m.speed;
    m.update(DT, { moveX: 0, moveZ: 0, sprint: false }, { steer: 1, speed: 1, carry: 1, lockFacing: false });
    expect(m.speed).toBeGreaterThan(before - 0.1);
  });

  it('limits crowd pushes to a correction, never a fling', () => {
    const m = new MovementController();
    m.reset(0, 0, 0);
    m.push(5, 0);
    m.update(DT, { moveX: 0, moveZ: 0, sprint: false }, null);
    expect(m.x).toBeLessThanOrEqual(MOVEMENT_TUNING.maxPushSpeed * DT + 1e-9);
  });
});
