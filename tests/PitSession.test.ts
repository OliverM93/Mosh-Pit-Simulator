import { describe, expect, it } from 'vitest';
import { getSong } from '../src/data/songs';
import { getVenue } from '../src/data/venues';
import { BeatManager } from '../src/gameplay/BeatManager';
import type { MoveCategory } from '../src/gameplay/moveTypes';
import { PitSession, type FrameInput } from '../src/gameplay/PitSession';
import { SongTimeline } from '../src/audio/SongTimeline';
import { testSong } from './helpers';

const DT = 1 / 60;

function input(over: Partial<FrameInput> = {}): FrameInput {
  return { moveX: 0, moveZ: 0, stickX: 0, stickY: 0, sprint: false, presses: [], ...over };
}

describe('PitSession', () => {
  it('plays the test song headless: free movement, combos bank, music events fire', () => {
    const s = new PitSession(getSong('basement_rules'), getVenue('basement'));
    const counts: Record<string, number> = { bank: 0, scored: 0, land: 0, section: 0, beatdrop: 0, songEnd: 0 };
    for (const k of Object.keys(counts) as (keyof typeof counts)[]) s.events.on(k as 'bank', () => counts[k]!++);
    const script: MoveCategory[] = ['footwork', 'arms', 'kick', 'footwork', 'acro', 'footwork'];
    let i = 0;
    for (let t = -0.2, f = 0; t < s.timeline.duration + 0.5; t += DT, f++) {
      // Circle around the pit, throw a move every 0.6 s for 4 s, then pause so the combo banks.
      const a = t * 0.8;
      const presses = f % 36 === 0 && t % 7 < 4 ? [{ category: script[i++ % script.length]!, time: t }] : [];
      s.update(DT, t, input({ moveX: Math.cos(a) * 0.7, moveZ: Math.sin(a) * 0.7, stickX: 0.3, stickY: 0.7, presses }));
    }
    expect(counts.songEnd).toBe(1);
    expect(counts.bank).toBeGreaterThan(5);
    expect(counts.land).toBeGreaterThan(3);
    expect(counts.section).toBeGreaterThan(5);
    expect(counts.beatdrop).toBe(3);
    expect(s.combo.score).toBeGreaterThan(5000);
  });

  it('keeps the combo alive across chained moves and banks after the timer runs out', () => {
    const s = new PitSession(testSong(), getVenue('basement'));
    const banks: number[] = [];
    s.events.on('bank', (e) => banks.push(e.result.moves));
    let t = 0;
    const press = (category: MoveCategory) => s.update(DT, (t += DT), input({ presses: [{ category, time: t }] }));
    const idle = (sec: number) => {
      for (let k = 0; k < sec / DT; k++) s.update(DT, (t += DT), input());
    };
    press('footwork');
    idle(0.4);
    press('kick');
    idle(0.9);
    press('footwork');
    idle(1);
    expect(s.combo.entries.length).toBe(3);
    idle(3);
    expect(banks).toEqual([3]);
  });

  it('crashes risky moves thrown into the packed crowd', () => {
    const s = new PitSession(testSong(), getVenue('basement'));
    let bails = 0;
    s.events.on('bail', () => bails++);
    s.update(DT, 0, input());
    // Teleport into the pit wall.
    const watchers = s.crowd.agents.filter((a) => a.role === 'watcher');
    const dense = (a: (typeof watchers)[number]) => s.crowd.countNear(a.x, a.z, 0.84);
    const w = watchers.reduce((best, a) => (dense(a) > dense(best) ? a : best));
    s.movement.x = w.x;
    s.movement.z = w.z;
    s.update(DT, DT, input({ presses: [{ category: 'acro', time: DT }] }));
    expect(bails).toBe(1);
    expect(s.moves.isBailing(DT * 2)).toBe(true);
  });
});

describe('BeatManager', () => {
  it('detects on-beat starts and drop hits; never required', () => {
    const b = new BeatManager(new SongTimeline(testSong()));
    expect(b.onBeat(0.5)).toBe(true);
    expect(b.onBeat(0.75)).toBe(false);
    expect(b.dropHit(8.1)).toBe(true); // beatdrop at bar 4 = 8 s
    expect(b.isBreakdown(9)).toBe(true);
  });
});
