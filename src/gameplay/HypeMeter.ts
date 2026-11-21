import { clamp01 } from '../core/math';

export const HYPE_TUNING = {
  decayPerSec: 0.035,
  frenzyDuration: 10,
  frenzyDecayPerSec: 0.06,
  bailLoss: 0.3,
  afterFrenzy: 0.25,
};

/**
 * "Special meter" of the pit. Good moves fill it, time drains it. When full,
 * the pit goes into FRENZY: double points and a wild crowd for a while.
 */
export class HypeMeter {
  value = 0;
  frenzyTime = 0;

  get frenzy(): boolean {
    return this.frenzyTime > 0;
  }

  /** Returns true when this addition triggered a frenzy. */
  add(amount: number): boolean {
    if (this.frenzy) {
      this.value = clamp01(this.value + amount * 0.5);
      return false;
    }
    this.value = clamp01(this.value + amount);
    if (this.value >= 1) {
      this.frenzyTime = HYPE_TUNING.frenzyDuration;
      return true;
    }
    return false;
  }

  bail(): void {
    if (this.frenzy) {
      this.frenzyTime = 0;
      this.value = HYPE_TUNING.afterFrenzy;
    } else {
      this.value = clamp01(this.value - HYPE_TUNING.bailLoss);
    }
  }

  /** Returns true when a frenzy just ended. */
  update(dt: number): boolean {
    if (this.frenzy) {
      this.frenzyTime -= dt;
      this.value = clamp01(this.value - HYPE_TUNING.frenzyDecayPerSec * dt);
      if (this.frenzyTime <= 0 || this.value <= 0) {
        this.frenzyTime = 0;
        this.value = HYPE_TUNING.afterFrenzy;
        return true;
      }
      return false;
    }
    this.value = clamp01(this.value - HYPE_TUNING.decayPerSec * dt);
    return false;
  }

  reset(): void {
    this.value = 0;
    this.frenzyTime = 0;
  }
}
