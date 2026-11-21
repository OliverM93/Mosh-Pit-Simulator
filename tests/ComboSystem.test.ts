import { describe, expect, it } from 'vitest';
import { getMove } from '../src/data/moves';
import { ComboSystem, type MoveScoreContext } from '../src/gameplay/ComboSystem';
import type { Rating } from '../src/gameplay/timing';

const ctx = (rating: Rating = 'good', extra: Partial<MoveScoreContext> = {}): MoveScoreContext => ({
  rating,
  section: 'verse',
  cleanLink: true,
  runUp: false,
  cramped: false,
  frenzy: false,
  dropHit: false,
  ...extra,
});

function run(ids: string[], rating: Rating = 'good'): number {
  const c = new ComboSystem();
  ids.forEach((id, i) => c.addMove(getMove(id), ctx(rating), i));
  return c.bank()!.total;
}

describe('ComboSystem', () => {
  it('rewards variety far more than repeating one move', () => {
    const varied = run(['two_step', 'forward_arms', 'spinkick', 'floorwork', 'side_arms', 'cartwheel']);
    const spam = run(['spinkick', 'spinkick', 'spinkick', 'spinkick', 'spinkick', 'spinkick']);
    expect(varied).toBeGreaterThan(spam * 3);
  });

  it('pays more for perfect timing', () => {
    const ids = ['two_step', 'forward_arms', 'spinkick'];
    expect(run(ids, 'perfect')).toBeGreaterThan(run(ids, 'okay'));
  });

  it('stops growing the multiplier for stale repetitions', () => {
    const c = new ComboSystem();
    const m = getMove('spinkick');
    const gains = [0, 1, 2, 3].map((i) => c.addMove(m, ctx('okay'), i).multiplierGain);
    expect(gains[0]).toBe(1);
    expect(gains[3]).toBe(0);
  });

  it('applies breakdown bonuses only to advanced moves', () => {
    const c = new ComboSystem();
    const kick = c.addMove(getMove('spinkick'), ctx('okay', { section: 'breakdown', cleanLink: false }), 0);
    const c2 = new ComboSystem();
    const kick2 = c2.addMove(getMove('spinkick'), ctx('okay', { section: 'verse', cleanLink: false }), 0);
    expect(kick.points).toBeGreaterThan(kick2.points);
    const step = new ComboSystem().addMove(getMove('two_step'), ctx('okay', { section: 'breakdown' }), 0);
    const step2 = new ComboSystem().addMove(getMove('two_step'), ctx('okay', { section: 'verse' }), 0);
    expect(step.points).toBe(step2.points);
  });

  it('loses the whole combo on a bail', () => {
    const c = new ComboSystem();
    c.addMove(getMove('spinkick'), ctx(), 0);
    c.addMove(getMove('cartwheel'), ctx(), 1);
    expect(c.projected).toBeGreaterThan(0);
    const lost = c.bail();
    expect(lost).toBeGreaterThan(0);
    expect(c.score).toBe(0);
    expect(c.active).toBe(false);
    expect(c.stats.bails).toBe(1);
  });

  it('banks after the chain window expires', () => {
    const c = new ComboSystem();
    c.addMove(getMove('two_step'), ctx(), 0);
    expect(c.tick(0.5, false)).toBeNull(); // window = 0.8 s
    expect(c.tick(0.75, false)).toBeNull();
    const r = c.tick(0.85, false);
    expect(r).not.toBeNull();
    expect(c.score).toBe(r!.total);
  });

  it('still scores off-beat moves (timing is a bonus)', () => {
    const c = new ComboSystem();
    expect(c.addMove(getMove('spinkick'), ctx('miss'), 0).points).toBeGreaterThan(0);
  });

  it('awards named combos', () => {
    const c = new ComboSystem();
    c.addMove(getMove('two_step'), ctx(), 0);
    c.addMove(getMove('forward_arms'), ctx(), 1);
    const s = c.addMove(getMove('spinkick'), ctx(), 2);
    expect(s.namedCombos.map((n) => n.id)).toContain('basement_classic');
  });

  it('tracks best and longest combos', () => {
    const c = new ComboSystem();
    c.addMove(getMove('two_step'), ctx(), 0);
    c.bank();
    c.addMove(getMove('two_step'), ctx(), 1);
    c.addMove(getMove('spinkick'), ctx(), 2);
    const r = c.bank()!;
    expect(c.stats.longestCombo).toBe(2);
    expect(c.stats.bestCombo).toBe(r.total);
  });
});
