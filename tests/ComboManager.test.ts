import { describe, expect, it } from 'vitest';
import { getMove } from '../src/data/moves';
import { COMBO_TUNING, ComboManager, type MoveContext } from '../src/gameplay/ComboManager';

const CTX: MoveContext = { linked: false, layered: false, momentum: 0, onBeat: false, section: 'verse', frenzy: false };

describe('ComboManager', () => {
  it('adds points and multiplier, banks base × multiplier × variety', () => {
    const c = new ComboManager();
    c.addMove(getMove('two_step'), CTX);
    c.addMove(getMove('spinkick'), CTX);
    c.addMove(getMove('windmill'), CTX);
    expect(c.multiplier).toBe(3);
    const base = c.base;
    const r = c.bank()!;
    expect(r.total).toBe(Math.round(base * 3 * COMBO_TUNING.variety[3]!));
    expect(c.score).toBe(r.total);
    expect(c.active).toBe(false);
  });

  it('repeats score less and stop raising the multiplier', () => {
    const c = new ComboManager();
    const kick = getMove('spinkick');
    const pts = [0, 1, 2, 3].map(() => c.addMove(kick, CTX).points);
    expect(pts[1]).toBeLessThan(pts[0]!);
    expect(pts[3]).toBeLessThan(pts[2]!);
    expect(c.multiplier).toBe(3); // 100 %, 75 %, 50 % count – 25 % does not
  });

  it('rewards clean links, momentum, landings, music and layering', () => {
    const plain = new ComboManager();
    plain.addMove(getMove('two_step'), CTX);
    const p0 = plain.addMove(getMove('butterfly_kick'), CTX).points;
    const boosted = new ComboManager();
    boosted.addMove(getMove('two_step'), CTX);
    const e = boosted.addMove(getMove('butterfly_kick'), { ...CTX, linked: true, momentum: 1, landing: 'clean', onBeat: true, section: 'breakdown' });
    expect(e.points).toBeGreaterThan(p0 * 3);
    expect(e.tags).toEqual(expect.arrayContaining(['CLEAN', 'MOMENTUM', 'CLEAN LANDING', 'ON BEAT']));
    const sketchy = new ComboManager().addMove(getMove('butterfly_kick'), { ...CTX, landing: 'sketchy' });
    expect(sketchy.points).toBeLessThan(getMove('butterfly_kick').points);
  });

  it('timer runs only between moves and banks when empty; bail loses the combo', () => {
    const c = new ComboManager();
    c.addMove(getMove('spinkick'), CTX);
    expect(c.tick(COMBO_TUNING.timerSec + 1, true)).toBeNull();
    expect(c.tick(COMBO_TUNING.timerSec - 0.1, false)).toBeNull();
    c.refill();
    expect(c.tick(COMBO_TUNING.timerSec - 0.1, false)).toBeNull();
    expect(c.tick(0.2, false)?.total).toBeGreaterThan(0);

    c.addMove(getMove('spinkick'), CTX);
    expect(c.bail()).toBeGreaterThan(0);
    expect(c.score).toBeGreaterThan(0);
    expect(c.active).toBe(false);
    expect(c.stats.bails).toBe(1);
  });
});
