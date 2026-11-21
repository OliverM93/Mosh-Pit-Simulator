import { describe, expect, it } from 'vitest';
import { getSong, SONGS } from '../src/data/songs';
import { getVenue } from '../src/data/venues';
import type { MoveRequest } from '../src/gameplay/MoveSystem';
import { PitSession, type FrameInput } from '../src/gameplay/PitSession';

const DT = 1 / 60;

/** Headless bot that dances through a whole song on the beat. */
function playThrough(songId: string, offset = 0.01) {
  const session = new PitSession(getSong(songId), getVenue('basement'));
  const counts: Record<string, number> = {};
  for (const k of ['bank', 'bail', 'section', 'songEnd', 'moveScored', 'beatdrop'] as const) {
    counts[k] = 0;
    session.events.on(k, () => counts[k]!++);
  }
  const script: Array<[MoveRequest['button'], MoveRequest['direction'], number]> = [
    ['step', 'neutral', 0],
    ['arms', 'neutral', 0],
    ['kick', 'neutral', 0],
    ['floor', 'side', 1],
    ['arms', 'side', -1],
    ['step', 'forward', 0],
    ['floor', 'neutral', 0],
    ['arms', 'back', 0],
  ];
  let i = 0;
  let pulses = 0;
  let lastPulse = -1;
  const end = session.timeline.duration + 0.5;
  for (let t = -0.2; t < end; t += DT) {
    const presses: MoveRequest[] = [];
    const p = session.timeline.pulseAt(Math.max(0, t));
    const key = Math.round(p.prevTime * 1000);
    if (t >= 0 && key !== lastPulse) {
      lastPulse = key;
      pulses++;
      // Dance 8 pulses, rest 4 so combos bank.
      if (pulses % 12 < 8 && !session.moves.busy) {
        const [button, direction, side] = script[i++ % script.length]!;
        presses.push({ button, direction, side, pressTime: p.prevTime + offset });
      }
    }
    const input: FrameInput = {
      moveX: Math.sin(t * 0.7) * 0.6,
      moveZ: Math.cos(t * 0.5) * 0.6,
      sprint: false,
      cameraYaw: Math.PI,
      presses,
    };
    session.update(DT, t, input);
  }
  return { session, counts };
}

describe('PitSession (headless full song)', () => {
  for (const song of SONGS) {
    it(`${song.id} is playable start to finish`, () => {
      const { session, counts } = playThrough(song.id);
      expect(counts.songEnd).toBe(1);
      expect(counts.section).toBe(song.sections.length);
      expect(counts.beatdrop).toBe(song.events.length);
      expect(counts.moveScored).toBeGreaterThan(40);
      expect(counts.bank).toBeGreaterThan(3);
      expect(counts.bail).toBe(0);
      expect(session.combo.score).toBeGreaterThan(10000);
      expect(Number.isFinite(session.player.x) && Number.isFinite(session.player.z)).toBe(true);
      for (const a of session.crowd.agents) expect(Number.isFinite(a.x + a.z + a.yaw)).toBe(true);
    });
  }

  it('off-beat mashing bails and scores less than on-beat play', () => {
    const good = playThrough('basement_rules', 0.01).session.combo.score;
    const { session, counts } = playThrough('basement_rules', 0.16);
    expect(counts.bail).toBeGreaterThan(0);
    expect(session.combo.score).toBeLessThan(good);
  });

  it('keeps the player out of the stage and inside the room', () => {
    const { session } = playThrough('spin_to_win');
    const v = session.venue;
    expect(Math.abs(session.player.x)).toBeLessThanOrEqual(v.room.width / 2);
    expect(session.player.z).toBeGreaterThan(-v.room.depth / 2 + v.stage.depth);
  });
});
