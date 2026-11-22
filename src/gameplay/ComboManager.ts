import type { SectionType } from '../audio/songTypes';
import type { MoveCategory, MoveDefinition } from './moveTypes';

/** All scoring numbers in one place (docs/COMBO_SYSTEM.md). */
export const COMBO_TUNING = {
  /** Combo timer: refilled by every move, drains only while nothing is running. */
  timerSec: 2.5,
  /** Point factor for the 1st, 2nd, 3rd … use of the same move inside one combo (last value repeats). */
  repetition: [1, 0.75, 0.5, 0.25, 0.1],
  /** Repeats below this factor no longer raise the multiplier. */
  multiplierMinRepetition: 0.5,
  cleanLink: 1.2,
  /** Momentum bonus at full sprint speed (linear from standing). */
  momentum: 0.3,
  landingClean: 1.25,
  landingSketchy: 0.6,
  onBeat: 1.15,
  layered: 1.2,
  frenzy: 1.5,
  section: { intro: 1, verse: 1, chorus: 1.1, breakdown: 1.5, heavy: 2, outro: 1 } as Record<SectionType, number>,
  /** Bank factor by number of distinct categories in the combo (index = count). */
  variety: [1, 1, 1.1, 1.25, 1.5],
};

export interface MoveContext {
  /** Started from a cancel window / right after the previous move. */
  linked: boolean;
  layered: boolean;
  /** 0..1 share of sprint speed when the move started. */
  momentum: number;
  onBeat: boolean;
  section: SectionType;
  frenzy: boolean;
  landing?: 'clean' | 'sketchy';
}

export interface ComboEntry {
  name: string;
  points: number;
  tags: string[];
}

export interface BankResult {
  base: number;
  multiplier: number;
  variety: number;
  total: number;
  moves: number;
}

export interface ComboStats {
  bestCombo: number;
  longestCombo: number;
  combos: number;
  bails: number;
  moves: number;
  cleanLinks: number;
}

/**
 * Skateboarding-game combo: every move adds points and +1 multiplier
 * (diminishing for repeats), a timer keeps the combo alive between moves,
 * and the combo is banked as base × multiplier × variety when it runs out.
 * A bail loses everything in the running combo.
 */
export class ComboManager {
  score = 0;
  base = 0;
  multiplier = 0;
  timer = 0;
  entries: ComboEntry[] = [];
  readonly stats: ComboStats = { bestCombo: 0, longestCombo: 0, combos: 0, bails: 0, moves: 0, cleanLinks: 0 };
  private uses = new Map<string, number>();
  private categories = new Set<MoveCategory>();

  get active(): boolean {
    return this.entries.length > 0;
  }

  /** Running combo value (what a bank would pay right now). */
  get pending(): number {
    return Math.round(this.base * Math.max(1, this.multiplier) * this.varietyFactor);
  }

  get varietyFactor(): number {
    const v = COMBO_TUNING.variety;
    return v[Math.min(v.length - 1, this.categories.size)]!;
  }

  /** 0..1 for the HUD. */
  get timerShare(): number {
    return this.active ? this.timer / COMBO_TUNING.timerSec : 0;
  }

  /** Repetition factor the next use of this move would get. */
  repetitionOf(id: string): number {
    const r = COMBO_TUNING.repetition;
    return r[Math.min(r.length - 1, this.uses.get(id) ?? 0)]!;
  }

  /** Keep the combo alive while a move is in progress (air moves score on landing). */
  refill(): void {
    if (this.active) this.timer = COMBO_TUNING.timerSec;
  }

  addMove(def: MoveDefinition, ctx: MoveContext): ComboEntry {
    const T = COMBO_TUNING;
    const tags: string[] = [];
    const rep = this.repetitionOf(def.id);
    let f = rep;
    if (ctx.linked && this.active) {
      f *= T.cleanLink;
      tags.push('CLEAN');
      this.stats.cleanLinks++;
    }
    if (ctx.layered) {
      f *= T.layered;
      tags.push('LAYERED');
    }
    if (ctx.momentum > 0.5) tags.push('MOMENTUM');
    f *= 1 + T.momentum * ctx.momentum;
    if (ctx.landing === 'clean') {
      f *= T.landingClean;
      tags.push('CLEAN LANDING');
    } else if (ctx.landing === 'sketchy') {
      f *= T.landingSketchy;
      tags.push('SKETCHY');
    }
    if (ctx.onBeat) {
      f *= T.onBeat;
      tags.push('ON BEAT');
    }
    const sec = T.section[ctx.section] ?? 1;
    if (sec > 1) {
      f *= sec;
      tags.push(`${ctx.section.toUpperCase()} x${sec}`);
    }
    if (ctx.frenzy) {
      f *= T.frenzy;
      tags.push('FRENZY');
    }
    if (rep < 1) tags.push(`REPEAT ${Math.round(rep * 100)}%`);
    const points = Math.round(def.points * f);
    this.uses.set(def.id, (this.uses.get(def.id) ?? 0) + 1);
    this.categories.add(def.category);
    this.base += points;
    if (rep >= T.multiplierMinRepetition) this.multiplier += 1;
    this.timer = T.timerSec;
    const entry = { name: def.name, points, tags };
    this.entries.push(entry);
    this.stats.moves++;
    return entry;
  }

  /** Flat bonus into the running combo (breakdown start, beatdrop hit). False when no combo runs. */
  addBonus(points: number): boolean {
    if (!this.active) return false;
    this.base += points;
    this.timer = COMBO_TUNING.timerSec;
    return true;
  }

  /** Drain the timer while nothing runs. Returns the bank result when it runs out. */
  tick(dt: number, busy: boolean): BankResult | null {
    if (!this.active || busy) return null;
    this.timer -= dt;
    return this.timer <= 0 ? this.bank() : null;
  }

  bank(): BankResult | null {
    if (!this.active) return null;
    const result: BankResult = {
      base: this.base,
      multiplier: Math.max(1, this.multiplier),
      variety: this.varietyFactor,
      total: this.pending,
      moves: this.entries.length,
    };
    this.score += result.total;
    this.stats.combos++;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, result.total);
    this.stats.longestCombo = Math.max(this.stats.longestCombo, result.moves);
    this.clear();
    return result;
  }

  /** Crash: the running combo is lost. Returns the lost value. */
  bail(): number {
    const lost = this.pending;
    if (this.active) this.stats.bails++;
    this.clear();
    return lost;
  }

  reset(): void {
    this.clear();
    this.score = 0;
    Object.assign(this.stats, { bestCombo: 0, longestCombo: 0, combos: 0, bails: 0, moves: 0, cleanLinks: 0 });
  }

  private clear(): void {
    this.base = this.multiplier = this.timer = 0;
    this.entries = [];
    this.uses.clear();
    this.categories.clear();
  }
}
