import type { MoveButton } from '../gameplay/moveTypes';

/**
 * Abstract actions. Gameplay never sees keys or gamepad buttons, only these.
 * To rebind or add a device, change the tables below.
 */
export type ButtonAction = MoveButton | 'pause' | 'confirm' | 'back' | 'up' | 'down' | 'left' | 'right' | 'help';

export const KEYBOARD_BUTTONS: Record<string, ButtonAction[]> = {
  KeyQ: ['step'],
  KeyE: ['arms'],
  KeyR: ['kick'],
  KeyF: ['floor'],
  Space: ['jump', 'confirm'],
  Escape: ['pause', 'back'],
  KeyP: ['pause'],
  Enter: ['confirm'],
  NumpadEnter: ['confirm'],
  Backspace: ['back'],
  ArrowUp: ['up'],
  ArrowDown: ['down'],
  ArrowLeft: ['left'],
  ArrowRight: ['right'],
  KeyW: ['up'],
  KeyS: ['down'],
  KeyA: ['left'],
  KeyD: ['right'],
  KeyH: ['help'],
};

/** Keys that move the character (held). */
export const KEYBOARD_AXES = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
};

/** Standard Gamepad mapping (Xbox labels / PlayStation in comments). */
export const GAMEPAD_BUTTONS: Record<number, ButtonAction[]> = {
  0: ['jump', 'confirm'], // A / Cross
  1: ['kick', 'back'], // B / Circle
  2: ['step'], // X / Square
  3: ['arms'], // Y / Triangle
  5: ['floor'], // RB / R1
  9: ['pause'], // Start / Options
  8: ['help'], // Back / Share
  12: ['up'],
  13: ['down'],
  14: ['left'],
  15: ['right'],
};
export const GAMEPAD_SPRINT_BUTTONS = [7, 6, 4]; // RT, LT, LB
export const GAMEPAD_DEADZONE = 0.18;
