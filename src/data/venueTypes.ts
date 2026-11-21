/** Data-driven venue description. Gameplay reads the layout, rendering the look. */
export interface VenueDefinition {
  id: string;
  name: string;
  description: string;
  /** Room interior size in metres. Origin = room centre on the floor, stage at -z. */
  room: { width: number; depth: number; height: number };
  stage: { width: number; depth: number; height: number };
  /** Pit centre (x, z) and base radius in metres. */
  pit: { x: number; z: number; radius: number };
  crowd: {
    /** People forming the pit wall and the audience. */
    watchers: number;
    /** Active pit dancers (2-steppers, arm swingers). */
    dancers: number;
    /** Hardcore dancers that throw kicks. */
    ninjas: number;
    surfers: number;
    seed: number;
  };
  look: {
    fog: number;
    fogNear: number;
    fogFar: number;
    ambient: number;
    ambientIntensity: number;
    /** Stage wash colours (cycled per section). */
    stageColors: number[];
    wallTint: number;
    floorTint: number;
    /** Flyer texts on the walls. */
    posters: string[];
  };
}
