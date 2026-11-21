/**
 * Timing judgement: how close was an input to the nearest musical pulse?
 * Windows scale with the pulse interval (fast songs are tighter) but are
 * capped in absolute milliseconds so half-time parts don't become trivial.
 */

export type Rating = 'perfect' | 'good' | 'okay' | 'miss';

export interface TimingWindow {
  /** Fraction of the pulse interval. */
  fraction: number;
  /** Absolute cap in seconds. */
  cap: number;
}

export const TIMING_WINDOWS: Record<Exclude<Rating, 'miss'>, TimingWindow> = {
  perfect: { fraction: 0.14, cap: 0.065 },
  good: { fraction: 0.27, cap: 0.12 },
  okay: { fraction: 0.4, cap: 0.18 },
};

export function windowSeconds(rating: Exclude<Rating, 'miss'>, pulseInterval: number): number {
  const w = TIMING_WINDOWS[rating];
  return Math.min(w.fraction * pulseInterval, w.cap);
}

export function judgeTiming(offsetSec: number, pulseInterval: number): Rating {
  const d = Math.abs(offsetSec);
  if (d <= windowSeconds('perfect', pulseInterval)) return 'perfect';
  if (d <= windowSeconds('good', pulseInterval)) return 'good';
  if (d <= windowSeconds('okay', pulseInterval)) return 'okay';
  return 'miss';
}

/**
 * Score multiplier per rating. Groove model (D-026): timing is a bonus only –
 * an off-beat move ('miss') still scores its base value.
 */
export const RATING_SCORE: Record<Rating, number> = {
  perfect: 1.5,
  good: 1.25,
  okay: 1.1,
  miss: 1,
};

/** Extra combo multiplier gain per rating ("Perfect strengthens the combo"). */
export const RATING_MULTIPLIER_BONUS: Record<Rating, number> = {
  perfect: 0.5,
  good: 0.25,
  okay: 0,
  miss: 0,
};

/** Hype gained per rating (scaled by move difficulty). */
export const RATING_HYPE: Record<Rating, number> = {
  perfect: 0.06,
  good: 0.04,
  okay: 0.02,
  miss: 0.012,
};
