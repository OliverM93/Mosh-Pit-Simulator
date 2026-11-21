import { SongTimeline, type ResolvedSection } from '../audio/SongTimeline';
import type { SongDefinition } from '../audio/songTypes';
import { EventBus } from '../core/EventBus';
import { clamp } from '../core/math';
import { MOVES } from '../data/moves';
import type { VenueDefinition } from '../data/venueTypes';
import { ComboSystem, type BankResult, type MoveScoreContext, type ScoredMove } from './ComboSystem';
import { CrowdSim } from './crowd/CrowdSim';
import { HypeMeter } from './HypeMeter';
import { MoveSystem, MOVE_TUNING, type ActiveMove, type MoveRequest } from './MoveSystem';
import { Player, PLAYER_TUNING, type PlayerInput } from './Player';
import { RATING_HYPE, type Rating } from './timing';

export interface SessionEvents {
  beat: { beat: number; bar: number; beatInBar: number; time: number };
  pulse: { index: number; time: number; section: ResolvedSection };
  section: { section: ResolvedSection };
  beatdrop: { time: number };
  moveStart: { move: ActiveMove };
  moveScored: { scored: ScoredMove; move: ActiveMove };
  rating: { rating: Rating; offset: number; move: string };
  bail: { lost: number; reason: 'crash' };
  bank: { result: BankResult };
  bonus: { name: string; value: number };
  frenzy: { active: boolean };
  impact: { x: number; z: number; strength: number; hits: number };
  land: { quality: 'clean' | 'sketchy' | 'hop' };
  songEnd: { time: number };
}

export interface FrameInput extends PlayerInput {
  presses: MoveRequest[];
}

interface PendingMoveContext {
  ctx: Omit<MoveScoreContext, 'landing'>;
  impactDone: boolean;
}

export const SESSION_TUNING = {
  breakdownBonus: 500,
  breakdownHype: 0.12,
  /** A perfect move this close (in pulses) to a beatdrop is a DROP HIT. */
  dropWindowPulses: 0.5,
  /** Crowd members within space × this make a move cramped. */
  crampedFactor: 0.8,
  crampedCount: 2,
  /** Advanced moves with at least this many people inside their space crash (bail). */
  crashCount: 4,
  crashFactor: 0.7,
  impactStrength: 1.2,
  pitScale: { intro: 0.95, verse: 1, chorus: 1.05, breakdown: 1.3, heavy: 1.4, outro: 1 } as Record<string, number>,
};

/**
 * One play-through of a song in a venue: wires the timeline, move system,
 * scoring, hype, player and crowd together. Headless – rendering, audio and
 * UI only listen to `events` and read state.
 */
export class PitSession {
  readonly song: SongDefinition;
  readonly venue: VenueDefinition;
  readonly timeline: SongTimeline;
  readonly moves: MoveSystem;
  readonly combo = new ComboSystem();
  readonly hype = new HypeMeter();
  readonly player = new Player();
  readonly crowd: CrowdSim;
  readonly events = new EventBus<SessionEvents>();

  songTime = -Infinity;
  ended = false;
  /** Smoothed 0..1 energy (section intensity + hype) for crowd, lights, camera. */
  energy = 0;
  lastWallContact = false;
  private pending: PendingMoveContext | null = null;
  private lastSection = -1;
  private lastPulseKey = '';
  private lastBeat = -Infinity;

  constructor(song: SongDefinition, venue: VenueDefinition) {
    this.song = song;
    this.venue = venue;
    this.timeline = new SongTimeline(song);
    this.moves = new MoveSystem(this.timeline, MOVES);
    this.crowd = new CrowdSim(venue);
    this.player.reset(venue.pit.x, venue.pit.z + 0.5);
  }

  get section(): ResolvedSection {
    return this.timeline.sectionAt(Math.max(0, this.songTime));
  }

  /** Restart for looping modes; keeps score unless `resetScore`. */
  restart(resetScore: boolean): void {
    this.songTime = -Infinity;
    this.ended = false;
    this.lastSection = -1;
    this.lastPulseKey = '';
    this.lastBeat = -Infinity;
    this.moves.reset();
    this.pending = null;
    if (resetScore) {
      this.combo.reset();
      this.hype.reset();
    } else {
      this.combo.bank();
    }
  }

