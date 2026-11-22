import type { VenueDefinition } from './venueTypes';

export const VENUES: VenueDefinition[] = [
  {
    id: 'basement',
    name: 'The Basement',
    description: 'Sweaty cellar under a closed laundromat. Low ceiling, tiny stage, zero personal space.',
    room: { width: 17, depth: 16, height: 3.2 },
    stage: { width: 6.5, depth: 2.6, height: 0.35 },
    pit: { x: 0, z: 0.9, radius: 4.8 },
    crowd: { watchers: 64, dancers: 2, ninjas: 1, surfers: 1, seed: 1337 },
    look: {
      fog: 0x120b14,
      fogNear: 4,
      fogFar: 22,
      ambient: 0x4a3a5a,
      ambientIntensity: 1.3,
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
