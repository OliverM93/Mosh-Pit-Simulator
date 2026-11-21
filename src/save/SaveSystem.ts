/**
 * Versioned local save (localStorage). Highscores, settings and lifetime
 * stats. Progression data (currency, unlocks) is reserved for Phase 3.
 */

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  /** Audio/input calibration in milliseconds (positive = you press late). */
  audioOffsetMs: number;
  mouseSensitivity: number;
  invertY: boolean;
  showMoveList: boolean;
}

export interface HighscoreEntry {
  score: number;
  bestCombo: number;
  perfects: number;
  date: string;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  /** Key: `${songId}@${venueId}`. */
  highscores: Record<string, HighscoreEntry>;
  stats: {
    songsPlayed: number;
    totalMoves: number;
    totalPerfects: number;
    bestComboEver: number;
  };
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SAVE_KEY = 'moshpit.save';

export function defaultSave(): SaveData {
  return {
    version: 1,
    settings: {
      masterVolume: 0.8,
      musicVolume: 0.8,
      sfxVolume: 0.8,
      audioOffsetMs: 0,
      mouseSensitivity: 1,
      invertY: false,
      showMoveList: true,
    },
    highscores: {},
    stats: { songsPlayed: 0, totalMoves: 0, totalPerfects: 0, bestComboEver: 0 },
  };
}

export function highscoreKey(songId: string, venueId: string): string {
  return `${songId}@${venueId}`;
}

export class SaveSystem {
  data: SaveData;
  private readonly storage: KeyValueStorage | null;

  constructor(storage: KeyValueStorage | null) {
    this.storage = storage;
    this.data = this.load();
  }

  private load(): SaveData {
    const base = defaultSave();
    try {
      const raw = this.storage?.getItem(SAVE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (parsed.version !== 1) return base;
      // Merge so new settings fields get defaults after updates.
      return {
        version: 1,
        settings: { ...base.settings, ...parsed.settings },
        highscores: { ...parsed.highscores },
        stats: { ...base.stats, ...parsed.stats },
      };
    } catch {
      return base;
    }
  }

  save(): void {
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or disabled (private mode) – the game keeps running.
    }
  }

  getHighscore(songId: string, venueId: string): HighscoreEntry | null {
    return this.data.highscores[highscoreKey(songId, venueId)] ?? null;
  }

  /** Records a finished song. Returns true for a new highscore. */
  recordResult(songId: string, venueId: string, result: Omit<HighscoreEntry, 'date'>, moves: number, now = new Date()): boolean {
    const s = this.data.stats;
    s.songsPlayed++;
    s.totalMoves += moves;
    s.totalPerfects += result.perfects;
    s.bestComboEver = Math.max(s.bestComboEver, result.bestCombo);
    const key = highscoreKey(songId, venueId);
    const prev = this.data.highscores[key];
    const isNew = !prev || result.score > prev.score;
    if (isNew) this.data.highscores[key] = { ...result, date: now.toISOString() };
    else prev.bestCombo = Math.max(prev.bestCombo, result.bestCombo);
    this.save();
    return isNew;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.save();
  }
}
