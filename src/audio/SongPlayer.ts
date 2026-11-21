import type { AudioEngine } from './AudioEngine';
import { Bass, DrumKit, GuitarAmp } from './instruments';
import type { SongTimeline } from './SongTimeline';
import type { FileAudioDef, SynthAudioDef, SynthPattern } from './songTypes';

/** Anything that can play a song so that beat 0 lands on `ctxStartTime`. */
export interface SongPlayback {
  /** Resolves when the song can start (e.g. file decoded). */
  load(): Promise<void>;
  start(ctxStartTime: number): void;
  stop(): void;
}

export function createSongPlayback(engine: AudioEngine, timeline: SongTimeline): SongPlayback {
  const audio = timeline.song.audio;
  return audio.kind === 'synth' ? new SynthSongPlayer(engine, timeline, audio) : new FileSongPlayer(engine, audio);
}

const STEPS_PER_BEAT = 4;
const LOOKAHEAD = 0.15;
const TICK_MS = 25;
/** Music bus level – leaves headroom for SFX before the master limiter. */
const MUSIC_LEVEL = 0.8;

/** Token → semitone offset: '0'-'9', 'a'=10, 'b'=11, 'c'=12 … (base 36, except 'x'). */
function semitone(ch: string): number | null {
  if (ch === 'x' || ch === '-' || ch === '.' || ch === 'X') return null;
  const v = parseInt(ch, 36);
  return Number.isNaN(v) ? null : v;
}

/**
 * Lookahead scheduler that renders the song from its pattern table.
 * Every note is scheduled at an exact AudioContext time.
 */
export class SynthSongPlayer implements SongPlayback {
  private readonly engine: AudioEngine;
  private readonly timeline: SongTimeline;
  private readonly audio: SynthAudioDef;
  private timer: number | null = null;
  private startTime = 0;
  private nextStep = 0;
  private readonly stepDur: number;
  private readonly totalSteps: number;
  private drums!: DrumKit;
  private gtrL!: GuitarAmp;
  private gtrR!: GuitarAmp;
  private leadAmp!: GuitarAmp;
  private bass!: Bass;
  private bus!: GainNode;

  constructor(engine: AudioEngine, timeline: SongTimeline, audio: SynthAudioDef) {
    this.engine = engine;
    this.timeline = timeline;
    this.audio = audio;
    this.stepDur = timeline.secondsPerBeat / STEPS_PER_BEAT;
    this.totalSteps = timeline.totalBeats * STEPS_PER_BEAT;
  }

  async load(): Promise<void> {
    const ctx = this.engine.ctx;
    if (!ctx) throw new Error('AudioEngine not unlocked');
    this.bus = ctx.createGain();
    this.bus.gain.value = MUSIC_LEVEL;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.12;
    this.bus.connect(comp).connect(this.engine.music);
    const drumBus = ctx.createGain();
    drumBus.gain.value = 0.9;
    drumBus.connect(this.bus);
    this.drums = new DrumKit(ctx, drumBus, this.engine.noise);
    this.gtrL = new GuitarAmp(ctx, this.bus, -0.6);
    this.gtrR = new GuitarAmp(ctx, this.bus, 0.6);
    this.leadAmp = new GuitarAmp(ctx, this.bus, 0.25, 10);
    this.bass = new Bass(ctx, this.bus);
  }

  start(ctxStartTime: number): void {
    this.stop();
    this.startTime = ctxStartTime;
    this.nextStep = 0;
    this.bus.gain.cancelScheduledValues(0);
    this.bus.gain.value = MUSIC_LEVEL;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    const ctx = this.engine.ctx;
    if (ctx && this.bus) {
      // Quick fade so already scheduled notes don't keep ringing.
      this.bus.gain.cancelScheduledValues(ctx.currentTime);
      this.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    }
  }

