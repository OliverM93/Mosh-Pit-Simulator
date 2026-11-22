import type { MoveCategory, MoveDefinition, MoveSituation } from './moveTypes';

export const MOVE_TUNING = {
  /** A press this long before a cancel window opens is kept and fires when it opens. */
  bufferSec: 0.3,
  /** A full-body move starting this soon after the previous one ended still counts as a clean link. */
  linkSec: 0.25,
  /** Stick deadzone for "side" selection. */
  sideDeadzone: 0.5,
  bailSec: 1.5,
};

/** A running move. Progress is time based – the animation follows it, never the other way round. */
export interface ActiveMove {
  def: MoveDefinition;
  /** Unique per started move (animation instance key). */
  seq: number;
  startTime: number;
  endTime: number;
  mirror: boolean;
  /** Started from the cancel window / right after the previous move. */
  linked: boolean;
  /** Arms started on top of footwork (or footwork under running arms). */
  layered: boolean;
  /** Set once the landing phase was reached (air moves). */
  landed: boolean;
}

export type MoveEvent =
  | { type: 'start'; move: ActiveMove }
  | { type: 'land'; move: ActiveMove; time: number }
  | { type: 'end'; move: ActiveMove; cancelled: boolean }
  | { type: 'bail'; time: number; until: number };

interface Buffered {
  category: MoveCategory;
  situation: MoveSituation;
  time: number;
}

/**
 * Hybrid move input → running moves on two layers (full body + arms), with
 * takeoff/air/landing phases, per-move cancel windows and an input buffer.
 * Pure logic: times are song seconds, nothing here knows about animation.
 */
export class MoveController {
  full: ActiveMove | null = null;
  upper: ActiveMove | null = null;
  bailUntil = -Infinity;
  private readonly moves: readonly MoveDefinition[];
  private buffer: Buffered | null = null;
  private seq = 0;
  private lastFullEnd = -Infinity;
  private lastFullId = '';
  private alternateFlip = new Map<string, boolean>();
  private events: MoveEvent[] = [];

  constructor(moves: readonly MoveDefinition[]) {
    this.moves = moves;
  }

  /** Pick the move for a category from the current situation (direction, speed). */
  resolve(category: MoveCategory, s: MoveSituation): MoveDefinition | null {
    const side = Math.abs(s.stickX) > MOVE_TUNING.sideDeadzone && Math.abs(s.stickX) > Math.abs(s.stickY);
    const forward = s.stickY > MOVE_TUNING.sideDeadzone && s.stickY > Math.abs(s.stickX);
    for (const m of this.moves) {
      if (m.category !== category) continue;
      if (m.when?.side && !side) continue;
      if (m.when?.forward && !forward) continue;
      if (m.when?.minSpeed !== undefined && s.speed < m.when.minSpeed) continue;
      return m;
    }
    return null;
  }

  progress(move: ActiveMove, time: number): number {
    return Math.min(1, Math.max(0, (time - move.startTime) / (move.endTime - move.startTime)));
  }

  isBailing(time: number): boolean {
    return time < this.bailUntil;
  }

  /** In the air phase of the full-body move. */
  airborne(time: number): boolean {
    const m = this.full;
    if (!m?.def.air) return false;
    const p = this.progress(m, time);
    return p >= m.def.air.takeoff && p < m.def.air.land;
  }

  /** Something is running (the combo timer pauses meanwhile). */
  get busy(): boolean {
    return !!(this.full || this.upper);
  }

  press(category: MoveCategory, time: number, situation: MoveSituation): void {
    if (this.isBailing(time)) return;
    if (!this.tryStart(category, time, situation)) this.buffer = { category, situation, time };
  }

  /**
   * Held button: start the next repetition once the running one has played its motion (`repeatFrom`), so a
   * held footwork/arms button turns into a continuous rhythm without cutting the moves short.
   */
  hold(category: MoveCategory, time: number, situation: MoveSituation): void {
    if (this.isBailing(time) || this.buffer) return;
    const def = this.resolve(category, situation);
    if (!def?.repeatOnHold) return;
    const running = def.layer === 'upper' ? this.upper : this.full;
    if (running && running.def.category !== category) return;
    if (running && this.progress(running, time) < (running.def.repeatFrom ?? running.def.cancelFrom)) return;
    if (!running && def.layer === 'upper' && this.full && this.full.def.category !== 'footwork') return;
    this.tryStart(category, time, situation);
  }

