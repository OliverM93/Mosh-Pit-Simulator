import type { VenueDefinition } from './venueTypes';

export const VENUES: VenueDefinition[] = [
  {
    id: 'basement',
    name: 'The Basement',
    description: 'Sweaty cellar under a closed laundromat. Low ceiling, tiny stage, zero personal space.',
    room: { width: 14, depth: 14, height: 3.0 },
    stage: { width: 6.5, depth: 2.6, height: 0.35 },
    pit: { x: 0, z: 0.6, radius: 3.7 },
    crowd: { watchers: 58, dancers: 3, ninjas: 2, surfers: 1, seed: 1337 },
    look: {
      fog: 0x120b14,
      fogNear: 4,
      fogFar: 17,
      ambient: 0x4a3a5a,
      ambientIntensity: 0.9,
      stageColors: [0xff2a3a, 0x3a6bff, 0xffa020, 0x9b30ff],
      wallTint: 0x8a6d63,
      floorTint: 0x6a6460,
      posters: ['AGNOSTIC FRONT', 'CRO-MAGS', 'BIOHAZARD', 'COMEBACK KID', 'KUBLAI KHAN', 'TERROR'],
    },
  },
];

export function getVenue(id: string): VenueDefinition {
  const v = VENUES.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown venue: ${id}`);
  return v;
}
