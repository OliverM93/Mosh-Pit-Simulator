import type { SectionType } from '../audio/songTypes';
import { NAMED_COMBOS, type NamedCombo } from '../data/comboBonuses';
import type { MoveCategory, MoveDefinition } from './moveTypes';
import { RATING_MULTIPLIER_BONUS, RATING_SCORE, type Rating } from './timing';

/** All tunable scoring numbers in one place. See docs/COMBO_SYSTEM.md. */
export const SCORING = {
  cleanLink: 1.1,
  switchUp: 1.1,
  runUp: 1.25,
  cramped: 0.5,
  landingClean: 1.2,
  landingSketchy: 0.5,
  frenzy: 2,
  dropHitBonus: 1000,
  /** Section multiplier for advanced moves. */
  sectionAdvanced: { intro: 1, verse: 1, chorus: 1.1, breakdown: 1.5, heavy: 2, outro: 1 } as Record<SectionType, number>,
  /** Section multiplier for basic moves. */
  sectionBasic: { intro: 1, verse: 1, chorus: 1.1, breakdown: 1, heavy: 1, outro: 1 } as Record<SectionType, number>,
  /** Bank-time factor by number of distinct categories used. */
  categoryMix: [1, 1, 1, 1.15, 1.3, 1.5],
  /** Distinct moves needed for the variety bonus, and its factor. */
  varietyMoves: 6,
  varietyFactor: 1.2,
  /** Perfect streak milestones → pool bonus. */
  perfectStreak: [
    { count: 5, bonus: 250 },
    { count: 10, bonus: 750 },
    { count: 20, bonus: 2000 },
  ],
  /** Below this repetition factor a move adds no multiplier. */
  repetitionGainThreshold: 0.5,
  /** Chain window: idle pulses before a combo is banked. */
  chainPulses: 1.5,
  chainMinSec: 0.55,
};

export interface MoveScoreContext {
  rating: Rating;
  section: SectionType;
  cleanLink: boolean;
  runUp: boolean;
  cramped: boolean;
  frenzy: boolean;
  landing?: 'clean' | 'sketchy';
  dropHit: boolean;
}

export interface ScoredMove {
  def: MoveDefinition;
  rating: Rating;
  points: number;
  multiplierGain: number;
  repetitionFactor: number;
  tags: string[];
  namedCombos: NamedCombo[];
  /** Extra pool bonuses triggered by this move (named combos, streaks, drop hits). */
  bonuses: { name: string; value: number }[];
}

export interface ComboEntry {
  id: string;
  name: string;
  category: MoveCategory;
  rating: Rating;
  points: number;
}

export interface ComboState {
  pool: number;
  multiplier: number;
  entries: ComboEntry[];
  uses: Map<string, number>;
  categories: Set<MoveCategory>;
  startTime: number;
  lastActiveTime: number;
}

export interface BankResult {
  total: number;
  pool: number;
  multiplier: number;
  factor: number;
  moves: number;
  bonuses: string[];
}

export interface SessionStats {
  moves: number;
  ratings: Record<Rating, number>;
  bails: number;
  combosBanked: number;
  bestCombo: number;
  longestCombo: number;
  dropHits: number;
}

export function emptyStats(): SessionStats {
  return {
    moves: 0,
    ratings: { perfect: 0, good: 0, okay: 0, miss: 0 },
    bails: 0,
    combosBanked: 0,
    bestCombo: 0,
    longestCombo: 0,
    dropHits: 0,
  };
}

function roundPoints(v: number): number {
  if (v <= 0) return 0;
  return Math.max(5, Math.round(v / 5) * 5);
}

/**
 * Tony-Hawk-style combo scoring: move points go into a pool, the multiplier
 * grows with every (non-repetitive) move, banking pays pool × multiplier ×
 * variety factor, a bail loses everything.
 */
export class ComboSystem {
  score = 0;
  current: ComboState | null = null;
  stats: SessionStats = emptyStats();
  private perfectStreak = 0;

  get active(): boolean {
    return this.current !== null;
  }

  /** Projected bank value of the running combo. */
  get projected(): number {
    const c = this.current;
    if (!c) return 0;
    return Math.round(c.pool * c.multiplier * this.categoryFactor(c));
  }

