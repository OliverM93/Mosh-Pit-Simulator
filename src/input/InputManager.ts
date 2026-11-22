import { GAMEPAD_BUTTONS, GAMEPAD_DEADZONE, GAMEPAD_SPRINT_BUTTONS, KEYBOARD_AXES, KEYBOARD_BUTTONS, type ButtonAction } from './bindings';

export interface ButtonEvent {
  action: ButtonAction;
  /** performance.now() timebase, as precise as the device allows. */
  time: number;
  device: 'keyboard' | 'gamepad';
}

export interface InputFrame {
  /** Left stick / WASD, x = right, y = forward, length ≤ 1. */
  moveX: number;
  moveY: number;
  /** Camera look delta in radians for this frame. */
  lookX: number;
  lookY: number;
  sprint: boolean;
  /** Actions whose button is held down right now (hold-to-repeat moves). */
  held: Set<ButtonAction>;
  events: ButtonEvent[];
}

/**
 * Merges keyboard/mouse and gamepads into abstract actions. Key presses are
 * timestamped with the DOM event time so beat judging is not quantised to
 * the frame rate.
 */
export class InputManager {
  mouseSensitivity = 0.0026;
  stickSensitivity = 3.2;
  invertY = false;
  private readonly down = new Set<string>();
  private events: ButtonEvent[] = [];
  private mouseDX = 0;
  private mouseDY = 0;
  private padPrev = new Map<number, boolean[]>();
  private readonly target: HTMLElement;
  lastDevice: 'keyboard' | 'gamepad' = 'keyboard';

  constructor(target: HTMLElement) {
    this.target = target;
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.target) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
  }

  private onKey(e: KeyboardEvent, isDown: boolean): void {
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Backspace') e.preventDefault();
    if (isDown) {
      this.lastDevice = 'keyboard';
      if (!e.repeat) {
        for (const action of KEYBOARD_BUTTONS[e.code] ?? []) this.events.push({ action, time: e.timeStamp || performance.now(), device: 'keyboard' });
      }
      this.down.add(e.code);
    } else {
      this.down.delete(e.code);
    }
  }

  requestPointerLock(): void {
    if (document.pointerLockElement !== this.target) this.target.requestPointerLock?.()?.catch?.(() => undefined);
  }

  releasePointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private any(codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  poll(dt: number): InputFrame {
    let mx = (this.any(KEYBOARD_AXES.right) ? 1 : 0) - (this.any(KEYBOARD_AXES.left) ? 1 : 0);
    let my = (this.any(KEYBOARD_AXES.up) ? 1 : 0) - (this.any(KEYBOARD_AXES.down) ? 1 : 0);
    let sprint = this.any(KEYBOARD_AXES.sprint);
    const held = new Set<ButtonAction>();
    for (const code of this.down) for (const action of KEYBOARD_BUTTONS[code] ?? []) held.add(action);
    let lx = this.mouseDX * this.mouseSensitivity;
    let ly = this.mouseDY * this.mouseSensitivity * (this.invertY ? -1 : 1);
    this.mouseDX = this.mouseDY = 0;

    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad || !pad.connected) continue;
      const prev = this.padPrev.get(pad.index) ?? [];
      const now = pad.buttons.map((b) => b.pressed);
      const time = pad.timestamp > 0 ? pad.timestamp : performance.now();
      now.forEach((pressed, i) => {
        if (pressed) for (const action of GAMEPAD_BUTTONS[i] ?? []) held.add(action);
        if (pressed && !prev[i]) {
          this.lastDevice = 'gamepad';
          for (const action of GAMEPAD_BUTTONS[i] ?? []) this.events.push({ action, time, device: 'gamepad' });
        }
      });
      this.padPrev.set(pad.index, now);
      const ax = (i: number) => {
        const v = pad.axes[i] ?? 0;
        return Math.abs(v) < GAMEPAD_DEADZONE ? 0 : (v - Math.sign(v) * GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE);
      };
      const sx = ax(0);
      const sy = -ax(1);
      if (sx !== 0 || sy !== 0) {
        mx += sx;
        my += sy;
        this.lastDevice = 'gamepad';
      }
      lx += ax(2) * this.stickSensitivity * dt;
      ly += ax(3) * this.stickSensitivity * dt * 0.6 * (this.invertY ? -1 : 1);
      if (GAMEPAD_SPRINT_BUTTONS.some((i) => (pad.buttons[i]?.value ?? 0) > 0.3)) sprint = true;
    }

    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const events = this.events.sort((a, b) => a.time - b.time);
    this.events = [];
    return { moveX: mx, moveY: my, lookX: lx, lookY: ly, sprint, held, events };
  }
}
