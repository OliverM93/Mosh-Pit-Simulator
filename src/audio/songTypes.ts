/**
 * Data-driven song description. Songs are pure data: the timeline (sections,
 * pulses, events) is derived from metadata, never from audio analysis.
 * See docs/AUDIO_AND_MUSIC.md.
 */

export type SectionType = 'intro' | 'verse' | 'chorus' | 'breakdown' | 'heavy' | 'outro';
export type Genre = 'hardcore' | 'beatdown' | 'metalcore' | 'hardcore-punk';

export interface SongSectionDef {
  type: SectionType;
  /** Length in bars. */
  bars: number;
  /** HUD label override, e.g. "BREAKDOWN II". */
  label?: string;
  /** Beats per timing pulse. 1 = every beat, 2 = half-time feel. Defaults per section type. */
  pulseBeats?: number;
  /** 0..1, drives lights and crowd energy. Defaults per section type. */
  intensity?: number;
  /** Synth only: riff id from the song's riff table. Defaults to the section type. */
  riff?: string;
}

export type SongEventType = 'beatdrop';

export interface SongEventDef {
  type: SongEventType;
  /** 0-based bar index from song start. */
  bar: number;
  /** 0-based beat inside the bar. */
  beat?: number;
}

/** Procedurally synthesised placeholder music (self-made, license-free). */
export interface SynthAudioDef {
  kind: 'synth';
  /** MIDI note of the riff root (e.g. 36 = C2, drop-C tuning). */
  rootNote: number;
  /** Riff/drum pattern table, keyed by riff id (section type by default). */
  patterns: Record<string, SynthPattern>;
}

/** A recorded audio file plus its sync offset (future songs). */
export interface FileAudioDef {
  kind: 'file';
  url: string;
  /** Seconds from file start to beat 0 of the timeline. */
  offsetSec: number;
}

/**
 * 16th-note step patterns. Every string is a whole number of bars
 * (16 chars per 4/4 bar) and loops for the section's length.
 *  drums: 'x' hit, 'X' accented hit, '.' rest
 *  guitar: '0'-'9','a','b' power chord at semitone offset, 'x' palm-muted chug on root,
 *          '-' sustain previous, '.' rest (mute)
 */
export interface SynthPattern {
  kick: string;
  snare: string;
  hat: string;
  /** Crash / china. */
  crash?: string;
  tom?: string;
  guitar: string;
  /** Lead single-note line (optional), same token set as guitar, played two octaves above the root. */
  lead?: string;
  /** Open (ringing) hats instead of closed. */
  openHat?: boolean;
}

export interface SongDefinition {
  id: string;
  title: string;
  /** Fictional band name. */
  artist: string;
  genre: Genre;
  bpm: number;
  beatsPerBar: number;
  sections: SongSectionDef[];
  events: SongEventDef[];
  audio: SynthAudioDef | FileAudioDef;
  /** Short flavour text for the song select screen. */
  blurb: string;
  /** Optional band logo image (user content) for the stage banner. */
  logoUrl?: string;
}

export const DEFAULT_PULSE_BEATS: Record<SectionType, number> = {
  intro: 1,
  verse: 1,
  chorus: 1,
  breakdown: 2,
  heavy: 2,
  outro: 1,
};

export const DEFAULT_INTENSITY: Record<SectionType, number> = {
  intro: 0.25,
  verse: 0.55,
  chorus: 0.7,
  breakdown: 0.9,
  heavy: 1,
  outro: 0.35,
};

export const SECTION_LABEL: Record<SectionType, string> = {
  intro: 'INTRO',
  verse: 'VERSE',
  chorus: 'CHORUS',
  breakdown: 'BREAKDOWN',
  heavy: 'HEAVY PART',
  outro: 'OUTRO',
};