  private schedule(): void {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const horizon = ctx.currentTime + LOOKAHEAD;
    while (this.nextStep < this.totalSteps) {
      const t = this.startTime + this.nextStep * this.stepDur;
      if (t >= horizon) break;
      if (t >= ctx.currentTime - 0.05) this.playStep(this.nextStep, t);
      this.nextStep++;
    }
  }

  private playStep(step: number, t: number): void {
    const beat = step / STEPS_PER_BEAT;
    const section = this.timeline.sectionAt(this.timeline.timeOfBeat(beat) + 1e-6);
    const pattern = this.audio.patterns[section.riff] ?? this.audio.patterns[section.type];
    if (!pattern) return;
    const local = step - section.startBeat * STEPS_PER_BEAT;
    const sectionEnd = section.endBeat * STEPS_PER_BEAT - section.startBeat * STEPS_PER_BEAT;

    const hit = (s: string | undefined) => {
      if (!s) return 0;
      const c = s[local % s.length];
      return c === 'X' ? 1 : c === 'x' ? 0.8 : 0;
    };
    const k = hit(pattern.kick);
    if (k) this.drums.kick(t, k);
    const sn = hit(pattern.snare);
    if (sn) this.drums.snare(t, sn);
    const h = hit(pattern.hat);
    if (h) this.drums.hat(t, !!pattern.openHat, h);
    if (hit(pattern.crash)) this.drums.crash(t);
    if (hit(pattern.tom)) this.drums.tom(t, 90 + ((local * 7) % 40));

    this.playGuitar(pattern, local, sectionEnd, t);
  }

  private sustain(line: string, local: number, sectionEnd: number): number {
    let n = 1;
    while (local + n < sectionEnd && line[(local + n) % line.length] === '-') n++;
    return n;
  }

  private playGuitar(pattern: SynthPattern, local: number, sectionEnd: number, t: number): void {
    const root = this.audio.rootNote;
    const g = pattern.guitar[local % pattern.guitar.length];
    if (g === 'x') {
      this.gtrL.chord(t, root, this.stepDur, true, -7);
      this.gtrR.chord(t, root, this.stepDur, true, 7);
      this.bass.note(t, root, this.stepDur * 0.9);
    } else if (g !== undefined) {
      const st = semitone(g);
      if (st !== null) {
        const dur = this.sustain(pattern.guitar, local, sectionEnd) * this.stepDur * 0.96;
        this.gtrL.chord(t, root + st, dur, false, -7);
        this.gtrR.chord(t, root + st, dur, false, 7);
        this.bass.note(t, root + st, dur);
      }
    }
    if (pattern.lead) {
      const l = pattern.lead[local % pattern.lead.length];
      const st = l !== undefined ? semitone(l) : null;
      if (st !== null) {
        const dur = this.sustain(pattern.lead, local, sectionEnd) * this.stepDur * 0.9;
        this.leadAmp.lead(t, root + 24 + st, dur);
      }
    }
  }
}

/**
 * Plays a recorded song file. Prepared for real songs; the current catalogue
 * only uses synth songs, so this path is not exercised yet.
 */
export class FileSongPlayer implements SongPlayback {
  private readonly engine: AudioEngine;
  private readonly audio: FileAudioDef;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;

  constructor(engine: AudioEngine, audio: FileAudioDef) {
    this.engine = engine;
    this.audio = audio;
  }

  async load(): Promise<void> {
    const ctx = this.engine.ctx;
    if (!ctx) throw new Error('AudioEngine not unlocked');
    const res = await fetch(this.audio.url);
    this.buffer = await ctx.decodeAudioData(await res.arrayBuffer());
  }

  start(ctxStartTime: number): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.buffer) return;
    this.stop();
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.engine.music);
    const when = ctxStartTime - this.audio.offsetSec;
    if (when >= ctx.currentTime) src.start(when);
    else src.start(ctx.currentTime, ctx.currentTime - when);
    this.source = src;
  }

  stop(): void {
    this.source?.stop();
    this.source = null;
  }
}
