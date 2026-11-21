import { describe, expect, it } from 'vitest';
import { SongTimeline } from '../src/audio/SongTimeline';
import { SONGS } from '../src/data/songs';
import { testSong } from './helpers';

describe('SongTimeline', () => {
  const tl = new SongTimeline(testSong());

  it('derives duration and sections from metadata', () => {
    expect(tl.secondsPerBeat).toBeCloseTo(0.5);
    expect(tl.totalBeats).toBe(32);
    expect(tl.duration).toBeCloseTo(16);
    expect(tl.sections[1]!.startTime).toBeCloseTo(8);
    expect(tl.sectionAt(7.99).type).toBe('verse');
    expect(tl.sectionAt(8).type).toBe('breakdown');
    expect(tl.sectionAt(-1).type).toBe('verse');
    expect(tl.sectionAt(99).type).toBe('breakdown');
  });

  it('uses half-time pulses in breakdowns', () => {
    expect(tl.pulseAt(1.1).interval).toBeCloseTo(0.5);
    const p = tl.pulseAt(9.1);
    expect(p.interval).toBeCloseTo(1);
    expect(p.nearestTime).toBeCloseTo(9);
    expect(p.offset).toBeCloseTo(0.1);
  });

  it('reports signed offsets to the nearest pulse', () => {
    expect(tl.pulseAt(1.96).offset).toBeCloseTo(-0.04);
    expect(tl.pulseAt(2.04).offset).toBeCloseTo(0.04);
    expect(tl.pulseAt(2.25).phase).toBeCloseTo(0.5);
  });

  it('resolves events to song time', () => {
    expect(tl.events[0]!.time).toBeCloseTo(8);
    expect(tl.eventsBetween(7, 8)).toHaveLength(1);
    expect(tl.eventsBetween(8, 9)).toHaveLength(0);
  });

  it('rejects invalid pulse configuration', () => {
    expect(() => new SongTimeline(testSong({ sections: [{ type: 'verse', bars: 2, pulseBeats: 3 }] }))).toThrow();
  });
});

describe('song catalogue', () => {
  for (const song of SONGS) {
    it(`${song.id} is well-formed`, () => {
      const tl = new SongTimeline(song);
      expect(tl.duration).toBeGreaterThan(60);
      for (const e of tl.events) {
        expect(e.time).toBeGreaterThanOrEqual(0);
        expect(e.time).toBeLessThan(tl.duration);
      }
      if (song.audio.kind === 'synth') {
        for (const s of tl.sections) {
          const pattern = song.audio.patterns[s.riff];
          expect(pattern, `pattern ${s.riff}`).toBeDefined();
          for (const [key, value] of Object.entries(pattern!)) {
            if (typeof value === 'string') expect(value.length % 16, `${s.riff}.${key}`).toBe(0);
          }
        }
      }
    });
  }
});
