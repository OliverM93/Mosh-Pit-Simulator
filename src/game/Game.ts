import { AudioEngine } from '../audio/AudioEngine';
import { Sfx } from '../audio/Sfx';
import { SongClock } from '../audio/SongClock';
import { createSongPlayback, type SongPlayback } from '../audio/SongPlayer';
import type { SongDefinition } from '../audio/songTypes';
import { SONGS } from '../data/songs';
import { setMerch } from '../render/characterTextures';
import { UserContentLoader } from './userContent';
import { VENUES } from '../data/venues';
import type { VenueDefinition } from '../data/venueTypes';
import { getMode, type GameModeDefinition } from '../gameplay/modes';
import { classifyDirection } from '../gameplay/MoveResolver';
import type { MoveRequest } from '../gameplay/MoveSystem';
import { PitSession, type FrameInput } from '../gameplay/PitSession';
import type { ButtonAction } from '../input/bindings';
import { InputManager, type ButtonEvent } from '../input/InputManager';
import { Renderer } from '../render/Renderer';
import { SceneView } from '../render/SceneView';
import { SaveSystem, type Settings } from '../save/SaveSystem';
import { Hud } from '../ui/Hud';
import { UIManager, type MenuScreen } from '../ui/Menu';
import { helpScreen, mainMenu, messageScreen, pauseScreen, resultsScreen, settingsScreen, songSelect, titleScreen } from '../ui/screens';

type State = 'title' | 'menu' | 'loading' | 'playing' | 'paused' | 'ending' | 'results';

const MOVE_BUTTONS = new Set<ButtonAction>(['step', 'arms', 'kick', 'floor', 'jump']);
const SUBSTEP = 1 / 60;

/**
 * Top-level orchestrator: state machine (title → menus → playing → results),
 * frame loop, and the glue between input, gameplay session, audio, render and UI.
 */
export class Game {
  private readonly renderer: Renderer;
  private readonly audio = new AudioEngine();
  private readonly sfx = new Sfx(this.audio);
  private readonly input: InputManager;
  private readonly save: SaveSystem;
  private readonly ui: UIManager;
  private readonly hud = new Hud();
  private state: State = 'title';
  private venue: VenueDefinition = VENUES[0]!;
  private mode: GameModeDefinition = getMode('arcade');
  private song: SongDefinition = SONGS[0]!;

