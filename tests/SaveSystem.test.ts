import { describe, expect, it } from 'vitest';
import { SAVE_KEY, SaveSystem, type KeyValueStorage } from '../src/save/SaveSystem';

function memory(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe('SaveSystem', () => {
  it('starts with defaults and persists highscores', () => {
    const store = memory();
    const s = new SaveSystem(store);
    expect(s.getHighscore('a', 'b')).toBeNull();
    expect(s.recordResult('a', 'b', { score: 1000, bestCombo: 400, perfects: 3 }, 10)).toBe(true);
    expect(s.recordResult('a', 'b', { score: 500, bestCombo: 900, perfects: 1 }, 5)).toBe(false);
    const again = new SaveSystem(store);
    expect(again.getHighscore('a', 'b')!.score).toBe(1000);
    expect(again.getHighscore('a', 'b')!.bestCombo).toBe(900);
    expect(again.data.stats.songsPlayed).toBe(2);
  });

  it('survives corrupt or foreign data', () => {
    expect(new SaveSystem(memory({ [SAVE_KEY]: '{nope' })).data.version).toBe(1);
    expect(new SaveSystem(memory({ [SAVE_KEY]: '{"version":99}' })).data.highscores).toEqual({});
    expect(new SaveSystem(null).data.settings.masterVolume).toBeGreaterThan(0);
  });

  it('fills in new settings fields from defaults', () => {
    const store = memory({ [SAVE_KEY]: JSON.stringify({ version: 1, settings: { masterVolume: 0.1 }, highscores: {}, stats: {} }) });
    const s = new SaveSystem(store);
    expect(s.data.settings.masterVolume).toBe(0.1);
    expect(s.data.settings.sfxVolume).toBe(0.8);
  });
});