  update(dt: number, songTime: number, input: FrameInput): void {
    const prevTime = this.songTime;
    this.songTime = songTime;
    this.emitMusicEvents(prevTime === -Infinity ? songTime - dt : prevTime, songTime);

    // Moves.
    const presses = input.presses.slice().sort((a, b) => a.pressTime - b.pressTime);
    for (const p of presses) this.moves.press(p);
    this.moves.update(songTime);
    // Handlers can raise follow-up events (e.g. a crash bail) – drain until quiet.
    for (let events = this.moves.drain(); events.length; events = this.moves.drain()) {
      for (const e of events) {
        switch (e.type) {
          case 'start':
            this.onMoveStart(e.move, input);
            break;
          case 'convert':
            this.player.retargetJump(e.move, songTime);
            this.events.emit('moveStart', { move: e.move });
            break;
          case 'end':
            this.onMoveEnd(e.move);
            break;
          case 'bail': {
            const lost = this.combo.bail();
            this.hype.bail();
            this.pending = null;
            this.events.emit('bail', { lost, reason: e.reason });
            this.crowd.react('ooh', 0.7, this.player.x, this.player.z);
            break;
          }
          case 'recover':
            break;
        }
      }
    }

    // Mid-move impact for space-hungry moves.
    const cur = this.moves.current;
    if (cur && this.pending && !this.pending.impactDone && cur.def.space >= 1 && this.moves.progress(songTime) >= 0.45) {
      this.pending.impactDone = true;
      const hits = this.crowd.impact(this.player.x, this.player.z, cur.def.space, SESSION_TUNING.impactStrength);
      this.events.emit('impact', { x: this.player.x, z: this.player.z, strength: cur.def.difficulty, hits });
    }

    // Player physics + crowd.
    this.player.update(dt, songTime, input, this.moves.current, this.moves.isBailing);
    const pulse = this.timeline.pulseAt(songTime);
    const section = this.section;
    this.energy = clamp(section.intensity * 0.75 + this.hype.value * 0.35 + (this.hype.frenzy ? 0.3 : 0), 0, 1);
    this.crowd.update(dt, {
      time: songTime,
      beat: this.timeline.beatAt(songTime),
      pulseInterval: pulse.interval,
      pulsePhase: pulse.phase,
      energy: this.energy,
      frenzy: this.hype.frenzy,
      pitScale: (SESSION_TUNING.pitScale[section.type] ?? 1) * (1 + this.hype.value * 0.08),
      playerX: this.player.x,
      playerZ: this.player.z,
    });
    const push = this.crowd.resolvePlayer(this.player.x, this.player.z, PLAYER_TUNING.radius);
    this.player.push(push.dx, push.dz);
    this.lastWallContact = push.wall;
    this.clampPlayer();

    // Combo chain window / banking.
    const banked = this.combo.tick(songTime, this.moves.busy);
    if (banked) this.onBank(banked);

    if (this.hype.update(dt)) this.events.emit('frenzy', { active: false });

    if (!this.ended && songTime >= this.timeline.duration) {
      this.ended = true;
      const last = this.combo.bank();
      if (last) this.onBank(last);
      this.events.emit('songEnd', { time: songTime });
    }
  }

  private clampPlayer(): void {
    const { width, depth } = this.venue.room;
    const stageFront = -depth / 2 + this.venue.stage.depth + 0.25;
    this.player.clampTo(-width / 2, width / 2, stageFront, depth / 2);
  }

  private onMoveStart(move: ActiveMove, input: FrameInput): void {
    const p = this.player;
    p.beginMove(move, input);
    const def = move.def;
    const section = this.timeline.sectionAt(Math.max(0, move.startTime));
    const ctx: Omit<MoveScoreContext, 'landing'> = {
      rating: move.rating,
      section: section.type,
      cleanLink: move.cleanLink,
      runUp: p.hasRunUp(move.startTime),
      cramped: this.crowd.countNear(p.x, p.z, def.space * SESSION_TUNING.crampedFactor) >= SESSION_TUNING.crampedCount,
      frenzy: this.hype.frenzy,
      dropHit: move.rating === 'perfect' && this.nearDrop(move.startTime),
    };
    // Risk is spatial, not rhythmic: a big move thrown into a packed crowd crashes.
    if (def.advanced && this.crowd.countNear(p.x, p.z, def.space * SESSION_TUNING.crashFactor) >= SESSION_TUNING.crashCount) {
      this.events.emit('moveStart', { move });
      this.moves.forceBail(move.startTime, 'crash');
      return;
    }
    this.pending = { ctx, impactDone: false };
    this.events.emit('moveStart', { move });
    this.events.emit('rating', { rating: move.rating, offset: move.offset, move: def.name });
    // Ground moves score immediately; air moves and hops on landing.
    if (!move.airborne) this.score(move, ctx);
    else this.combo.keepAlive(move.startTime);
  }

