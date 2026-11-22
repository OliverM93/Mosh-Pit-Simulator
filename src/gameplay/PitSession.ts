import { SongTimeline, type ResolvedSection } from '../audio/SongTimeline';
import type { SongDefinition } from '../audio/songTypes';
import { EventBus } from '../core/EventBus';
import { clamp, wrapAngle } from '../core/math';
import { MOVES } from '../data/moves';
import type { VenueDefinition } from '../data/venueTypes';
import { BEAT_TUNING, BeatManager } from './BeatManager';
import { ComboManager, type BankResult, type ComboEntry } from './ComboManager';
import { CrowdSim } from './crowd/CrowdSim';
import { HypeMeter } from './HypeMeter';
import { MoveController, type ActiveMove } from './MoveController';
import type { MoveCategory, MoveSituation } from './moveTypes';
import { MovementController, type MovementModifier } from './MovementController';

export interface SessionEvents {
  beat: { beat: number; beatInBar: number; time: number };
  section: { section: ResolvedSection };
  beatdrop: { time: number };
  moveStart: { move: ActiveMove };
  moveEnd: { move: ActiveMove; cancelled: boolean };
  land: { move: ActiveMove; quality: 'clean' | 'sketchy' };
  scored: { entry: ComboEntry; move: ActiveMove };
  bonus: { name: string; value: number };
  bail: { lost: number };
  bank: { result: BankResult };
  frenzy: { active: boolean };
  impact: { x: number; z: number; strength: number; hits: number };
  songEnd: { time: number };
}

export interface MovePress {
  category: MoveCategory;
  /** Song time of the key event. */
  time: number;
}

export interface FrameInput {
  /** Stick rotated into world space (camera relative), length 0..1. */
  moveX: number;
  moveZ: number;
  /** Raw stick: x = right, y = forward. */
  stickX: number;
  stickY: number;
  sprint: boolean;
  presses: MovePress[];
}

export const SESSION_TUNING = {
  /** Risky moves with this many people within space × crashFactor crash. */
  crashCount: 4,
  crashFactor: 0.7,
  /** Landing with this many people within `sketchyRadius` is sketchy. */
  sketchyCount: 2,
  sketchyRadius: 0.6,
  impactStrength: 1.2,
  /** The player stays this far inside the crowd's (breathing) pit radius. */
  pitWallMargin: 0.45,
  /** Visual air height for camera/shadow (the clip itself lifts the body). */
  airHeight: 0.5,
  hypePerDifficulty: 0.035,
  pitScale: { intro: 0.95, verse: 1, chorus: 1.05, breakdown: 1.25, heavy: 1.35, outro: 1 } as Record<string, number>,
};

const EMPTY_INPUT: FrameInput = { moveX: 0, moveZ: 0, stickX: 0, stickY: 0, sprint: false, presses: [] };

/**
 * One run through the test song: wires movement, moves, combo, music and
 * crowd. Headless – render, audio and UI listen to `events` and read state.
 */
export class PitSession {
  readonly song: SongDefinition;
  readonly venue: VenueDefinition;
  readonly timeline: SongTimeline;
  readonly beats: BeatManager;
  readonly movement = new MovementController();
  readonly moves = new MoveController(MOVES);
  readonly combo = new ComboManager();
  readonly hype = new HypeMeter();
  readonly crowd: CrowdSim;
  readonly events = new EventBus<SessionEvents>();

  songTime = -Infinity;
  ended = false;
  /** Smoothed 0..1 energy (music + hype) for crowd, lights and camera. */
  energy = 0;
  /** Touching the wall of people this step. */
  wallContact = false;
  /** Momentum at the start of the running full-body move (scored on landing). */
  private startMomentum = new Map<number, number>();

  constructor(song: SongDefinition, venue: VenueDefinition) {
    this.song = song;
    this.venue = venue;
    this.timeline = new SongTimeline(song);
    this.beats = new BeatManager(this.timeline);
    this.crowd = new CrowdSim(venue);
    this.movement.reset(venue.pit.x, venue.pit.z + 0.8);
  }

  get section(): ResolvedSection {
    return this.beats.section(this.songTime);
  }

