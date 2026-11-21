import { describe, expect, it } from 'vitest';
import { SongTimeline } from '../src/audio/SongTimeline';
import { buildUserSong, parseTimestamp, parseUserContent } from '../src/data/userSongs';

describe('user songs', () => {
  it('parses timestamps', () => {
    expect(parseTimestamp('1:42')).toBe(102);
    expect(parseTimestamp('0:05.5')).toBe(5.5);
    expect(parseTimestamp(12)).toBe(12);
    expect(parseTimestamp('abc')).toBeNaN();
  });

  it('validates the manifest and skips broken songs', () => {
    const c = parseUserContent({
      songs: [
        { file: 'songs/a.mp3', title: 'A', artist: 'Band', sections: [{ type: 'breakdown', start: '1:00' }, { type: 'nope', start: 1 }] },
        { title: 'missing file' },
      ],
      merch: [{ band: 'Band', logo: 'logos/band.png' }, { band: 3 }],
    });
    expect(c.songs).toHaveLength(1);
    expect(c.songs[0]!.id).toBe('user_band_a');
    expect(c.songs[0]!.sections).toHaveLength(1);
    expect(c.merch[0]!.band).toBe('BAND');
    expect(c.errors.length).toBe(3);
  });

  it('snaps section timestamps to bars and adds beatdrops', () => {
    // 120 BPM, 4/4 → 2 s per bar, beat 0 at 0.5 s, 60.5 s of audio → 30 bars.
    const [entry] = parseUserContent({
      songs: [
        {
          file: 'songs/a.mp3',
          title: 'A',
          artist: 'Band',
          sections: [
            { type: 'verse', start: '0:08.4' },
            { type: 'breakdown', start: '0:40.6' },
            { type: 'outro', start: 56.4 },
          ],
        },
      ],
    }).songs;
    const song = buildUserSong(entry!, { bpm: 120, offsetSec: 0.5, durationSec: 60.5 });
    expect(song.sections.map((s) => [s.type, s.bars])).toEqual([
      ['intro', 4],
      ['verse', 16],
      ['breakdown', 8],
      ['outro', 2],
    ]);
    expect(song.events).toEqual([{ type: 'beatdrop', bar: 20 }]);
    expect(song.audio).toEqual({ kind: 'file', url: './user-content/songs/a.mp3', offsetSec: 0.5 });
    const tl = new SongTimeline(song);
    expect(tl.duration).toBeCloseTo(60);
  });

  it('falls back to one long verse without markers', () => {
    const [entry] = parseUserContent({ songs: [{ file: 'x.ogg', title: 'X', artist: 'Y', pulseBeats: 2 }] }).songs;
    const song = buildUserSong(entry!, { bpm: 180, offsetSec: 0, durationSec: 90 });
    expect(song.sections).toEqual([{ type: 'verse', bars: 67, pulseBeats: 2 }]); // 90 s / (4 × 60/180 s)
  });
});
