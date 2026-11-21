import { formatScore, formatTime } from '../core/math';
import { MOVES } from '../data/moves';
import type { GameModeDefinition } from '../gameplay/modes';
import type { PitSession } from '../gameplay/PitSession';
import type { Rating } from '../gameplay/timing';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Timing is a bonus (D-026): off-beat moves show no rating at all. */
const RATING_TEXT: Record<Rating, string> = { perfect: 'ON BEAT!', good: 'GOOD TIMING', okay: 'OKAY', miss: '' };
const TICKS = 10;

/** Gamepad labels for the move list (keyboard hints come from the move data). */
const PAD_HINTS: Record<string, string> = {
  two_step: 'X',
  crowd_push: '↑ + X',
  forward_arms: 'Y',
  side_arms: '←/→ + Y',
  pick_up_change: '↓ + Y',
  spinkick: 'B',
  floorwork: 'RB',
  cartwheel: '←/→ + RB',
  hop: 'A',
  tornado_kick: 'A → B',
  butterfly_kick: 'A → RB',
};

/**
 * Arcade HUD as a DOM overlay. Writes to the DOM only when a value changed.
 * Subscribes to session events for one-shot popups.
 */
export class Hud {
  private readonly root = $('hud');
  private readonly score = $('hud-score');
  private readonly hi = $('hud-hi');
  private readonly hype = $('hud-hype');
  private readonly song = $('hud-song');
  private readonly band = $('hud-band');
  private readonly time = $('hud-time');
  private readonly section = $('hud-section');
  private readonly banner = $('hud-banner');
  private readonly rating = $('hud-rating');
  private readonly popups = $('hud-popups');
  private readonly comboMoves = $('hud-combo-moves');
  private readonly comboScore = $('hud-combo-score');
  private readonly chain = $('hud-chain').firstElementChild as HTMLElement;
  private readonly beatBar = $('beat-bar');
  private readonly target = this.beatBar.querySelector('.beat-target') as HTMLElement;
  private readonly hint = $('hud-hint');
  private readonly moveList = $('hud-movelist');
  private readonly ticks: HTMLElement[] = [];
  private readonly cache = new Map<HTMLElement, string>();
  private unsub: Array<() => void> = [];
  private targetTimer = 0;
  private hintTimer = 0;
  private moveListDevice: 'keyboard' | 'gamepad' | null = null;

  constructor() {
    for (let i = 0; i < TICKS; i++) {
      const t = document.createElement('div');
      t.className = 'beat-tick';
      this.beatBar.appendChild(t);
      this.ticks.push(t);
    }
  }

  private set(el: HTMLElement, text: string): void {
    if (this.cache.get(el) === text) return;
    this.cache.set(el, text);
    el.textContent = text;
  }

  private setHtml(el: HTMLElement, html: string): void {
    if (this.cache.get(el) === html) return;
    this.cache.set(el, html);
    el.innerHTML = html;
  }

  private retrigger(el: HTMLElement, cls: string): void {
    el.classList.remove('show');
    void el.offsetWidth; // restart CSS animation
    el.classList.add('show');
    if (cls) el.dataset.kind = cls;
  }

  private popup(text: string, cls = ''): void {
    const d = document.createElement('div');
    d.className = `popup ${cls}`;
    d.textContent = text;
    this.popups.appendChild(d);
    while (this.popups.childElementCount > 4) this.popups.firstElementChild?.remove();
    window.setTimeout(() => d.remove(), 1500);
  }

  showBanner(text: string): void {
    this.banner.textContent = text;
    this.retrigger(this.banner, '');
  }

  showHint(text: string, seconds = 3): void {
    this.set(this.hint, text);
    this.hintTimer = seconds;
  }