  update(dt: number, songTime: number, input: FrameInput = EMPTY_INPUT): void {
    const prev = this.songTime === -Infinity ? songTime - dt : this.songTime;
    this.songTime = songTime;
    this.onMusic(prev, songTime);

    const situation: MoveSituation = { stickX: input.stickX, stickY: input.stickY, speed: this.movement.speed };
    for (const p of [...input.presses].sort((a, b) => a.time - b.time)) this.moves.press(p.category, p.time, situation);
    this.moves.update(songTime, situation);
    // Handlers can raise follow-up events (a crash bail on start) – drain until quiet.
    for (let batch = this.moves.drain(); batch.length; batch = this.moves.drain()) {
      for (const e of batch) {
        if (e.type === 'start') this.onStart(e.move, input);
        else if (e.type === 'land') this.onLand(e.move);
        else if (e.type === 'end') this.events.emit('moveEnd', { move: e.move, cancelled: e.cancelled });
        else if (e.type === 'bail') {
          this.hype.bail();
          this.events.emit('bail', { lost: this.combo.bail() });
          this.crowd.react('ooh', 0.7, this.movement.x, this.movement.z);
        }
      }
    }

    // Locomotion with the running moves' influence.
    const mv = this.movement;
    mv.update(dt, { moveX: input.moveX, moveZ: input.moveZ, sprint: input.sprint }, this.modifier(songTime));
    const full = this.moves.full;
    if (full?.def.air && this.moves.airborne(songTime)) {
      const p = this.moves.progress(full, songTime);
      mv.y = Math.sin(Math.PI * clamp((p - full.def.air.takeoff) / (full.def.air.land - full.def.air.takeoff), 0, 1)) * SESSION_TUNING.airHeight;
    } else {
      mv.y = 0;
    }

    // Crowd.
    const section = this.section;
    this.energy = clamp(section.intensity * 0.75 + this.hype.value * 0.35 + (this.hype.frenzy ? 0.3 : 0), 0, 1);
    const pulse = this.timeline.pulseAt(Math.max(0, songTime));
    this.crowd.update(dt, {
      time: songTime,
      beat: this.timeline.beatAt(songTime),
      pulseInterval: pulse.interval,
      pulsePhase: pulse.phase,
      energy: this.energy,
      frenzy: this.hype.frenzy,
      pitScale: (SESSION_TUNING.pitScale[section.type] ?? 1) * (1 + this.hype.value * 0.06),
      playerX: mv.x,
      playerZ: mv.z,
    });
    const push = this.crowd.resolvePlayer(mv.x, mv.z, 0.33);
    mv.push(push.dx, push.dz);
    const pit = this.venue.pit;
    if (mv.clampCircle(pit.x, pit.z, this.crowd.pitRadius - SESSION_TUNING.pitWallMargin)) this.wallContact = true;
    else this.wallContact = false;
    const { width, depth } = this.venue.room;
    mv.clampTo(-width / 2, width / 2, -depth / 2 + this.venue.stage.depth + 0.25, depth / 2);

    const banked = this.combo.tick(dt, this.moves.busy || this.moves.isBailing(songTime));
    if (banked) this.onBank(banked);
    if (this.hype.update(dt)) this.events.emit('frenzy', { active: false });

    if (!this.ended && songTime >= this.timeline.duration) {
      this.ended = true;
      const last = this.combo.bank();
      if (last) this.onBank(last);
      this.events.emit('songEnd', { time: songTime });
    }
  }

  /** How the running moves shape locomotion (bail: almost no control). */
  private modifier(time: number): MovementModifier | null {
    if (this.moves.isBailing(time)) return { steer: 0, speed: 0, carry: 0.2, lockFacing: true };
    const f = this.moves.full;
    const u = this.moves.upper;
    if (!f && !u) return null;
    const a = f?.def.movement;
    const b = u?.def.movement;
    return {
      steer: Math.min(a?.steer ?? 1, b?.steer ?? 1),
      speed: (a?.speed ?? 1) * (b?.speed ?? 1),
      carry: Math.max(a?.carry ?? 0, b?.carry ?? 0),
      lockFacing: !!f && f.def.category !== 'footwork',
    };
  }

