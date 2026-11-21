import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/random';
import {
  CAP_COUNT,
  FACE_COUNT,
  PANTS_ATLAS,
  PANTS_STYLES,
  PLAYER_APPEARANCE,
  randomAppearance,
  SHIRT_ATLAS,
  SHIRT_STYLES,
  TATTOO_COUNT,
} from '../src/data/appearance';

describe('appearance catalogue', () => {
  it('references only existing atlas cells', () => {
    const shirtCells = SHIRT_ATLAS.cols * SHIRT_ATLAS.rows;
    for (const s of SHIRT_STYLES) {
      expect(s.front).toBeLessThan(shirtCells);
      expect(s.fabric).toBeLessThan(shirtCells);
    }
    for (const p of PANTS_STYLES) expect(p.cell).toBeLessThan(PANTS_ATLAS.cols * PANTS_ATLAS.rows);
    expect(new Set(SHIRT_STYLES.map((s) => s.id)).size).toBe(SHIRT_STYLES.length);
  });

  it('generates valid, varied crowd members', () => {
    const rng = new Rng(42);
    const shirts = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const a = randomAppearance(rng);
      expect(SHIRT_STYLES.some((s) => s.id === a.shirt)).toBe(true);
      expect(PANTS_STYLES.some((p) => p.id === a.pants)).toBe(true);
      expect(a.face).toBeLessThan(FACE_COUNT);
      expect(a.capStyle).toBeLessThan(CAP_COUNT);
      expect(a.tattoo).toBeLessThan(TATTOO_COUNT);
      shirts.add(a.shirt);
    }
    expect(shirts.size).toBeGreaterThan(8);
    expect(SHIRT_STYLES.some((s) => s.id === PLAYER_APPEARANCE.shirt)).toBe(true);
  });
});