  attach(session: PitSession, mode: GameModeDefinition, highscore: number): void {
    this.detach();
    this.root.classList.remove('hidden');
    this.cache.clear();
    this.set(this.song, session.song.title.toUpperCase());
    this.set(this.band, `${session.song.artist.toUpperCase()} · ${session.venue.name.toUpperCase()}`);
    this.set(this.hi, `HI ${formatScore(highscore)}`);
    this.time.classList.toggle('hidden', !mode.showTimer);
    this.popups.innerHTML = '';
    const ev = session.events;
    this.unsub.push(
      ev.on('rating', (e) => {
        if (e.rating === 'miss') return;
        this.rating.className = e.rating;
        this.rating.textContent = RATING_TEXT[e.rating];
        void this.rating.offsetWidth;
        this.rating.classList.add('show');
        this.target.className = `beat-target hit-${e.rating}`;
        this.targetTimer = 0.18;
      }),
      ev.on('bonus', (e) => this.popup(`${e.name} +${formatScore(e.value)}`)),
      ev.on('bank', (e) => {
        this.popup(`+${formatScore(e.result.total)}`, 'bank');
        if (e.result.bonuses.length) this.popup(e.result.bonuses.join(' · '));
      }),
      ev.on('bail', (e) => this.popup(e.lost > 0 ? `CRASHED INTO THE CROWD! -${formatScore(e.lost)}` : 'CRASHED!', 'bail')),
      ev.on('section', (e) => {
        const t = e.section.type;
        if (t === 'breakdown' || t === 'heavy') this.showBanner(`${e.section.label}!`);
        else if (t === 'chorus') this.showBanner('CHORUS');
      }),
      ev.on('beatdrop', () => this.popup('DROP! HIT IT PERFECT', 'bank')),
      ev.on('frenzy', (e) => {
        if (e.active) this.showBanner('PIT FRENZY! x2');
      }),
      ev.on('land', (e) => {
        if (e.quality === 'sketchy') this.popup('SKETCHY LANDING');
      }),
      ev.on('moveScored', (e) => {
        const named = e.scored.namedCombos[0];
        if (!named && e.scored.repetitionFactor < 0.5) this.showHint('REPEATING THE SAME MOVE PAYS NOTHING – MIX IT UP!', 2);
      }),
    );
  }

  detach(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
  }

  hide(): void {
    this.detach();
    this.root.classList.add('hidden');
  }

  update(dt: number, s: PitSession, device: 'keyboard' | 'gamepad', showMoveList: boolean): void {
    const t = Math.max(0, s.songTime);
    this.set(this.score, formatScore(s.combo.score));
    this.hype.style.width = `${Math.round(s.hype.value * 100)}%`;
    this.hype.classList.toggle('frenzy', s.hype.frenzy);
    this.set(this.time, formatTime(s.timeline.duration - t));
    const section = s.section;
    this.set(this.section, section.label);
    this.section.className = `tag ${section.type}`;
    this.beatBar.className = section.type;

    // Combo.
    const c = s.combo.current;
    if (c) {
      const names = c.entries.map((e) => e.name.toUpperCase());
      const shown = names.length > 5 ? ['…', ...names.slice(-5)] : names;
      this.set(this.comboMoves, shown.join(' + '));
      const mult = Math.max(1, c.multiplier);
      this.set(this.comboScore, `${formatScore(c.pool)} × ${Number.isInteger(mult) ? mult : mult.toFixed(1)}`);
    } else {
      this.set(this.comboMoves, '');
      this.set(this.comboScore, '');
    }
    const pulse = s.timeline.pulseAt(t);
    const chain = s.combo.chainRemaining(t, s.moves.busy);
    this.chain.style.width = `${Math.round(chain * 100)}%`;

    // Beat bar: ticks slide in from both sides and meet the target on each pulse.
    const half = 210;
    const span = pulse.interval * 2.5;
    for (let i = 0; i < TICKS; i++) {
      const k = Math.floor(i / 2);
      const side = i % 2 === 0 ? -1 : 1;
      const time = pulse.nextTime + (k - 1) * pulse.interval;
      const d = (time - t) / span;
      const el = this.ticks[i]!;
      if (d < -0.05 || d > 1) {
        el.style.opacity = '0';
        continue;
      }
      el.style.opacity = d < 0 ? '0.3' : '1';
      el.style.transform = `translateX(${(side * d * half).toFixed(1)}px)`;
    }
    const near = Math.abs(pulse.offset) / pulse.interval;
    this.target.style.transform = `rotate(45deg) scale(${(1 + Math.max(0, 0.25 - near) * 1.6).toFixed(3)})`;
    if (this.targetTimer > 0 && (this.targetTimer -= dt) <= 0) this.target.className = 'beat-target';

    if (this.hintTimer > 0 && (this.hintTimer -= dt) <= 0) this.set(this.hint, '');

    // Move list.
    this.moveList.classList.toggle('hidden', !showMoveList);
    if (showMoveList && device !== this.moveListDevice) {
      this.moveListDevice = device;
      const rows = MOVES.map((m) => `<b>${device === 'gamepad' ? (PAD_HINTS[m.id] ?? m.hint) : m.hint}</b>${m.name}`);
      const extra = device === 'gamepad' ? '<b>RT</b>Sprint (run-up bonus)' : '<b>Shift</b>Sprint (run-up bonus)';
      this.setHtml(this.moveList, [...rows, extra, `<b>${device === 'gamepad' ? 'Back' : 'H'}</b>Hide list`].join('<br>'));
    }
  }
}