  addMove(def: MoveDefinition, ctx: MoveScoreContext, time: number): ScoredMove {
    if (!this.current) {
      this.current = {
        pool: 0,
        multiplier: 0,
        entries: [],
        uses: new Map(),
        categories: new Set(),
        startTime: time,
        lastActiveTime: time,
      };
    }
    const c = this.current;
    c.lastActiveTime = time;

    const useIndex = c.uses.get(def.id) ?? 0;
    c.uses.set(def.id, useIndex + 1);
    const rep = def.repetition[Math.min(useIndex, def.repetition.length - 1)] ?? 0.1;
    const prev = c.entries[c.entries.length - 1];
    const tags: string[] = [];

    let mul = RATING_SCORE[ctx.rating] * rep;
    const section = def.advanced ? SCORING.sectionAdvanced[ctx.section] : SCORING.sectionBasic[ctx.section];
    mul *= section;
    if (section > 1) tags.push(`${ctx.section.toUpperCase()} x${section}`);
    if (ctx.cleanLink && prev) {
      mul *= SCORING.cleanLink;
      tags.push('CLEAN LINK');
    }
    if (prev && prev.category !== def.category) {
      mul *= SCORING.switchUp;
      tags.push('SWITCH-UP');
    }
    if (ctx.runUp && def.advanced) {
      mul *= SCORING.runUp;
      tags.push('RUN-UP');
    }
    if (ctx.cramped) {
      mul *= SCORING.cramped;
      tags.push('CRAMPED');
    }
    if (ctx.landing === 'clean') {
      mul *= SCORING.landingClean;
      tags.push('CLEAN LANDING');
    } else if (ctx.landing === 'sketchy') {
      mul *= SCORING.landingSketchy;
      tags.push('SKETCHY');
    }
    if (ctx.frenzy) {
      mul *= SCORING.frenzy;
      tags.push('FRENZY x2');
    }
    if (rep < 1) tags.push(rep < SCORING.repetitionGainThreshold ? 'REPEAT!' : 'REPEAT');

    const points = roundPoints(def.score * mul);
    const fresh = rep >= SCORING.repetitionGainThreshold;
    const gain = fresh ? def.multiplierGain + RATING_MULTIPLIER_BONUS[ctx.rating] : 0;
    c.pool += points;
    c.multiplier += gain;
    c.categories.add(def.category);
    c.entries.push({ id: def.id, name: def.name, category: def.category, rating: ctx.rating, points });

    this.stats.moves++;
    this.stats.ratings[ctx.rating]++;

    // Extra pool bonuses.
    const bonuses: { name: string; value: number }[] = [];
    if (ctx.rating === 'perfect') {
      this.perfectStreak++;
      for (const m of SCORING.perfectStreak) {
        if (this.perfectStreak === m.count) bonuses.push({ name: `PERFECT x${m.count}`, value: m.bonus });
      }
    } else {
      this.perfectStreak = 0;
    }
    if (ctx.dropHit) {
      bonuses.push({ name: 'DROP HIT', value: SCORING.dropHitBonus });
      this.stats.dropHits++;
    }
    const named = this.matchNamed(c);
    for (const n of named) bonuses.push({ name: n.name, value: n.bonus });
    for (const b of bonuses) c.pool += b.value;

    return { def, rating: ctx.rating, points, multiplierGain: gain, repetitionFactor: rep, tags, namedCombos: named, bonuses };
  }

  /** Bonus into the running combo pool (e.g. breakdown start). Returns false without combo. */
  addPoolBonus(value: number, time: number): boolean {
    if (!this.current) return false;
    this.current.pool += value;
    this.current.lastActiveTime = time;
    return true;
  }

  /** Keeps the chain window open (e.g. while a long move is still running). */
  keepAlive(time: number): void {
    if (this.current) this.current.lastActiveTime = time;
  }

  /** Bank automatically once the player stayed idle longer than the chain window. */
  tick(time: number, busy: boolean, pulseInterval: number): BankResult | null {
    const c = this.current;
    if (!c) return null;
    if (busy) {
      c.lastActiveTime = time;
      return null;
    }
    const window = Math.max(SCORING.chainMinSec, SCORING.chainPulses * pulseInterval);
    if (time - c.lastActiveTime > window) return this.bank();
    return null;
  }

  /** Remaining chain window 0..1 (1 = just acted). */
  chainRemaining(time: number, busy: boolean, pulseInterval: number): number {
    const c = this.current;
    if (!c) return 0;
    if (busy) return 1;
    const window = Math.max(SCORING.chainMinSec, SCORING.chainPulses * pulseInterval);
    return Math.max(0, 1 - (time - c.lastActiveTime) / window);
  }

  bank(): BankResult | null {
    const c = this.current;
    if (!c) return null;
    this.current = null;
    const bonuses: string[] = [];
    const factor = this.categoryFactor(c, bonuses);
    const multiplier = Math.max(1, c.multiplier);
    const total = Math.round(c.pool * multiplier * factor);
    this.score += total;
    this.stats.combosBanked++;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, total);
    this.stats.longestCombo = Math.max(this.stats.longestCombo, c.entries.length);
    return { total, pool: c.pool, multiplier, factor, moves: c.entries.length, bonuses };
  }

  /** Lose the running combo. Returns the projected points that were lost. */
  bail(): number {
    const lost = this.projected;
    if (this.current) this.stats.longestCombo = Math.max(this.stats.longestCombo, this.current.entries.length);
    this.current = null;
    this.perfectStreak = 0;
    this.stats.bails++;
    this.stats.ratings.miss++;
    return lost;
  }

  reset(): void {
    this.score = 0;
    this.current = null;
    this.stats = emptyStats();
    this.perfectStreak = 0;
  }

  private categoryFactor(c: ComboState, bonuses?: string[]): number {
    const mix = SCORING.categoryMix[Math.min(c.categories.size, SCORING.categoryMix.length - 1)] ?? 1;
    let f = mix;
    if (mix > 1) bonuses?.push(`${c.categories.size} STYLES x${mix}`);
    if (c.uses.size >= SCORING.varietyMoves) {
      f *= SCORING.varietyFactor;
      bonuses?.push(`VARIETY x${SCORING.varietyFactor}`);
    }
    return f;
  }

  private matchNamed(c: ComboState): NamedCombo[] {
    const ids = c.entries.map((e) => e.id);
    const found: NamedCombo[] = [];
    for (const n of NAMED_COMBOS) {
      const L = n.sequence.length;
      if (ids.length < L) continue;
      let ok = true;
      for (let i = 0; i < L; i++) {
        if (ids[ids.length - L + i] !== n.sequence[i]) {
          ok = false;
          break;
        }
      }
      if (ok) found.push(n);
    }
    return found;
  }
}
