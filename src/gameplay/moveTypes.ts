/** Move definitions are pure data. See docs/COMBO_SYSTEM.md. */

export type MoveCategory = 'step' | 'arms' | 'kick' | 'floor' | 'air';

/** Abstract move buttons (keyboard Q/E/R/F/Space, gamepad X/Y/B/RB/A). */
export type MoveButton = 'step' | 'arms' | 'kick' | 'floor' | 'jump';

/** Stick direction relative to the camera at the moment of the press. */
export type InputDirection = 'neutral' | 'forward' | 'back' | 'side';

export interface MoveInput {
  button: MoveButton;
  /** Which stick directions trigger this move. Empty/undefined = any direction. */
  directions?: InputDirection[];
  /** Only while airborne (converts a hop into this move). */
  air?: boolean;
}

export interface MoveDefinition {
  id: string;
  name: string;
  category: MoveCategory;
  input: MoveInput;
  /**
   * Natural length in seconds. The real length is quantised to a whole
   * number of timing pulses so every move ends on the grid.
   */
  durationSec: number;
  /** Base points before any multiplier. */
  score: number;
  /** How much the combo multiplier grows (1 normal, 0.5 link moves). */
  multiplierGain: number;
  /** Point factor for the 1st, 2nd, 3rd... use inside one combo. Last value repeats. */
  repetition: number[];
  /** Normalised progress from which the next move may cancel this one. */
  cancelAt: number;
  /** 0..1 how much stick steering applies during the move. */
  moveControl: number;
  /** Root motion in metres over the whole move (forward/side relative to facing). */
  rootMotion?: { forward: number; side: number };
  /** Radius (m) the move needs. Crowd inside gets knocked away; too crowded = cramped. */
  space: number;
  /** Advanced moves profit from breakdown / heavy-part bonuses. */
  advanced: boolean;
  /** Hype difficulty factor. */
  difficulty: number;
  /** Jump height in metres for air moves / hops. */
  jumpHeight?: number;
  /** Side moves face the camera direction and move along the stick. */
  faceCamera?: boolean;
  /** Animation clip id (see src/animation/clips.ts). */
  clip: string;
  /** Mirror the clip on every second consecutive use (alternating steps). */
  alternate?: boolean;
  /** Short input hint for the move list UI. */
  hint: string;
  /** Link moves (2-step, hop) keep combos alive but score little. */
  link?: boolean;
}
