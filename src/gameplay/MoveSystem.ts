import type { SongTimeline } from '../audio/SongTimeline';
import { MoveResolver } from './MoveResolver';
import type { InputDirection, MoveButton, MoveDefinition } from './moveTypes';
import { judgeTiming, type Rating } from './timing';

export interface MoveRequest {
  button: MoveButton;
  direction: InputDirection;
  /** -1 left / +1 right for side moves, 0 otherwise. */
  side: number;
  /** Song time of the physical button press (already latency-corrected). */
  pressTime: number;
}

export interface ActiveMove {
  def: MoveDefinition;
  startTime: number;
  endTime: number;
  /** Grid pulse the move is anchored to. */
  anchorTime: number;
  rating: Rating;
  /** Signed press offset from the pulse in seconds. */
  offset: number;
  mirror: boolean;
  side: number;
  /** Chained without a gap (buffered, cancelled or immediate follow-up). */
  cleanLink: boolean;
  /** True for hops and air moves. */
  airborne: boolean;
  /** Air move converted from a hop: normalised hop progress at conversion. */
  conversionProgress?: number;
}

export type BailReason = 'crash';

export type MoveEvent =
  | { type: 'start'; move: ActiveMove }
  | { type: 'convert'; move: ActiveMove; from: ActiveMove }
  | { type: 'end'; move: ActiveMove }
  | { type: 'bail'; time: number; until: number; reason: BailReason }
  | { type: 'recover'; time: number };

export const MOVE_TUNING = {
  /** A hop can be converted into an air move until this progress. */
  hopConvertUntil: 0.8,
  /** Conversions later than this give a sketchy landing. */
  sketchyAfter: 0.55,
  /** Air moves started from a hop last at least this share of their natural length. */
  airMinShare: 0.8,
  /** Bail (crash) recovery in seconds. */
  bailSec: 1.1,
  /** A press this close (seconds) before the current move ends is buffered. */
  bufferSec: 0.35,
  /** Idle gap (seconds) that still counts as a clean link. */
  cleanGapSec: 0.25,
};

/**
 * The player's move state machine ("groove" model, D-026): moves play at
 * their natural length, presses are buffered or cancel the end of a move,
 * hops convert into air moves. Timing is only *judged* (bonus) – being off
 * the beat never bails. Bails come from outside (crashing into the crowd).
 * Pure logic – no rendering, no audio. Driven by song time.
 */
export class MoveSystem {
  readonly resolver: MoveResolver;
  private readonly timeline: SongTimeline;

  current: ActiveMove | null = null;
  private buffered: MoveRequest | null = null;
  private bailUntil = -Infinity;
  private lastEndTime = -Infinity;
  private lastMove: ActiveMove | null = null;
  private events: MoveEvent[] = [];

  constructor(timeline: SongTimeline, moves: readonly MoveDefinition[]) {
    this.timeline = timeline;
    this.resolver = new MoveResolver(moves);
  }

  get isBailing(): boolean {
    return this.bailUntil > -Infinity;
  }

  get busy(): boolean {
    return this.current !== null || this.isBailing;
  }

  /** Progress 0..1 of the current move at `time`. */
  progress(time: number): number {
    const c = this.current;
    if (!c) return 0;
    return Math.min(1, Math.max(0, (time - c.startTime) / (c.endTime - c.startTime)));
  }

