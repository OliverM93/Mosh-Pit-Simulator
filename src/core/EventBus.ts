/** Minimal typed event bus. Gameplay emits, UI/audio/render subscribe. */
export class EventBus<Events extends { [K in keyof Events]: unknown }> {
  private listeners: { [K in keyof Events]?: Array<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(type: K, fn: (payload: Events[K]) => void): () => void {
    const list = (this.listeners[type] ??= []);
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const list = this.listeners[type];
    if (!list) return;
    for (const fn of list.slice()) fn(payload);
  }

  clear(): void {
    this.listeners = {};
  }
}
