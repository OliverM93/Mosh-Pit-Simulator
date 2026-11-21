import {
  DEFAULT_INTENSITY,
  DEFAULT_PULSE_BEATS,
  SECTION_LABEL,
  type SectionType,
  type SongDefinition,
  type SongEventType,
} from './songTypes';

export interface ResolvedSection {
  index: number;
  type: SectionType;
  label: string;
  startBeat: number;
  endBeat: number;
  startTime: number;
  endTime: number;
  pulseBeats: number;
  intensity: number;
  riff: string;
}

export interface ResolvedEvent {
  type: SongEventType;
  beat: number;
  time: number;
}

export interface PulseInfo {
  /** Seconds between pulses at this point of the song. */
  interval: number;
  prevTime: number;
  nextTime: number;
  nearestTime: number;
  /** Signed offset of `time` from the nearest pulse (negative = early). */
  offset: number;
  /** 0..1 position between prev and next pulse. */
  phase: number;
  /** Integer index of the previous pulse inside its section. */
  index: number;
}

/**
 * Pure, audio-independent view on a song: converts between seconds, beats,
 * bars, sections and timing pulses. Time 0 = beat 0 = start of first section.
 */
export class SongTimeline {
  readonly song: SongDefinition;
  readonly secondsPerBeat: number;
  readonly totalBeats: number;
  readonly duration: number;
  readonly sections: ResolvedSection[];
  readonly events: ResolvedEvent[];

  constructor(song: SongDefinition) {
    if (song.bpm <= 0) throw new Error(`Song ${song.id}: bpm must be > 0`);
    if (song.sections.length === 0) throw new Error(`Song ${song.id}: needs at least one section`);
    this.song = song;
    this.secondsPerBeat = 60 / song.bpm;

    let beat = 0;
    const typeCount: Partial<Record<SectionType, number>> = {};
    this.sections = song.sections.map((def, index) => {
      const startBeat = beat;
      const endBeat = beat + def.bars * song.beatsPerBar;
      beat = endBeat;
      const pulseBeats = def.pulseBeats ?? DEFAULT_PULSE_BEATS[def.type];
      if (song.beatsPerBar % pulseBeats !== 0) {
        throw new Error(`Song ${song.id}: pulseBeats ${pulseBeats} must divide beatsPerBar`);
      }
      const n = (typeCount[def.type] = (typeCount[def.type] ?? 0) + 1);
      return {
        index,
        type: def.type,
        label: def.label ?? (n > 1 && (def.type === 'breakdown' || def.type === 'heavy') ? `${SECTION_LABEL[def.type]} ${'I'.repeat(n)}` : SECTION_LABEL[def.type]),
        startBeat,
        endBeat,
        startTime: startBeat * this.secondsPerBeat,
        endTime: endBeat * this.secondsPerBeat,
        pulseBeats,
        intensity: def.intensity ?? DEFAULT_INTENSITY[def.type],
        riff: def.riff ?? def.type,
      };
    });
    this.totalBeats = beat;
    this.duration = beat * this.secondsPerBeat;

    this.events = song.events
      .map((e) => {
        const b = e.bar * song.beatsPerBar + (e.beat ?? 0);
        return { type: e.type, beat: b, time: b * this.secondsPerBeat };
      })
      .sort((a, b) => a.time - b.time);
  }

  beatAt(time: number): number {
    return time / this.secondsPerBeat;
  }

  timeOfBeat(beat: number): number {
    return beat * this.secondsPerBeat;
  }

  barAt(time: number): number {
    return Math.floor(this.beatAt(time) / this.song.beatsPerBar);
  }

  /** Section at a time; clamps to first/last section outside the song. */
  sectionAt(time: number): ResolvedSection {
    const s = this.sections;
    if (time < 0) return s[0]!;
    for (let i = 0; i < s.length; i++) {
      if (time < s[i]!.endTime) return s[i]!;
    }
    return s[s.length - 1]!;
  }

  /** Timing pulse grid around `time`. Pulses are anchored to the section start. */
  pulseAt(time: number): PulseInfo {
    const section = this.sectionAt(time);
    const interval = section.pulseBeats * this.secondsPerBeat;
    const rel = time - section.startTime;
    const index = Math.floor(rel / interval);
    const prevTime = section.startTime + index * interval;
    const nextTime = prevTime + interval;
    const nearestTime = time - prevTime <= nextTime - time ? prevTime : nextTime;
    return {
      interval,
      prevTime,
      nextTime,
      nearestTime,
      offset: time - nearestTime,
      phase: (time - prevTime) / interval,
      index,
    };
  }

  /** Events whose time lies in (from, to]. */
  eventsBetween(from: number, to: number): ResolvedEvent[] {
    return this.events.filter((e) => e.time > from && e.time <= to);
  }
}