  private onMoveEnd(move: ActiveMove): void {
    if (!move.airborne || !this.pending) {
      this.pending = null;
      return;
    }
    const pending = this.pending;
    this.pending = null;
    if (move.def.id === 'hop') {
      this.score(move, pending.ctx);
      this.events.emit('land', { quality: 'hop' });
      return;
    }
    const late = (move.conversionProgress ?? 0) > MOVE_TUNING.sketchyAfter;
    const crowded = this.crowd.countNear(this.player.x, this.player.z, 0.55) >= 2;
    const landing = late || crowded ? 'sketchy' : 'clean';
    this.score(move, { ...pending.ctx, cramped: pending.ctx.cramped, landing });
    this.events.emit('land', { quality: landing });
    const hits = this.crowd.impact(this.player.x, this.player.z, move.def.space * 0.8, SESSION_TUNING.impactStrength);
    this.events.emit('impact', { x: this.player.x, z: this.player.z, strength: move.def.difficulty * 1.2, hits });
  }

  private score(move: ActiveMove, ctx: MoveScoreContext): void {
    const scored = this.combo.addMove(move.def, ctx, this.songTime);
    const hype = RATING_HYPE[ctx.rating] * move.def.difficulty * (scored.repetitionFactor >= 0.5 ? 1 : 0.2);
    if (this.hype.add(hype)) {
      this.events.emit('frenzy', { active: true });
      this.crowd.react('cheer', 1, this.player.x, this.player.z);
    }
    this.events.emit('moveScored', { scored, move });
    for (const b of scored.bonuses) this.events.emit('bonus', b);
  }

  private onBank(result: BankResult): void {
    this.events.emit('bank', { result });
    const strength = clamp(Math.log10(Math.max(1, result.total)) / 5, 0, 1);
    this.hype.add(strength * 0.08);
    if (result.total > 500) this.crowd.react('cheer', strength, this.player.x, this.player.z);
  }

  private nearDrop(time: number): boolean {
    const interval = this.timeline.pulseAt(time).interval;
    return this.timeline.events.some((e) => e.type === 'beatdrop' && Math.abs(e.time - time) <= interval * SESSION_TUNING.dropWindowPulses);
  }

  private emitMusicEvents(from: number, to: number): void {
    if (to < 0) return;
    const tl = this.timeline;
    const section = tl.sectionAt(to);
    if (section.index !== this.lastSection) {
      const first = this.lastSection === -1;
      this.lastSection = section.index;
      this.events.emit('section', { section });
      if (!first && (section.type === 'breakdown' || section.type === 'heavy')) {
        if (this.combo.addPoolBonus(SESSION_TUNING.breakdownBonus, to)) {
          this.events.emit('bonus', { name: `${section.label} BONUS`, value: SESSION_TUNING.breakdownBonus });
        }
        if (this.hype.add(SESSION_TUNING.breakdownHype)) this.events.emit('frenzy', { active: true });
      }
    }
    const beat = Math.floor(tl.beatAt(to));
    if (beat !== this.lastBeat && beat >= 0) {
      this.lastBeat = beat;
      const bpb = this.song.beatsPerBar;
      this.events.emit('beat', { beat, bar: Math.floor(beat / bpb), beatInBar: beat % bpb, time: tl.timeOfBeat(beat) });
    }
    const pulse = tl.pulseAt(to);
    const key = `${section.index}:${pulse.index}`;
    if (key !== this.lastPulseKey) {
      this.lastPulseKey = key;
      this.events.emit('pulse', { index: pulse.index, time: pulse.prevTime, section });
    }
    for (const e of tl.eventsBetween(from, to)) {
      if (e.type === 'beatdrop') this.events.emit('beatdrop', { time: e.time });
    }
  }
}
