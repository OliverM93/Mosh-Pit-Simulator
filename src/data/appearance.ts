import type { Rng } from '../core/random';

/**
 * Character look as pure data (headless). The renderer maps these ids to
 * geometry variants and texture-atlas cells. Phase 3 (outfits/unlocks) builds
 * on this catalogue. Band merch shows real band names as plain text (MERCH_BANDS) – no official logos.
 */

export type HeadwearId = 'none' | 'cap' | 'cap_back' | 'beanie';
export type HairId = 'bald' | 'buzz' | 'short';

export interface ShirtStyle {
  id: string;
  name: string;
  /** Atlas cell for the torso. */
  front: number;
  /** Atlas cell for sleeves. */
  fabric: number;
  longSleeves: boolean;
  /** Plain shirts are tinted with `shirtColor`; printed ones keep their colours. */
  tint: boolean;
}

export interface PantsStyle {
  id: string;
  name: string;
  cell: number;
}

/**
 * Real band names printed on merch and flyers (text only, own typography – no
 * official logos). Central list so names can be swapped or cleared before any
 * commercial release (trademark/permission question, see docs/DECISIONS.md D-023).
 */
export const MERCH_BANDS = {
  skullTee: 'HATEBREED',
  blackTee: 'MADBALL',
  jaggedTee: 'KNOCKED LOOSE',
  whiteTee: 'TURNSTILE',
  greyTee: 'TERROR',
  hoodie: 'SICK OF IT ALL',
} as const;

/** Shirt atlas: 4 columns × 5 rows. */
export const SHIRT_ATLAS = { cols: 4, rows: 5 };
export const SHIRT_FABRIC = { black: 12, white: 13, pinstripe: 14, flannel: 15, cream: 16, camo: 17, grey: 18 };

export const SHIRT_STYLES: ShirtStyle[] = [
  { id: 'tee_skull', name: 'Hatebreed Tee', front: 0, fabric: SHIRT_FABRIC.black, longSleeves: false, tint: false },
  { id: 'tee_staytrue', name: 'Madball Tee', front: 1, fabric: SHIRT_FABRIC.black, longSleeves: false, tint: false },
  { id: 'tee_brickface', name: 'Knocked Loose Tee', front: 2, fabric: SHIRT_FABRIC.black, longSleeves: false, tint: false },
  { id: 'tee_halo', name: 'Turnstile Tee', front: 3, fabric: SHIRT_FABRIC.white, longSleeves: false, tint: false },
  { id: 'tee_plain', name: 'Plain Tee', front: 4, fabric: SHIRT_FABRIC.white, longSleeves: false, tint: true },
  { id: 'jersey', name: 'Pinstripe Jersey', front: 5, fabric: SHIRT_FABRIC.pinstripe, longSleeves: false, tint: false },
  { id: 'flannel', name: 'Flannel', front: 6, fabric: SHIRT_FABRIC.flannel, longSleeves: true, tint: false },
  { id: 'hoodie', name: 'Sick Of It All Hoodie', front: 7, fabric: SHIRT_FABRIC.black, longSleeves: true, tint: false },
  { id: 'varsity', name: 'Varsity Jacket', front: 8, fabric: SHIRT_FABRIC.cream, longSleeves: true, tint: false },
  { id: 'puffer', name: 'Camo Puffer', front: 9, fabric: SHIRT_FABRIC.camo, longSleeves: true, tint: false },
  { id: 'tee_lowrider', name: 'Terror Tee', front: 10, fabric: SHIRT_FABRIC.grey, longSleeves: false, tint: false },
  { id: 'tee_mosh', name: 'MOSH Tee', front: 11, fabric: SHIRT_FABRIC.white, longSleeves: false, tint: false },
];

/** Pants atlas: 4 columns × 2 rows. */
export const PANTS_ATLAS = { cols: 4, rows: 2 };
export const PANTS_STYLES: PantsStyle[] = [
  { id: 'jeans_blue', name: 'Blue Jeans', cell: 0 },
  { id: 'jeans_black', name: 'Black Jeans', cell: 1 },
  { id: 'camo', name: 'Woodland Camo', cell: 2 },
  { id: 'cargo', name: 'Olive Cargo', cell: 3 },
  { id: 'track', name: 'Track Pants', cell: 4 },
  { id: 'khaki', name: 'Khaki Chinos', cell: 5 },
  { id: 'sweats', name: 'Grey Sweats', cell: 6 },
];

