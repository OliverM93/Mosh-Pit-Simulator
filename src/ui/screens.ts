import { clamp, formatScore } from '../core/math';
import { MOVES } from '../data/moves';
import { NAMED_COMBOS } from '../data/comboBonuses';
import type { SongDefinition } from '../audio/songTypes';
import type { SessionStats } from '../gameplay/ComboSystem';
import { MODES, type GameModeDefinition } from '../gameplay/modes';
import { GRAPHICS_ORDER, GRAPHICS_PRESETS } from '../data/graphics';
import type { Settings } from '../save/SaveSystem';
import { el, MenuScreen } from './Menu';

export function titleScreen(onStart: () => void): MenuScreen {
  const s = new MenuScreen('title');
  s.el.append(
    el('div', 'logo', 'MOSH<br>PIT'),
    el('div', 'subtitle', 'HARDCORE ARCADE SIMULATOR'),
    el('div', 'blink', 'PRESS ANY KEY'),
    el('div', 'footnote', 'Prototype · Phase 1 · placeholder songs are synthesised in-game, not recordings by the bands named on shirts and flyers'),
  );
  s.onAny = () => onStart();
  s.el.addEventListener('click', () => onStart());
  return s;
}

export function mainMenu(onMode: (m: GameModeDefinition) => void, onSettings: () => void, onHelp: () => void): MenuScreen {
  const s = new MenuScreen();
  s.el.append(el('div', 'logo', 'MOSH PIT'), el('div', 'subtitle', ' '));
  const menu = el('div', 'menu');
  for (const m of MODES) {
    const b = el('button', '', `${m.name.toUpperCase()}${m.available ? '' : '<span class="meta">SOON</span>'}<span class="desc">${m.description}</span>`);
    s.add({ el: b, disabled: !m.available, activate: () => onMode(m) });
    menu.appendChild(b);
  }
  const help = el('button', '', 'HOW TO PLAY');
  s.add({ el: help, activate: onHelp });
  const settings = el('button', '', 'SETTINGS');
  s.add({ el: settings, activate: onSettings });
  menu.append(help, settings);
  s.el.appendChild(menu);
  return s;
}

export function songSelect(
  songs: SongDefinition[],
  mode: GameModeDefinition,
  venueName: string,
  best: (songId: string) => number,
  onPick: (song: SongDefinition) => void,
  onBack: () => void,
): MenuScreen {
  const s = new MenuScreen();
  s.el.append(el('h1', 'screen-title', `${mode.name.toUpperCase()} · PICK A SONG`), el('div', 'subtitle', `VENUE: ${venueName.toUpperCase()}`));
  const menu = el('div', 'menu');
  menu.style.marginTop = '20px';
  for (const song of songs) {
    const hi = best(song.id);
    const b = el(
      'button',
      '',
      `${song.title.toUpperCase()}<span class="meta">${song.bpm} BPM · ${song.genre.toUpperCase()}</span>` +
        `<span class="desc">${song.artist} — ${song.blurb}${hi > 0 ? ` · BEST ${formatScore(hi)}` : ''}</span>`,
    );
    s.add({ el: b, activate: () => onPick(song) });
    menu.appendChild(b);
  }
  const back = el('button', '', 'BACK');
  s.add({ el: back, activate: onBack });
  menu.appendChild(back);
  s.el.appendChild(menu);
  s.onBack = onBack;
  return s;
}