  /** Handle a button press. Resulting events are queued for drain(). */
  press(req: MoveRequest): void {
    if (this.isBailing) return;
    const cur = this.current;

    // Hop → air move conversion (the take-off was already judged).
    if (cur && cur.def.id === 'hop' && req.button !== 'jump') {
      const p = this.progress(req.pressTime);
      const airDef = this.resolver.resolve(req.button, req.direction, true);
      if (airDef && p <= MOVE_TUNING.hopConvertUntil) {
        this.convert(cur, airDef, req.pressTime, p);
        return;
      }
    }

    const def = this.resolver.resolve(req.button, req.direction, false);
    if (!def) return;

    if (cur) {
      if (this.progress(req.pressTime) >= cur.def.cancelAt && cur.def.cancelAt < 1) {
        // Cancel window: the next move starts right away.
        this.finish(req.pressTime);
        this.start(def, req, req.pressTime, this.judge(req.pressTime), true);
      } else if (cur.endTime - req.pressTime <= MOVE_TUNING.bufferSec) {
        this.buffered = req;
      }
      // Earlier presses during a long move are ignored (no penalty).
      return;
    }
    const clean = req.pressTime - this.lastEndTime <= MOVE_TUNING.cleanGapSec;
    this.start(def, req, req.pressTime, this.judge(req.pressTime), clean);
  }

  update(time: number): void {
    if (this.isBailing && time >= this.bailUntil) {
      this.bailUntil = -Infinity;
      this.events.push({ type: 'recover', time });
    }
    const cur = this.current;
    if (cur && time >= cur.endTime) {
      const endTime = cur.endTime;
      this.finish(endTime);
      const buf = this.buffered;
      this.buffered = null;
      if (buf) {
        const def = this.resolver.resolve(buf.button, buf.direction, false);
        if (def) this.start(def, buf, endTime, this.judge(buf.pressTime), true);
      }
    }
  }

  /** Bail from outside the move system (e.g. a big move into a packed crowd). */
  forceBail(time: number, reason: BailReason = 'crash'): void {
    const until = time + MOVE_TUNING.bailSec;
    this.current = null;
    this.buffered = null;
    this.lastMove = null;
    this.bailUntil = until;
    this.lastEndTime = -Infinity;
    this.events.push({ type: 'bail', time, until, reason });
  }

  drain(): MoveEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  reset(): void {
    this.current = null;
    this.buffered = null;
    this.bailUntil = -Infinity;
    this.lastEndTime = -Infinity;
    this.lastMove = null;
    this.events = [];
  }

  private judge(pressTime: number): { rating: Rating; offset: number } {
    const p = this.timeline.pulseAt(pressTime);
    return { rating: judgeTiming(p.offset, p.interval), offset: p.offset };
  }

  private start(def: MoveDefinition, req: MoveRequest, startTime: number, judged: { rating: Rating; offset: number }, cleanLink: boolean): void {
    const end = startTime + def.durationSec;
    const prev = this.lastMove;
    let mirror = false;
    if (def.faceCamera) mirror = req.side < 0;
    else if (def.alternate && prev && prev.def.id === def.id) mirror = !prev.mirror;

    const move: ActiveMove = {
      def,
      startTime,
      endTime: end,
      anchorTime: startTime,
      rating: judged.rating,
      offset: judged.offset,
      mirror,
      side: req.side,
      cleanLink,
      airborne: def.category === 'air',
    };
    this.current = move;
    this.lastMove = move;
    this.events.push({ type: 'start', move });
  }

  private convert(hop: ActiveMove, def: MoveDefinition, time: number, progress: number): void {
    const end = Math.max(hop.endTime, time + def.durationSec * MOVE_TUNING.airMinShare);
    const prev = this.lastMove && this.lastMove !== hop ? this.lastMove : null;
    const move: ActiveMove = {
      def,
      startTime: time,
      endTime: end,
      anchorTime: hop.anchorTime,
      rating: hop.rating,
      offset: hop.offset,
      mirror: def.alternate && prev?.def.id === def.id ? !prev.mirror : false,
      side: hop.side,
      cleanLink: hop.cleanLink,
      airborne: true,
      conversionProgress: progress,
    };
    this.current = move;
    this.lastMove = move;
    this.events.push({ type: 'convert', move, from: hop });
  }

  private finish(time: number): void {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    this.lastEndTime = time;
    this.events.push({ type: 'end', move: { ...cur, endTime: time } });
  }


}
