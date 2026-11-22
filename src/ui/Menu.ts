import type { ButtonAction } from '../input/bindings';

export interface MenuItem {
  el: HTMLElement;
  activate?: () => void;
  /** Left/right on sliders and toggles. */
  adjust?: (dir: -1 | 1) => void;
  disabled?: boolean;
}

/**
 * A full-screen menu page: DOM element + focusable items. Navigation works
 * with keyboard, gamepad (via abstract actions) and mouse.
 */
export class MenuScreen {
  readonly el: HTMLElement;
  readonly items: MenuItem[] = [];
  focus = 0;
  onBack: (() => void) | null = null;
  /** Start/P on this screen (e.g. resume from the pause menu). */
  onPause: (() => void) | null = null;
  /** Called for any action when the screen has no items (e.g. title "press any key"). */
  onAny: ((action: ButtonAction) => void) | null = null;
  private onFocusChange: (() => void) | null = null;

  constructor(className = '') {
    this.el = document.createElement('div');
    this.el.className = `screen ${className}`;
  }

  add(item: MenuItem): MenuItem {
    const index = this.items.length;
    this.items.push(item);
    item.el.classList.add('menu-item');
    if (item.disabled) item.el.classList.add('disabled');
    item.el.addEventListener('mouseenter', () => this.setFocus(index));
    item.el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setFocus(index);
      if (!item.disabled) item.activate?.();
    });
    return item;
  }

  setFocus(i: number): void {
    if (this.items.length === 0) return;
    this.focus = (i + this.items.length) % this.items.length;
    this.items.forEach((it, k) => it.el.classList.toggle('focus', k === this.focus));
    this.onFocusChange?.();
  }

  onFocus(fn: () => void): void {
    this.onFocusChange = fn;
  }

  /** Returns true if the action was consumed. */
  handle(action: ButtonAction): boolean {
    // Keys map to several actions (Space = jump+confirm, Esc = pause+back):
    // menus only react to confirm/back/pause so nothing fires twice.
    if (action === 'pause') {
      this.onPause?.();
      return this.onPause !== null;
    }
    if (this.items.length === 0) {
      if (action === 'back' && this.onBack) {
        this.onBack();
        return true;
      }
      if (action !== 'acro') this.onAny?.(action);
      return true;
    }
    const item = this.items[this.focus];
    switch (action) {
      case 'up':
        this.setFocus(this.focus - 1);
        return true;
      case 'down':
        this.setFocus(this.focus + 1);
        return true;
      case 'left':
      case 'right':
        if (item?.adjust && !item.disabled) {
          item.adjust(action === 'left' ? -1 : 1);
          return true;
        }
        return false;
      case 'confirm':
        if (item && !item.disabled) item.activate?.();
        return true;
      case 'back':
        if (this.onBack) {
          this.onBack();
          return true;
        }
        return false;
      default:
        return false;
    }
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html) e.innerHTML = html;
  return e;
}

/** Simple screen stack inside #screens. */
export class UIManager {
  private readonly root: HTMLElement;
  current: MenuScreen | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(screen: MenuScreen): void {
    this.root.innerHTML = '';
    this.root.appendChild(screen.el);
    this.current = screen;
    screen.setFocus(screen.focus);
  }

  hide(): void {
    this.root.innerHTML = '';
    this.current = null;
  }

  handle(action: ButtonAction): boolean {
    return this.current?.handle(action) ?? false;
  }
}