/** Arm skin atlas cells: 0 = no tattoos, 1–3 = tattoo sleeves. */
export const TATTOO_COUNT = 4;
/** Face atlas cells: expressions, sunglasses, neck tattoos. */
export const FACE_COUNT = 6;
/** Cap atlas: 0 plain (tinted), 1+ printed. */
export const CAP_COUNT = 4;

export interface Appearance {
  skin: number;
  face: number;
  hair: HairId;
  hairColor: number;
  beard: boolean;
  headwear: HeadwearId;
  /** Cap atlas cell (caps) or colour source for beanies. */
  capStyle: number;
  headwearColor: number;
  shirt: string;
  shirtColor: number;
  pants: string;
  tattoo: number;
  shoes: number;
  height: number;
  build: number;
}

export const SKIN_TONES = [0xf1c7a5, 0xe0ac85, 0xc68a5e, 0x9a6440, 0x6e4228, 0xf5d6c0];
const HAIR_COLORS = [0x1a1410, 0x2a1d14, 0x3b2a1c, 0x5a3d22, 0x111111, 0x7a5a3a];
const PLAIN_SHIRT_COLORS = [0x151515, 0x6b6b6b, 0x5c1a1a, 0x1d3b24, 0x1b2448, 0xd9c31a, 0xe8e8e8];
const HEADWEAR_COLORS = [0x111111, 0x111111, 0x8a1010, 0x1b2448, 0x2d4d2d, 0x6b6b6b];
const SHOE_COLORS = [0xf2f2f2, 0xf2f2f2, 0x161616, 0xdddddd, 0x6b1010];

function weighted<T>(rng: Rng, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [v, w] of items) {
    if ((r -= w) <= 0) return v;
  }
  return items[items.length - 1]![0];
}

/** A random hardcore-show visitor (weights follow the reference photos: black tees, caps, tattoos, beards). */
export function randomAppearance(rng: Rng): Appearance {
  const headwear = weighted<HeadwearId>(rng, [
    ['none', 35],
    ['cap', 35],
    ['cap_back', 15],
    ['beanie', 15],
  ]);
  return {
    skin: rng.pick(SKIN_TONES),
    face: rng.int(0, FACE_COUNT - 1),
    hair: weighted<HairId>(rng, [
      ['bald', 25],
      ['buzz', 45],
      ['short', 30],
    ]),
    hairColor: rng.pick(HAIR_COLORS),
    beard: rng.chance(0.5),
    headwear,
    capStyle: rng.int(0, CAP_COUNT - 1),
    headwearColor: rng.pick(HEADWEAR_COLORS),
    shirt: weighted<string>(rng, [
      ['tee_skull', 14],
      ['tee_staytrue', 10],
      ['tee_brickface', 12],
      ['tee_halo', 6],
      ['tee_lowrider', 6],
      ['tee_plain', 16],
      ['jersey', 6],
      ['flannel', 6],
      ['hoodie', 10],
      ['varsity', 5],
      ['puffer', 5],
    ]),
    shirtColor: rng.pick(PLAIN_SHIRT_COLORS),
    pants: weighted<string>(rng, [
      ['jeans_blue', 25],
      ['jeans_black', 25],
      ['camo', 15],
      ['cargo', 12],
      ['track', 10],
      ['khaki', 6],
      ['sweats', 7],
    ]),
    tattoo: rng.chance(0.4) ? 0 : rng.int(1, TATTOO_COUNT - 1),
    shoes: rng.pick(SHOE_COLORS),
    height: rng.range(0.94, 1.07),
    build: rng.range(0.92, 1.18),
  };
}

export function shirtStyle(id: string): ShirtStyle {
  return SHIRT_STYLES.find((s) => s.id === id) ?? SHIRT_STYLES[0]!;
}

export function pantsStyle(id: string): PantsStyle {
  return PANTS_STYLES.find((p) => p.id === id) ?? PANTS_STYLES[0]!;
}

/** The player's default look: stands out in white against the black-shirt crowd. */
export const PLAYER_APPEARANCE: Appearance = {
  skin: 0xe0ac85,
  face: 1,
  hair: 'buzz',
  hairColor: 0x2a1d14,
  beard: true,
  headwear: 'cap_back',
  capStyle: 0,
  headwearColor: 0xb01010,
  shirt: 'tee_mosh',
  shirtColor: 0xffffff,
  pants: 'camo',
  tattoo: 1,
  shoes: 0xf2f2f2,
  height: 1,
  build: 1.05,
};
