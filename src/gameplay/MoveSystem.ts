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

export type MoveEvent =
  | { type: 'start'; move: ActiveMove }
  | { type: 'convert'; move: ActiveMove; from: ActiveMove }
  | { type: 'end'; move: ActiveMove }
  | { type: 'bail'; time: number; rating: Rating; offset: number; until: number }
  | { type: 'recover'; time: number };

export const MOVE_TUNING = {
  /** A hop can be converted into an air move until this progress. */
  hopConvertUntil: 0.8,
  /** Conversions later than this give a sketchy landing. */
  sketchyAfter: 0.55,
  /** Bail recovery in pulses (min seconds below). */
  bailPulses: 2,
  bailMinSec: 0.7,
  /** A press this many pulses (or less) before the current move ends is buffered. */
  bufferPulses: 1.05,
  /** Idle gap (in pulses) that still counts as a clean link. */
  cleanGapPulses: 0.5,
};

/**
 * The player's move state machine: input buffering, cancel windows,
 * beat-quantised move lengths, hop→air conversion and bails.
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

    // Hop → air move conversion (not timing judged: the take-off was).
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
      const p = this.progress(req.pressTime);
      const interval = this.timeline.pulseAt(cur.anchorTime).interval;
      if (p >= cur.def.cancelAt && cur.def.cancelAt < 1) {
        // Cancel window: judge now and start immediately.
        const rating = this.judge(req.pressTime);
        if (rating.rating === 'miss') return this.bail(req.pressTime, rating);
        this.finish(req.pressTime);
        this.start(def, req, req.pressTime, rating, true);
        return;
      }
      if (cur.endTime - req.pressTime <= interval * MOVE_TUNING.bufferPulses) {
        const rating = this.judge(req.pressTime);
        if (rating.rating === 'miss') return this.bail(req.pressTime, rating);
        this.buffered = req;
      }
      // Too early: ignored (no penalty for pressing during a long move).
      return;
    }

    const rating = this.judge(req.pressTime);
    if (rating.rating === 'miss') return this.bail(req.pressTime, rating);
    const interval = this.timeline.pulseAt(req.pressTime).interval;
    const clean = req.pressTime - this.lastEndTime <= interval * MOVE_TUNING.cleanGapPulses;
    this.start(def, req, req.pressTime, rating, clean);
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

  /** Force a bail (e.g. crash). */
  forceBail(time: number): void {
    this.bail(time, { rating: 'miss', offset: 0 });
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
    const p = this.timeline.pulseAt(startTime);
    const pulses = Math.max(1, Math.round(def.durationSec / p.interval));
    let end = p.nearestTime + pulses * p.interval;
    if (end - startTime < 0.6 * pulses * p.interval) end += p.interval;

    const prev = this.lastMove;
    let mirror = false;
    if (def.faceCamera) mirror = req.side < 0;
    else if (def.alternate && prev && prev.def.id === def.id) mirror = !prev.mirror;

    const move: ActiveMove = {
      def,
      startTime,
      endTime: end,
      anchorTime: p.nearestTime,
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
    const interval = this.timeline.pulseAt(hop.anchorTime).interval;
    const minRemaining = 0.6 * def.durationSec;
    let end = hop.endTime;
    while (end - time < minRemaining) end += interval;
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

  private bail(time: number, judged: { rating: Rating; offset: number }): void {
    const interval = this.timeline.pulseAt(time).interval;
    const until = time + Math.max(MOVE_TUNING.bailMinSec, MOVE_TUNING.bailPulses * interval);
    this.current = null;
    this.buffered = null;
    this.lastMove = null;
    this.bailUntil = until;
    this.lastEndTime = -Infinity;
    this.events.push({ type: 'bail', time, rating: judged.rating, offset: judged.offset, until });
  }
}