export function helpScreen(onBack: () => void): MenuScreen {
  const s = new MenuScreen();
  s.el.appendChild(el('h1', 'screen-title', 'HOW TO PLAY'));
  const rows = MOVES.map((m) => `<tr><td>${m.hint}</td><td>${m.name}</td><td>${m.score} pts${m.link ? ' · link move' : ''}</td></tr>`).join('');
  const named = NAMED_COMBOS.map((n) => `<tr><td>${n.name}</td><td colspan="2">${n.sequence.map((id) => MOVES.find((m) => m.id === id)?.name).join(' → ')} (+${n.bonus})</td></tr>`).join('');
  s.el.append(
    el(
      'div',
      'panel',
      `<h3>THE PIT</h3>WASD move · Mouse look (click to lock) · Shift sprint · Q/E/R/F + direction = moves · Space jump, then R/F in the air.<br>
       Gamepad: left stick move · right stick look · RT sprint · X / Y / B / RB moves · A jump.<br>
       <h3>TIMING</h3>Press on the pulse (the ticks meet in the diamond). PERFECT / GOOD / OKAY score more – pressing against the beat is a MISS and you <b>bail</b>: the whole combo is gone.
       Breakdowns and heavy parts switch to a half-time pulse and double the value of kicks, floorwork and air moves.
       <h3>COMBOS</h3>Chain moves without pausing – each one grows the multiplier. A short pause banks the combo (pool × multiplier).
       Repeating the same move pays less and less, mixing move styles pays a bonus. Fill the HYPE meter for a PIT FRENZY (x2).
       Big moves need space: the ring under you turns red when the crowd is too close.`,
    ),
    el('div', 'panel', `<table>${rows}</table>`),
    el('div', 'panel', `<h3>SIGNATURE COMBOS</h3><table>${named}</table>`),
  );
  const back = el('button', '', 'BACK');
  s.add({ el: back, activate: onBack });
  s.el.appendChild(back);
  s.onBack = onBack;
  return s;
}

export function settingsScreen(settings: Settings, onChange: (patch: Partial<Settings>) => void, onBack: () => void): MenuScreen {
  const s = new MenuScreen();
  s.el.appendChild(el('h1', 'screen-title', 'SETTINGS'));
  const menu = el('div', 'menu');
  const current = { ...settings };

  const slider = (label: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'mouseSensitivity' | 'audioOffsetMs', min: number, max: number, step: number, fmt: (v: number) => string) => {
    const b = el('button');
    const render = () => (b.innerHTML = `${label}<span class="slider-value">◀ ${fmt(current[key])} ▶</span>`);
    render();
    s.add({
      el: b,
      adjust: (dir) => {
        current[key] = Math.round(clamp(current[key] + dir * step, min, max) * 1000) / 1000;
        render();
        onChange({ [key]: current[key] });
      },
      activate: () => {
        current[key] = current[key] + step > max ? min : Math.round((current[key] + step) * 1000) / 1000;
        render();
        onChange({ [key]: current[key] });
      },
    });
    menu.appendChild(b);
  };
  const toggle = (label: string, key: 'invertY' | 'showMoveList') => {
    const b = el('button');
    const render = () => (b.innerHTML = `${label}<span class="slider-value">${current[key] ? 'ON' : 'OFF'}</span>`);
    render();
    const flip = () => {
      current[key] = !current[key];
      render();
      onChange({ [key]: current[key] });
    };
    s.add({ el: b, activate: flip, adjust: flip });
    menu.appendChild(b);
  };
  const graphics = el('button');
  const renderGraphics = () => (graphics.innerHTML = `GRAPHICS<span class="slider-value">◀ ${GRAPHICS_PRESETS[current.graphics].label} ▶</span>`);
  renderGraphics();
  const cycleGraphics = (dir: -1 | 1) => {
    const i = GRAPHICS_ORDER.indexOf(current.graphics);
    current.graphics = GRAPHICS_ORDER[(i + dir + GRAPHICS_ORDER.length) % GRAPHICS_ORDER.length]!;
    renderGraphics();
    onChange({ graphics: current.graphics });
  };
  s.add({ el: graphics, adjust: cycleGraphics, activate: () => cycleGraphics(1) });
  menu.appendChild(graphics);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  slider('MASTER VOLUME', 'masterVolume', 0, 1, 0.1, pct);
  slider('MUSIC', 'musicVolume', 0, 1, 0.1, pct);
  slider('SOUND FX', 'sfxVolume', 0, 1, 0.1, pct);
  slider('AUDIO OFFSET', 'audioOffsetMs', -200, 200, 10, (v) => `${v > 0 ? '+' : ''}${v} MS`);
  slider('MOUSE SPEED', 'mouseSensitivity', 0.2, 3, 0.2, (v) => `${v.toFixed(1)}x`);
  toggle('INVERT Y', 'invertY');
  toggle('SHOW MOVE LIST', 'showMoveList');
  const back = el('button', '', 'BACK');
  s.add({ el: back, activate: onBack });
  menu.appendChild(back);
  s.el.append(menu, el('div', 'panel', 'AUDIO OFFSET: if your PERFECTs feel early or late, nudge this. Positive = the game expects your press later.'));
  s.onBack = onBack;
  return s;
}