  private session: PitSession | null = null;
  private view: SceneView | null = null;
  private playback: SongPlayback | null = null;
  private clock: SongClock | null = null;
  private attract: { session: PitSession; view: SceneView } | null = null;
  private lastFrame = performance.now();
  private lastSongTime = 0;
  private endTimer = 0;
  private pausedAt = 0;
  private sessionUnsub: Array<() => void> = [];
  private readonly userContent = new UserContentLoader();
  private userBuffer: AudioBuffer | undefined;
  private attractGraphics = '';
  /** Set when Free Pit restarts the song mid-frame: remaining sub-steps are skipped. */
  private restartedThisFrame = false;

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container);
    this.input = new InputManager(this.renderer.canvas);
    this.save = new SaveSystem(safeStorage());
    this.ui = new UIManager(document.getElementById('screens')!);
    this.applySettings(this.save.data.settings);

    this.renderer.canvas.addEventListener('click', () => {
      if (this.state === 'playing') this.input.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'playing') this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    window.addEventListener('resize', () => {
      this.view?.resize();
      this.attract?.view.resize();
    });

    this.ui.show(titleScreen(() => this.leaveTitle()));
    void this.loadUserContent();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------------ menus

  private leaveTitle(): void {
    if (this.state !== 'title') return;
    this.state = 'menu';
    void this.audio.unlock().then(() => this.sfx.uiSelect());
    this.showMainMenu();
  }

  private showScreen(screen: MenuScreen): void {
    screen.onFocus(() => this.sfx.uiMove());
    this.ui.show(screen);
  }

  private showMainMenu(): void {
    this.state = 'menu';
    this.showScreen(
      mainMenu(
        (m) => {
          this.mode = m;
          this.sfx.uiSelect();
          this.showSongSelect();
        },
        () => this.showSettings(() => this.showMainMenu()),
        () => this.showScreen(helpScreen(() => this.showMainMenu())),
      ),
    );
  }

  private showSongSelect(): void {
    this.state = 'menu';
    this.showScreen(
      songSelect(
        [...SONGS, ...this.userContent.listing()],
        this.mode,
        this.venue.name,
        (id) => this.save.getHighscore(id, this.venue.id)?.score ?? 0,
        (song) => {
          this.sfx.uiSelect();
          void this.startSong(song);
        },
        () => this.showMainMenu(),
      ),
    );
  }

  private showSettings(back: () => void): void {
    this.showScreen(
      settingsScreen(
        this.save.data.settings,
        (patch) => {
          this.save.updateSettings(patch);
          this.applySettings(this.save.data.settings);
          this.sfx.uiMove();
        },
        back,
      ),
    );
  }

  private applySettings(s: Settings): void {
    this.audio.setVolumes(s.masterVolume, s.musicVolume, s.sfxVolume);
    this.input.mouseSensitivity = 0.0026 * s.mouseSensitivity;
    this.input.invertY = s.invertY;
    this.renderer.setGraphics(s.graphics);
    // Geometry detail is baked into the scene: rebuild the menu backdrop if the preset changed.
    if (this.attract && this.attractGraphics !== s.graphics) {
      this.stopAttract();
      this.startAttract();
    }
    if (this.clock) this.clock.userOffset = s.audioOffsetMs / 1000;
  }

  // ------------------------------------------------------------------ attract mode

  /** Live, silent pit behind the menus. */
  private startAttract(): void {
    const session = new PitSession(SONGS[0]!, this.venue);
    const view = new SceneView(session, this.renderer, this.save.data.settings.graphics);
    this.attract = { session, view };
    this.attractGraphics = this.save.data.settings.graphics;
  }

  private stopAttract(): void {
    this.attract?.view.dispose();
    this.attract = null;
  }

  /** Own songs/logos from public/user-content (git-ignored). Merch logos must be set before the first scene. */
  private async loadUserContent(): Promise<void> {
    await this.userContent.load();
    if (this.userContent.merchLogos.length) setMerch(this.userContent.merchLogos);
    if (!this.attract && !this.session) this.startAttract();
  }

  // ------------------------------------------------------------------ session lifecycle

  private async startSong(song: SongDefinition): Promise<void> {
    if (this.state === 'loading') return; // ignore double activation
    this.state = 'loading';
    await this.audio.unlock();
    this.userBuffer = undefined;
    let detected = '';
    if (this.userContent.isUserSong(song.id)) {
      this.showScreen(messageScreen('LOADING', `${song.artist.toUpperCase()} – ${song.title.toUpperCase()}<br>decoding and detecting the beat…`));
      try {
        const prepared = await this.userContent.prepare(song.id, this.audio);
        song = prepared.song;
        this.userBuffer = prepared.buffer;
        if (prepared.estimate) detected = `AUTO-DETECTED ${prepared.estimate.bpm} BPM – OFFSET ${prepared.estimate.offsetSec.toFixed(2)} S`;
      } catch (err) {
        this.state = 'menu';
        this.showScreen(messageScreen('SONG ERROR', String(err instanceof Error ? err.message : err), () => this.showSongSelect()));
        return;
      }
    }
    this.song = song;
    this.endSession();
    this.stopAttract();
    this.ui.hide();

    const session = new PitSession(song, this.venue);
    this.session = session;
    this.view = new SceneView(session, this.renderer, this.save.data.settings.graphics);
    this.hud.attach(session, this.mode, this.save.getHighscore(song.id, this.venue.id)?.score ?? 0);
    this.wireSfx(session);

    const ctx = this.audio.ctx!;
    this.playback = createSongPlayback(this.audio, session.timeline, this.userBuffer);
    await this.playback.load();
    this.clock = new SongClock(ctx);
    this.clock.userOffset = this.save.data.settings.audioOffsetMs / 1000;
    const lead = this.leadIn(1.2);
    const start = ctx.currentTime + lead;
    this.playback.start(start);
    this.clock.start(start);
    this.lastSongTime = -lead;
    this.state = 'playing';
    this.input.requestPointerLock();
    if (detected) this.hud.showHint(detected, 5);
    else this.hud.showHint(this.input.lastDevice === 'gamepad' ? 'X = 2-STEP ON THE BEAT · BACK = MOVE LIST' : 'Q = 2-STEP ON THE BEAT · CLICK TO LOOK AROUND · H = MOVE LIST', 6);
  }

  /** Recorded songs may have music before beat 0 (offsetSec): start early enough to play it. */
  private leadIn(min: number): number {
    const a = this.song.audio;
    return a.kind === 'file' ? Math.max(min, a.offsetSec + 0.3) : min;
  }

  private wireSfx(s: PitSession): void {
    for (const u of this.sessionUnsub) u();
    const ev = s.events;
    this.sessionUnsub = [
      ev.on('rating', (e) => {
        if (e.rating !== 'miss') this.sfx.rating(e.rating);
      }),
      ev.on('moveStart', (e) => {
        const c = e.move.def.category;
        if (c === 'kick' || c === 'air' || c === 'floor') this.sfx.whoosh(e.move.def.difficulty * 0.6);
      }),
      ev.on('impact', (e) => {
        if (e.hits > 0) this.sfx.impact(0.5 + e.hits * 0.2);
      }),
      ev.on('bail', () => {
        this.sfx.bail();
        this.sfx.ooh();
      }),
      ev.on('bank', (e) => {
        this.sfx.bank(e.result.total);
        if (e.result.total > 15000) this.sfx.cheer(Math.min(1, e.result.total / 80000));
      }),
      ev.on('bonus', () => this.sfx.bonus()),
      ev.on('section', (e) => {
        if (e.section.type === 'breakdown' || e.section.type === 'heavy') this.sfx.cheer(0.7);
      }),
      ev.on('frenzy', (e) => {
        if (e.active) this.sfx.cheer(1);
      }),
      ev.on('songEnd', () => this.onSongEnd()),
    ];
  }

  private onSongEnd(): void {
    const s = this.session;
    if (!s) return;
    if (this.mode.loopSong) {
      // Free Pit: start the next loop right away, keep the score running.
      const ctx = this.audio.ctx!;
      const lead = this.leadIn(0.6);
      const start = ctx.currentTime + lead;
      s.restart(false);
      this.restartedThisFrame = true;
      this.playback?.start(start);
      this.clock?.start(start);
      this.lastSongTime = -lead;
      return;
    }
    this.state = 'ending';
    this.endTimer = 1.8;
  }

  private showResults(): void {
    const s = this.session!;
    this.playback?.stop();
    this.input.releasePointerLock();
    const stats = s.combo.stats;
    const prev = this.save.getHighscore(this.song.id, this.venue.id)?.score ?? 0;
    const isNew = this.mode.saveHighscore
      ? this.save.recordResult(this.song.id, this.venue.id, { score: s.combo.score, bestCombo: stats.bestCombo, perfects: stats.ratings.perfect }, stats.moves)
      : false;
    this.state = 'results';
    this.hud.hide();
    if (isNew || s.combo.score > 20000) this.sfx.cheer(1);
    this.showScreen(
      resultsScreen(
        { song: this.song, score: s.combo.score, stats, newHighscore: isNew, previousBest: prev },
        () => void this.startSong(this.song),
        () => this.quitToMenu(true),
        () => this.quitToMenu(false),
      ),
    );
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pausedAt = performance.now();
    void this.audio.suspend();
    this.input.releasePointerLock();
    this.showPauseMenu();
  }

  private showPauseMenu(): void {
    const screen = pauseScreen(
      () => this.resume(),
      () => void this.startSong(this.song),
      () => this.showSettings(() => this.showPauseMenu()),
      () => this.quitToMenu(false),
    );
    this.showScreen(screen);
  }

  private resume(): void {
    if (this.state !== 'paused' || performance.now() - this.pausedAt < 250) return;
    this.ui.hide();
    void this.audio.resume().then(() => this.clock?.resync());
    this.state = 'playing';
    this.input.requestPointerLock();
  }

  private endSession(): void {
    for (const u of this.sessionUnsub) u();
    this.sessionUnsub = [];
    this.playback?.stop();
    this.playback = null;
    this.view?.dispose();
    this.view = null;
    this.session = null;
    this.clock = null;
    this.hud.hide();
  }

  private quitToMenu(toSongs: boolean): void {
    void this.audio.resume();
    this.endSession();
    this.input.releasePointerLock();
    if (!this.attract) this.startAttract();
    if (toSongs) this.showSongSelect();
    else this.showMainMenu();
  }

  // ------------------------------------------------------------------ frame loop

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    const input = this.input.poll(dt);
    this.routeEvents(input.events);

    if ((this.state === 'playing' || this.state === 'ending') && this.session && this.view && this.clock) {
      this.updatePlaying(dt, now, input);
    } else if (this.state === 'paused' && this.view) {
      this.view.render(0);
    } else if (this.attract) {
      this.updateAttract(dt, now);
    } else if (this.view) {
      this.view.render(dt);
    }
  }

  private routeEvents(events: ButtonEvent[]): void {
    let consumed = -1;
    for (const e of events) {
      // One physical press can map to several actions – the first consumer wins.
      if (e.time === consumed) continue;
      if (this.state === 'playing') {
        if (e.action === 'pause') {
          consumed = e.time;
          this.pause();
        } else if (e.action === 'help') {
          this.save.updateSettings({ showMoveList: !this.save.data.settings.showMoveList });
        }
        continue;
      }
      if (this.state === 'title' || this.state === 'menu' || this.state === 'paused' || this.state === 'results') {
        if (this.ui.handle(e.action)) consumed = e.time;
      }
    }
  }

  private updatePlaying(dt: number, now: number, input: ReturnType<InputManager['poll']>): void {
    const s = this.session!;
    const view = this.view!;
    const clock = this.clock!;
    clock.sync(now);
    const songTime = clock.now(now);

    const cam = view.cameraCtl;
    if (this.state === 'playing') cam.look(input.lookX, input.lookY);
    const yaw = cam.yaw;
    // Camera-relative stick → world. Forward = (sin yaw, cos yaw), right = (-cos yaw, sin yaw).
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const wx = -Math.cos(yaw) * input.moveX + fx * input.moveY;
    const wz = Math.sin(yaw) * input.moveX + fz * input.moveY;

    const presses: MoveRequest[] = [];
    if (this.state === 'playing') {
      const dir = classifyDirection(input.moveX, input.moveY);
      for (const e of input.events) {
        if (!MOVE_BUTTONS.has(e.action)) continue;
        presses.push({ button: e.action as MoveRequest['button'], direction: dir.direction, side: dir.side, pressTime: clock.timeAt(e.time) });
      }
    }

    // Sub-step physics at 60 Hz; song time interpolated across sub-steps.
    const steps = Math.max(1, Math.ceil(dt / SUBSTEP - 1e-6));
    const from = Math.min(this.lastSongTime, songTime);
    for (let i = 1; i <= steps; i++) {
      const frameInput: FrameInput = {
        moveX: this.state === 'playing' ? wx : 0,
        moveZ: this.state === 'playing' ? wz : 0,
        sprint: input.sprint,
        cameraYaw: yaw,
        presses: i === 1 ? presses : [],
      };
      s.update(dt / steps, from + ((songTime - from) * i) / steps, frameInput);
      if (this.restartedThisFrame) break;
    }
    if (this.restartedThisFrame) this.restartedThisFrame = false;
    else this.lastSongTime = songTime;

    view.update(dt);
    this.hud.update(dt, s, this.input.lastDevice, this.save.data.settings.showMoveList);
    this.sfx.setAmbience(s.energy);
    view.render(dt);

    if (this.state === 'ending' && (this.endTimer -= dt) <= 0) this.showResults();
  }

  private updateAttract(dt: number, now: number): void {
    const { session, view } = this.attract!;
    const t = (now / 1000) % session.timeline.duration;
    if (t < session.songTime) session.restart(true);
    session.update(dt, t, { moveX: 0, moveZ: 0, sprint: false, cameraYaw: 0, presses: [] });
    view.cameraCtl.look(dt * 0.12, 0);
    view.update(dt);
    view.render(dt);
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
