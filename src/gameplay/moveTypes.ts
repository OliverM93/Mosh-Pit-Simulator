/** Move definitions are pure data (src/data/moves.ts). See docs/PROTOTYPE_2.md and docs/COMBO_SYSTEM.md. */

/** One button per category (hybrid input: the button picks the category, the situation picks the move). */
export type MoveCategory = 'footwork' | 'arms' | 'kick' | 'acro';

/** `full` = whole body; `upper` = arms only, plays on top of locomotion or footwork. */
export type MoveLayer = 'full' | 'upper';

/** What the player is doing when a move button is pressed. */
export interface MoveSituation {
  /** Stick relative to the camera: x = right, y = forward, length 0..1. */
  stickX: number;
  stickY: number;
  /** Current ground speed (m/s). */
  speed: number;
}

export interface MoveDefinition {
  id: string;
  name: string;
  category: MoveCategory;
  layer: MoveLayer;
  /** Selection inside the category. The first matching definition (in list order) wins. */
  when?: {
    /** Stick held mostly sideways. */
    side?: boolean;
    /** Stick held mostly forward (towards the band). */
    forward?: boolean;
    /** Minimum ground speed (run-up). */
    minSpeed?: number;
  };
  /** Play length in seconds – owned by gameplay, the animation follows it. */
  duration: number;
  /** Animation clip and the part of it that is played (normalised, cuts slow wind-ups). */
  clip: string;
  clipRange: [number, number];
  /** Mirror on every second consecutive use (alternating sides). */
  alternate?: boolean;
  /** Holding the button keeps repeating the move (rhythmic footwork/arms)… */
  repeatOnHold?: boolean;
  /** …from this progress on: late enough that the full motion plays (defaults to `cancelFrom`). */
  repeatFrom?: number;
  /** Airborne between these normalised progress values (takeoff → flight → landing). */
  air?: { takeoff: number; land: number };
  /** From this progress on the move can be cancelled into the listed categories. */
  cancelFrom: number;
  cancelInto: MoveCategory[];
  /** Influence on the movement controller while the move runs. */
  movement: {
    /** 0..1 how much the stick can still turn the body. */
    steer: number;
    /** Max-speed factor. */
    speed: number;
    /** 0..1 how much momentum is kept without stick input. */
    carry: number;
    /** Sideways travel (m/s) in the stick direction at the start (cartwheel). */
    sideImpulse?: number;
  };
  /** Base points before multipliers. */
  points: number;
  /** Feeds the crowd energy. */
  difficulty: number;
  /** Space (m radius) the move needs. Too many people inside → crash (risky moves only). */
  space: number;
  risky: boolean;
  /** Short input hint for the move list. */
  hint: string;
}
