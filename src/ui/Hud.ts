import { formatScore, formatTime } from '../core/math';
import { MOVES } from '../data/moves';
import type { PitSession } from '../gameplay/PitSession';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Button labels per device for the move list. */
const BUTTONS = {
  keyboard: { footwork: 'Q', arms: 'E', kick: 'R', acro: 'Space', sprint: 'Shift', list: 'H' },
  gamepad: { footwork: 'X', arms: 'Y', kick: 'B', acro: 'A', sprint: 'RT', list: 'Back' },
};

/**
 * Arcade HUD (DOM overlay): score, running combo (moves + base × multiplier),
 * combo timer bar, last-move callout with its bonus tags, music banners.
 * Writes to the DOM only when a value changed.
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
  private readonly trick = $('hud-rating');
  private readonly popups = $('hud-popups');
  private readonly comboMoves = $('hud-combo-moves');
  private readonly comboScore = $('hud-combo-score');
  private readonly timer = $('hud-chain').firstElementChild as HTMLElement;
  private readonly hint = $('hud-hint');
  private readonly moveList = $('hud-movelist');
  private readonly cache = new Map<HTMLElement, string>();
  private unsub: Array<() => void> = [];
  private hintTimer = 0;
  private moveListDevice: 'keyboard' | 'gamepad' | null = null;

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

  private retrigger(el: HTMLElement): void {
    el.classList.remove('show');
    void el.offsetWidth; // restart CSS animation
    el.classList.add('show');
  }

  private popup(text: string, cls = ''): void {
    const d = document.createElement('div');
    d.className = `popup ${cls}`;
    d.textContent = text;
    this.popups.appendChild(d);
    while (this.popups.childElementCount > 4) this.popups.firstElementChild?.remove();
    window.setTimeout(() => d.remove(), 1600);
  }

  showBanner(text: string): void {
    this.banner.textContent = text;
    this.retrigger(this.banner);
  }

  showHint(text: string, seconds = 3): void {
    this.set(this.hint, text);
    this.hintTimer = seconds;
  }

  attach(session: PitSession, highscore: number): void {
    this.detach();
    this.root.classList.remove('hidden');
    this.cache.clear();
    this.set(this.song, session.song.title.toUpperCase());
    this.set(this.band, `${session.song.artist.toUpperCase()} · ${session.venue.name.toUpperCase()}`);
    this.set(this.hi, `HI ${formatScore(highscore)}`);
    this.popups.innerHTML = '';
    const ev = session.events;
    this.unsub.push(
      ev.on('scored', (e) => {
        const tags = e.entry.tags.filter((t) => !t.startsWith('REPEAT'));
        this.trick.className = e.entry.tags.includes('SKETCHY') ? 'sketchy' : '';
        this.trick.innerHTML = `${e.entry.name.toUpperCase()} +${formatScore(e.entry.points)}${tags.length ? `<small>${tags.join(' · ')}</small>` : ''}`;
        this.retrigger(this.trick);
        if (e.entry.tags.some((t) => t.startsWith('REPEAT')) && session.combo.repetitionOf(e.move.def.id) <= 0.25) {
          this.showHint('SAME MOVE AGAIN PAYS LESS – MIX IT UP!', 2);
        }
      }),
      ev.on('bonus', (e) => this.popup(`${e.name} +${formatScore(e.value)}`)),
      ev.on('bank', (e) => {
        const r = e.result;
        const variety = r.variety > 1 ? `  VARIETY x${r.variety}` : '';
        this.popup(`+${formatScore(r.total)}${variety}`, 'bank');
      }),
      ev.on('bail', (e) => this.popup(e.lost > 0 ? `BAILED! COMBO LOST (${formatScore(e.lost)})` : 'BAILED!', 'bail')),
      ev.on('section', (e) => {
        const t = e.section.type;
        if (t === 'breakdown' || t === 'heavy') this.showBanner(`${e.section.label}! POINTS x${t === 'heavy' ? 2 : 1.5}`);
      }),
      ev.on('beatdrop', () => this.popup('DROP!', 'bank')),
      ev.on('frenzy', (e) => {
        if (e.active) this.showBanner('PIT FRENZY! x1.5');
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

    // Running combo.
    const c = s.combo;
    if (c.active) {
      const names = c.entries.map((e) => e.name.toUpperCase());
      const shown = names.length > 4 ? ['…', ...names.slice(-4)] : names;
      this.set(this.comboMoves, shown.join(' + '));
      this.set(this.comboScore, `${formatScore(c.base)} × ${Math.max(1, c.multiplier)}`);
    } else {
      this.set(this.comboMoves, '');
      this.set(this.comboScore, '');
    }
    this.timer.style.width = `${Math.round(c.timerShare * 100)}%`;
    this.timer.style.background = c.timerShare < 0.3 ? 'var(--red)' : '';

    if (this.hintTimer > 0 && (this.hintTimer -= dt) <= 0) this.set(this.hint, '');

    // Move list.
    this.moveList.classList.toggle('hidden', !showMoveList);
    if (showMoveList && device !== this.moveListDevice) {
      this.moveListDevice = device;
      const b = BUTTONS[device];
      const rows = MOVES.map((m) => `<b>${b[m.category]}</b>${m.name} <i>${m.hint}</i>`);
      const extra = [`<b>${b.sprint}</b>Sprint (run-up → Tornado Kick, momentum bonus)`, `<b>${b.list}</b>Hide list`];
      this.setHtml(this.moveList, [...rows, ...extra].join('<br>'));
    }
  }
}
