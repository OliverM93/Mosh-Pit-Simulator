/**
 * Game modes. A mode only decides the rules around a session (looping,
 * results, highscores, objectives) – the pit itself is always the same.
 */
export type GameModeId = 'arcade' | 'freepit' | 'career' | 'challenge';

export interface GameModeDefinition {
  id: GameModeId;
  name: string;
  description: string;
  /** Implemented and selectable in the menu. */
  available: boolean;
  /** Restart the song when it ends instead of showing results. */
  loopSong: boolean;
  showResults: boolean;
  saveHighscore: boolean;
  /** Show the remaining song time in the HUD. */
  showTimer: boolean;
}

export const MODES: GameModeDefinition[] = [
  {
    id: 'arcade',
    name: 'Arcade',
    description: 'One song. One shot. Get the highest score you can.',
    available: true,
    loopSong: false,
    showResults: true,
    saveHighscore: true,
    showTimer: true,
  },
  {
    id: 'freepit',
    name: 'Free Pit',
    description: 'No timer, no pressure. The song loops – practise your combos.',
    available: true,
    loopSong: true,
    showResults: false,
    saveHighscore: false,
    showTimer: false,
  },
  {
    id: 'career',
    name: 'Career',
    description: 'From basement nobody to festival legend. (Phase 3)',
    available: false,
    loopSong: false,
    showResults: true,
    saveHighscore: true,
    showTimer: true,
  },
  {
    id: 'challenge',
    name: 'Challenges',
    description: 'Goals like "5 different moves in a row". (Phase 4)',
    available: false,
    loopSong: false,
    showResults: true,
    saveHighscore: false,
    showTimer: true,
  },
];

export function getMode(id: GameModeId): GameModeDefinition {
  const m = MODES.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown mode: ${id}`);
  return m;
}
