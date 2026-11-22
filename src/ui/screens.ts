import { clamp, formatScore } from '../core/math';
import { MOVES } from '../data/moves';
import type { SongDefinition } from '../audio/songTypes';
import type { ComboStats } from '../gameplay/ComboManager';
import { GRAPHICS_ORDER, GRAPHICS_PRESETS } from '../data/graphics';
import type { Settings } from '../save/SaveSystem';
import { el, MenuScreen } from './Menu';

export function titleScreen(onStart: () => void): MenuScreen {
  const s = new MenuScreen('title');
  s.el.append(
    el('div', 'logo', 'MOSH<br>PIT'),
    el('div', 'subtitle', 'HARDCORE ARCADE SIMULATOR'),
    el('div', 'blink', 'PRESS ANY KEY'),
    el('div', 'footnote', 'Prototype 2.0 · placeholder test song synthesised in-game'),
  );
  s.onAny = () => onStart();
  s.el.addEventListener('click', () => onStart());
  return s;
}

/** Simple message page (loading, errors). With `onBack` it gets a BACK button. */
export function messageScreen(title: string, html: string, onBack?: () => void): MenuScreen {
  const s = new MenuScreen();
  s.el.append(el('h1', 'screen-title', title), el('div', 'panel', html));
  if (onBack) {
    const b = el('button', '', 'BACK');
    s.add({ el: b, activate: onBack });
    s.el.appendChild(b);
    s.onBack = onBack;
  }
  return s;
}

export function mainMenu(onPlay: () => void, onSettings: () => void, onHelp: () => void): MenuScreen {
  const s = new MenuScreen();
  s.el.append(el('div', 'logo', 'MOSH PIT'), el('div', 'subtitle', ' '));
  const menu = el('div', 'menu');
  const items: [string, () => void][] = [
    ['HIT THE PIT<span class="desc">One song. Chain moves, keep the combo alive, bank big.</span>', onPlay],
    ['HOW TO PLAY', onHelp],
    ['SETTINGS', onSettings],
  ];
  for (const [label, fn] of items) {
    const b = el('button', '', label);
    s.add({ el: b, activate: fn });
    menu.appendChild(b);
  }
  s.el.appendChild(menu);
  return s;
}

export function helpScreen(onBack: () => void): MenuScreen {
  const s = new MenuScreen();
  s.el.appendChild(el('h1', 'screen-title', 'HOW TO PLAY'));
  const rows = MOVES.map((m) => `<tr><td>${m.category.toUpperCase()}</td><td>${m.name}</td><td>${m.hint} · ${m.points} pts</td></tr>`).join('');
  s.el.append(
    el(
      'div',
      'panel',
      `<h3>CONTROLS</h3>Keyboard: WASD run · Shift sprint · <b>Q</b> footwork · <b>E</b> arms · <b>R</b> kick · <b>Space</b> acro · mouse look (click to lock) · H move list.<br>
       Gamepad: left stick run · RT sprint · <b>X</b> footwork · <b>Y</b> arms · <b>B</b> kick · <b>A</b> acro · right stick look.<br>
       <h3>MOVES</h3>One button per style – direction and speed pick the move: kick with a run-up becomes a Tornado Kick,
       acro to the side is a Cartwheel. Arms can be thrown on top of running and 2-stepping (LAYERED bonus).
       <h3>COMBOS</h3>Every move adds points and +1 multiplier. The bar under the combo is your timer: each move refills it,
       when it runs out the combo is banked (points × multiplier × variety). Chain moves right as the previous one finishes
       (CLEAN), carry speed into big moves (MOMENTUM), land clean. Repeating the same move pays less and less.
       <h3>MUSIC</h3>You can move any time. Starting a move on the beat, during breakdowns (x1.5) and heavy parts (x2) and right on
       the DROP pays extra.
       <h3>RISK</h3>Big moves need room – the ring under you turns red near the crowd. Kick into a packed crowd and you bail:
       the running combo is lost.`,
    ),
    el('div', 'panel', `<table>${rows}</table>`),
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
  s.el.append(menu, el('div', 'panel', 'AUDIO OFFSET: if ON BEAT bonuses feel early or late, nudge this. Positive = the game expects your press later.'));
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
  stats: ComboStats;
  newHighscore: boolean;
  previousBest: number;
}

/** Letter grade from score, longest combo and bails. */
export function grade(score: number, stats: ComboStats): string {
  if (stats.moves === 0) return 'D';
  if (score >= 250000 && stats.bails === 0) return 'S';
  if (score >= 120000 && stats.bails <= 1) return 'A';
  if (score >= 50000) return 'B';
  if (score >= 15000) return 'C';
  return 'D';
}

export function resultsScreen(r: ResultData, onRetry: () => void, onMenu: () => void): MenuScreen {
  const s = new MenuScreen();
  const st = r.stats;
  s.el.appendChild(el('h1', 'screen-title', `${r.song.title.toUpperCase()} — SET OVER`));
  s.el.appendChild(el('div', 'grade', grade(r.score, st)));
  if (r.newHighscore) s.el.appendChild(el('div', 'new-hi', 'NEW HIGHSCORE!'));
  const rows: [string, string][] = [
    ['FINAL SCORE', formatScore(r.score)],
    ['PREVIOUS BEST', formatScore(r.previousBest)],
    ['BEST COMBO', formatScore(st.bestCombo)],
    ['LONGEST COMBO', `${st.longestCombo} MOVES`],
    ['COMBOS BANKED', `${st.combos}`],
    ['MOVES', `${st.moves}`],
    ['CLEAN LINKS', `${st.cleanLinks}`],
    ['BAILS', `${st.bails}`],
  ];
  const grid = el('div', 'results');
  for (const [k, v] of rows) grid.append(el('div', '', k), el('div', 'v', v));
  s.el.appendChild(grid);
  const menu = el('div', 'menu');
  for (const [label, fn] of [
    ['PLAY AGAIN', onRetry],
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
