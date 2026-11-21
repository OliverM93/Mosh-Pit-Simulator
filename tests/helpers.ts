import type { SongDefinition } from '../src/audio/songTypes';
import { HARDCORE } from '../src/data/songs/patterns';

/** 120 BPM → 0.5 s per beat. 4 bars verse (pulse 1 beat), 4 bars breakdown (pulse 2 beats). */
export function testSong(overrides: Partial<SongDefinition> = {}): SongDefinition {
  return {
    id: 'test',
    title: 'Test',
    artist: 'Unit Testers',
    genre: 'hardcore',
    bpm: 120,
    beatsPerBar: 4,
    blurb: '',
    sections: [
      { type: 'verse', bars: 4 },
      { type: 'breakdown', bars: 4 },
    ],
    events: [{ type: 'beatdrop', bar: 4 }],
    audio: { kind: 'synth', rootNote: 38, patterns: HARDCORE },
    ...overrides,
  };
}
