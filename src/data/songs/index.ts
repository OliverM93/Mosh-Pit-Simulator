import type { SongDefinition } from '../../audio/songTypes';
import { BEATDOWN, HARDCORE, PUNK } from './patterns';

/**
 * Song catalogue. All music is procedurally synthesised placeholder audio
 * created for this project (no third-party recordings). Bands are fictional.
 * Add a song: append a definition – sections/events drive gameplay, the
 * `audio` block decides how it sounds. See docs/AUDIO_AND_MUSIC.md.
 */
export const SONGS: SongDefinition[] = [
  {
    id: 'basement_rules',
    title: 'Basement Rules',
    artist: 'Concrete Halo',
    genre: 'hardcore',
    bpm: 165,
    beatsPerBar: 4,
    blurb: 'Mid-tempo NYHC stomp. Two breakdowns, one heavy part, zero mercy.',
    sections: [
      { type: 'intro', bars: 4 },
      { type: 'verse', bars: 8 },
      { type: 'chorus', bars: 8 },
      { type: 'verse', bars: 8 },
      { type: 'breakdown', bars: 8 },
      { type: 'chorus', bars: 8 },
      { type: 'verse', bars: 8 },
      { type: 'breakdown', bars: 8 },
      { type: 'heavy', bars: 8 },
      { type: 'outro', bars: 4 },
    ],
    events: [
      { type: 'beatdrop', bar: 28 },
      { type: 'beatdrop', bar: 52 },
      { type: 'beatdrop', bar: 60 },
    ],
    audio: { kind: 'synth', rootNote: 38, patterns: HARDCORE },
  },
  {
    id: 'spin_to_win',
    title: 'Spin To Win',
    artist: 'Lowrider Tactics',
    genre: 'beatdown',
    bpm: 138,
    beatsPerBar: 4,
    blurb: 'Slow, bouncy beatdown. Breakdowns so heavy the floor bends.',
    sections: [
      { type: 'intro', bars: 4 },
      { type: 'verse', bars: 8 },
      { type: 'breakdown', bars: 8 },
      { type: 'chorus', bars: 8 },
      { type: 'verse', bars: 8 },
      { type: 'breakdown', bars: 8 },
      { type: 'heavy', bars: 12, label: 'THE SLAM' },
      { type: 'outro', bars: 2 },
    ],
    events: [
      { type: 'beatdrop', bar: 12 },
      { type: 'beatdrop', bar: 36 },
      { type: 'beatdrop', bar: 44 },
    ],
    audio: { kind: 'synth', rootNote: 35, patterns: BEATDOWN },
  },
  {
    id: 'matinee_mayhem',
    title: 'Matinee Mayhem',
    artist: 'Pocket Knife Youth',
    genre: 'hardcore-punk',
    bpm: 188,
    beatsPerBar: 4,
    blurb: 'Fast hardcore punk. Dance on the half-time pulse or get lost.',
    sections: [
      { type: 'intro', bars: 2, pulseBeats: 2 },
      { type: 'verse', bars: 8, pulseBeats: 2 },
      { type: 'chorus', bars: 8, pulseBeats: 2 },
      { type: 'verse', bars: 8, pulseBeats: 2 },
      { type: 'chorus', bars: 8, pulseBeats: 2 },
      { type: 'breakdown', bars: 8, pulseBeats: 2 },
      { type: 'chorus', bars: 8, pulseBeats: 2 },
      { type: 'verse', bars: 8, pulseBeats: 2 },
      { type: 'heavy', bars: 8, pulseBeats: 2 },
      { type: 'outro', bars: 2, pulseBeats: 2 },
    ],
    events: [
      { type: 'beatdrop', bar: 34 },
      { type: 'beatdrop', bar: 58 },
    ],
    audio: { kind: 'synth', rootNote: 40, patterns: PUNK },
  },
];

export function getSong(id: string): SongDefinition {
  const s = SONGS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown song: ${id}`);
  return s;
}
