import type { ResolvedSection, SongTimeline } from '../audio/SongTimeline';

export const BEAT_TUNING = {
  /** A move starting this close (s) to a beat counts as ON BEAT (bonus only, never required). */
  onBeatWindow: 0.08,
  /** A move started this close (s) to a beatdrop is a DROP HIT. */
  dropWindow: 0.3,
  dropBonus: 1000,
  breakdownBonus: 500,
};

export type MusicEvent =
  | { type: 'beat'; beat: number; beatInBar: number; time: number }
  | { type: 'section'; section: ResolvedSection; first: boolean }
  | { type: 'beatdrop'; time: number };

/**
 * Reads the song timeline for gameplay: musical events (beats, sections,
 * beatdrops) and bonus windows. Music amplifies the game, it never gates moves.
 */
export class BeatManager {
  private lastSection = -1;
  private lastBeat = -Infinity;

  constructor(readonly timeline: SongTimeline) {}

  section(time: number): ResolvedSection {
    return this.timeline.sectionAt(Math.max(0, time));
  }

  /** Distance (s) to the nearest beat. */
  beatOffset(time: number): number {
    const b = Math.round(this.timeline.beatAt(time));
    return time - this.timeline.timeOfBeat(b);
  }

  onBeat(time: number): boolean {
    return time >= 0 && Math.abs(this.beatOffset(time)) <= BEAT_TUNING.onBeatWindow;
  }

  dropHit(time: number): boolean {
    return this.timeline.events.some((e) => e.type === 'beatdrop' && Math.abs(e.time - time) <= BEAT_TUNING.dropWindow);
  }

  /** Heavy parts of the song where the crowd goes wild. */
  isBreakdown(time: number): boolean {
    const t = this.section(time).type;
    return t === 'breakdown' || t === 'heavy';
  }

  /** Musical events between two song times (call once per step, in order). */
  events(from: number, to: number): MusicEvent[] {
    const out: MusicEvent[] = [];
    if (to < 0) return out;
    const tl = this.timeline;
    const section = tl.sectionAt(to);
    if (section.index !== this.lastSection) {
      out.push({ type: 'section', section, first: this.lastSection === -1 });
      this.lastSection = section.index;
    }
    const beat = Math.floor(tl.beatAt(to));
    if (beat !== this.lastBeat && beat >= 0) {
      this.lastBeat = beat;
      const bpb = tl.song.beatsPerBar;
      out.push({ type: 'beat', beat, beatInBar: beat % bpb, time: tl.timeOfBeat(beat) });
    }
    for (const e of tl.eventsBetween(from, to)) if (e.type === 'beatdrop') out.push({ type: 'beatdrop', time: e.time });
    return out;
  }

  reset(): void {
    this.lastSection = -1;
    this.lastBeat = -Infinity;
  }
}
