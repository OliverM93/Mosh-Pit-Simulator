import type { InputDirection, MoveButton, MoveDefinition } from './moveTypes';

/**
 * Maps (button, stick direction, airborne) to a move. The most specific
 * definition wins: an explicit direction match beats an "any direction" move.
 * Adding a move = adding data in src/data/moves.ts, no code change here.
 */
export class MoveResolver {
  private readonly moves: readonly MoveDefinition[];

  constructor(moves: readonly MoveDefinition[]) {
    this.moves = moves;
  }

  resolve(button: MoveButton, direction: InputDirection, airborne: boolean): MoveDefinition | null {
    let fallback: MoveDefinition | null = null;
    for (const m of this.moves) {
      if (m.input.button !== button) continue;
      if (!!m.input.air !== airborne) continue;
      const dirs = m.input.directions;
      if (!dirs || dirs.length === 0) {
        fallback ??= m;
        continue;
      }
      if (dirs.includes(direction)) return m;
    }
    return fallback;
  }

  /** Moves a hop can be converted into, keyed by button. */
  hasAirVariant(button: MoveButton): boolean {
    return this.moves.some((m) => m.input.air && m.input.button === button);
  }
}

/**
 * Classify a camera-relative stick vector. x = right, y = forward.
 * Returns the direction and the side sign (-1 left, +1 right).
 */
export function classifyDirection(x: number, y: number, deadzone = 0.45): { direction: InputDirection; side: number } {
  const mag = Math.hypot(x, y);
  if (mag < deadzone) return { direction: 'neutral', side: 0 };
  if (Math.abs(y) >= Math.abs(x)) return { direction: y > 0 ? 'forward' : 'back', side: 0 };
  return { direction: 'side', side: x > 0 ? 1 : -1 };
}