export function pauseScreen(onResume: () => void, onRestart: () => void, onSettings: () => void, onQuit: () => void): MenuScreen {
  const s = new MenuScreen('transparent');
  s.el.appendChild(el('h1', 'screen-title', 'PAUSED'));
  const menu = el('div', 'menu');
  for (const [label, fn] of [
    ['RESUME', onResume],
    ['RESTART SONG', onRestart],
    ['SETTINGS', onSettings],
    ['QUIT TO MENU', onQuit],
  ] as const) {
    const b = el('button', '', label);
    s.add({ el: b, activate: fn });
    menu.appendChild(b);
  }
  s.el.appendChild(menu);
  s.onBack = onResume;
  s.onPause = onResume;
  return s;
}

export interface ResultData {
  song: SongDefinition;
  score: number;
  stats: SessionStats;
  newHighscore: boolean;
  previousBest: number;
}

/** Letter grade from timing accuracy and bails. */
export function grade(stats: SessionStats): string {
  const judged = stats.moves + stats.bails;
  if (judged === 0) return 'D';
  const perfectRate = stats.ratings.perfect / judged;
  const bailRate = stats.bails / judged;
  if (perfectRate >= 0.85 && stats.bails === 0) return 'S';
  if (perfectRate >= 0.65 && bailRate < 0.03) return 'A';
  if (perfectRate >= 0.45 && bailRate < 0.08) return 'B';
  if (perfectRate >= 0.25) return 'C';
  return 'D';
}

export function resultsScreen(r: ResultData, onRetry: () => void, onSongs: () => void, onMenu: () => void): MenuScreen {
  const s = new MenuScreen();
  const st = r.stats;
  s.el.appendChild(el('h1', 'screen-title', `${r.song.title.toUpperCase()} — SET OVER`));
  s.el.appendChild(el('div', 'grade', grade(st)));
  if (r.newHighscore) s.el.appendChild(el('div', 'new-hi', 'NEW HIGHSCORE!'));
  const judged = st.moves + st.bails;
  const acc = judged ? Math.round(((st.ratings.perfect + st.ratings.good * 0.7 + st.ratings.okay * 0.4) / judged) * 100) : 0;
  const rows: [string, string][] = [
    ['FINAL SCORE', formatScore(r.score)],
    ['PREVIOUS BEST', formatScore(r.previousBest)],
    ['BEST COMBO', formatScore(st.bestCombo)],
    ['LONGEST COMBO', `${st.longestCombo} MOVES`],
    ['MOVES', `${st.moves}`],
    ['PERFECT / GOOD / OKAY', `${st.ratings.perfect} / ${st.ratings.good} / ${st.ratings.okay}`],
    ['BAILS', `${st.bails}`],
    ['DROP HITS', `${st.dropHits}`],
    ['ACCURACY', `${acc}%`],
  ];
  const grid = el('div', 'results');
  for (const [k, v] of rows) grid.append(el('div', '', k), el('div', 'v', v));
  s.el.appendChild(grid);
  const menu = el('div', 'menu');
  for (const [label, fn] of [
    ['PLAY AGAIN', onRetry],
    ['OTHER SONG', onSongs],
    ['MAIN MENU', onMenu],
  ] as const) {
    const b = el('button', '', label);
    s.add({ el: b, activate: fn });
    menu.appendChild(b);
  }
  s.el.appendChild(menu);
  s.onBack = onMenu;
  return s;
}