  private onStart(move: ActiveMove, input: FrameInput): void {
    const mv = this.movement;
    const def = move.def;
    if (def.layer === 'full') this.startMomentum.set(move.seq, mv.momentum);
    // Facing: cartwheels travel along the stick with the body side-on; others keep the running line.
    if (def.movement.sideImpulse) {
      const travel = Math.atan2(input.moveX, input.moveZ);
      const a = wrapAngle(travel - Math.PI / 2);
      const b = wrapAngle(travel + Math.PI / 2);
      // Pick the side-on facing closer to the current body facing (less spin).
      const useA = Math.abs(wrapAngle(a - mv.yaw)) <= Math.abs(wrapAngle(b - mv.yaw));
      mv.face(useA ? a : b);
      move.mirror = !useA;
      mv.addSideImpulse(travel, def.movement.sideImpulse);
    } else if (mv.speed < 0.6 && Math.hypot(input.moveX, input.moveZ) > 0.3) {
      mv.face(Math.atan2(input.moveX, input.moveZ));
    }
    this.events.emit('moveStart', { move });

    // Risk is spatial: big moves into a packed crowd crash.
    if (def.risky && this.crowd.countNear(mv.x, mv.z, def.space * SESSION_TUNING.crashFactor) >= SESSION_TUNING.crashCount) {
      this.moves.bail(move.startTime);
      return;
    }
    if (def.air) {
      this.combo.refill();
      if (this.beats.dropHit(move.startTime) && this.combo.addBonus(BEAT_TUNING.dropBonus)) {
        this.events.emit('bonus', { name: 'DROP HIT', value: BEAT_TUNING.dropBonus });
      }
      return; // scored on landing
    }
    this.score(move);
  }

  private onLand(move: ActiveMove): void {
    const mv = this.movement;
    const crowded = this.crowd.countNear(mv.x, mv.z, SESSION_TUNING.sketchyRadius) >= SESSION_TUNING.sketchyCount;
    const quality = crowded ? 'sketchy' : 'clean';
    this.events.emit('land', { move, quality });
    this.score(move, quality);
    const hits = this.crowd.impact(mv.x, mv.z, move.def.space * 0.8, SESSION_TUNING.impactStrength);
    this.events.emit('impact', { x: mv.x, z: mv.z, strength: move.def.difficulty, hits });
  }

  private score(move: ActiveMove, landing?: 'clean' | 'sketchy'): void {
    const def = move.def;
    const momentum = this.startMomentum.get(move.seq) ?? this.movement.momentum;
    this.startMomentum.delete(move.seq);
    const rep = this.combo.repetitionOf(def.id);
    const entry = this.combo.addMove(def, {
      linked: move.linked,
      layered: move.layered,
      momentum,
      onBeat: this.beats.onBeat(move.startTime),
      section: this.beats.section(move.startTime).type,
      frenzy: this.hype.frenzy,
      landing,
    });
    this.events.emit('scored', { entry, move });
    if (this.hype.add(def.difficulty * SESSION_TUNING.hypePerDifficulty * rep)) {
      this.events.emit('frenzy', { active: true });
      this.crowd.react('cheer', 1, this.movement.x, this.movement.z);
    }
  }

  private onBank(result: BankResult): void {
    this.events.emit('bank', { result });
    const strength = clamp(Math.log10(Math.max(1, result.total)) / 5, 0, 1);
    this.hype.add(strength * 0.06);
    if (result.total > 2000) this.crowd.react('cheer', strength, this.movement.x, this.movement.z);
  }

  private onMusic(from: number, to: number): void {
    for (const e of this.beats.events(from, to)) {
      if (e.type === 'beat') this.events.emit('beat', e);
      else if (e.type === 'beatdrop') this.events.emit('beatdrop', { time: e.time });
      else {
        this.events.emit('section', { section: e.section });
        if (!e.first && (e.section.type === 'breakdown' || e.section.type === 'heavy')) {
          if (this.combo.addBonus(BEAT_TUNING.breakdownBonus)) {
            this.events.emit('bonus', { name: `${e.section.label} BONUS`, value: BEAT_TUNING.breakdownBonus });
          }
          if (this.hype.add(0.1)) this.events.emit('frenzy', { active: true });
        }
      }
    }
  }
}