  update(time: number, situation: MoveSituation): void {
    for (const layer of ['full', 'upper'] as const) {
      const m = this[layer];
      if (!m) continue;
      if (m.def.air && !m.landed && this.progress(m, time) >= m.def.air.land) {
        m.landed = true;
        this.events.push({ type: 'land', move: m, time: m.startTime + (m.endTime - m.startTime) * m.def.air.land });
      }
      if (time >= m.endTime) this.finish(layer, m.endTime, false);
    }
    const b = this.buffer;
    if (b && this.tryStart(b.category, time, situation, b.time)) this.buffer = null;
  }

  /** Crash: everything stops, the body falls for `bailSec`. */
  bail(time: number): void {
    if (this.full) this.finish('full', time, true);
    if (this.upper) this.finish('upper', time, true);
    this.buffer = null;
    this.bailUntil = time + MOVE_TUNING.bailSec;
    this.events.push({ type: 'bail', time, until: this.bailUntil });
  }

  drain(): MoveEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  reset(): void {
    this.full = this.upper = this.buffer = null;
    this.bailUntil = this.lastFullEnd = -Infinity;
    this.lastFullId = '';
    this.alternateFlip.clear();
    this.events = [];
  }

  // ------------------------------------------------------------------

  private tryStart(category: MoveCategory, time: number, situation: MoveSituation, pressTime = time): boolean {
    if (this.isBailing(time)) return false;
    const def = this.resolve(category, situation);
    if (!def) return true; // nothing to do – swallow the press
    // A buffered press only waits while the window is about to open.
    const stale = time - pressTime > MOVE_TUNING.bufferSec;
    if (def.layer === 'upper') {
      const full = this.full;
      if (full && full.def.category !== 'footwork' && !this.canCancel(full, 'arms', time)) return stale;
      if (this.upper && !this.canCancel(this.upper, def.category, time)) return stale;
      if (full && full.def.category !== 'footwork') this.finish('full', time, true);
      const layered = !!(this.full && this.full.def.category === 'footwork');
      if (this.upper) this.finish('upper', time, true);
      this.upper = this.begin(def, time, !!full, layered);
      return true;
    }
    const cur = this.full;
    let linked = time - this.lastFullEnd <= MOVE_TUNING.linkSec;
    if (cur) {
      if (!this.canCancel(cur, def.category, time)) return stale;
      this.finish('full', time, true);
      linked = true;
    }
    // Arms keep swinging over footwork; anything bigger takes the whole body.
    if (this.upper && def.category !== 'footwork') this.finish('upper', time, true);
    const layered = def.category === 'footwork' && !!this.upper;
    if (this.upper && layered) this.upper.layered = true;
    this.full = this.begin(def, time, linked, layered);
    return true;
  }

  private canCancel(m: ActiveMove, into: MoveCategory, time: number): boolean {
    return this.progress(m, time) >= m.def.cancelFrom && m.def.cancelInto.includes(into);
  }

  private begin(def: MoveDefinition, time: number, linked: boolean, layered: boolean): ActiveMove {
    let mirror = false;
    if (def.alternate) {
      // Alternate sides on consecutive uses of the same move.
      const prev = def.layer === 'full' && this.lastFullId === def.id ? (this.alternateFlip.get(def.id) ?? false) : true;
      mirror = !prev;
      this.alternateFlip.set(def.id, mirror);
    }
    const move: ActiveMove = {
      def,
      seq: ++this.seq,
      startTime: time,
      endTime: time + def.duration,
      mirror,
      linked,
      layered,
      landed: false,
    };
    if (def.layer === 'full') this.lastFullId = def.id;
    this.events.push({ type: 'start', move });
    return move;
  }

  private finish(layer: 'full' | 'upper', time: number, cancelled: boolean): void {
    const m = this[layer];
    if (!m) return;
    this[layer] = null;
    if (layer === 'full') this.lastFullEnd = time;
    this.events.push({ type: 'end', move: m, cancelled });
  }
}
