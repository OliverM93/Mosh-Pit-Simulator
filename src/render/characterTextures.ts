import * as THREE from 'three';
import { Rng } from '../core/random';
import { CAP_COUNT, FACE_COUNT, MERCH_BANDS, PANTS_ATLAS, SHIRT_ATLAS, TATTOO_COUNT } from '../data/appearance';

/**
 * Hand-painted (procedural) texture atlases for characters. Cells are 64 px,
 * nearest-filtered. Cylinder/sphere parts map one full cell around their
 * circumference with the FRONT of the body at u = 0.5 (cell centre).
 * Layout of cell indices is defined in src/data/appearance.ts.
 */

export const CELL = 64;
/** Atlases are painted at 2× resolution so prints and faces stay readable up close. */
const RES = 2;

export interface Atlas {
  texture: THREE.Texture;
  cols: number;
  rows: number;
}

type Painter = (ctx: CanvasRenderingContext2D, rng: Rng) => void;

function makeAtlas(cols: number, rows: number, painters: Painter[], seed: number): Atlas {
  const c = document.createElement('canvas');
  c.width = cols * CELL * RES;
  c.height = rows * CELL * RES;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const rng = new Rng(seed);
  painters.forEach((paint, i) => {
    ctx.save();
    ctx.setTransform(RES, 0, 0, RES, (i % cols) * CELL * RES, Math.floor(i / cols) * CELL * RES);
    ctx.beginPath();
    ctx.rect(0, 0, CELL, CELL);
    ctx.clip();
    paint(ctx, rng);
    ctx.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return { texture: t, cols, rows };
}

/** UV offset of a cell (canvas row 0 = top = high v). */
export function cellOffset(atlas: { cols: number; rows: number }, cell: number): [number, number] {
  const col = cell % atlas.cols;
  const row = Math.floor(cell / atlas.cols);
  return [col / atlas.cols, 1 - (row + 1) / atlas.rows];
}

// ------------------------------------------------------------------ helpers

function fill(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, CELL, CELL);
}

function grain(ctx: CanvasRenderingContext2D, rng: Rng, amount = 0.5, alpha = 0.12): void {
  for (let i = 0; i < CELL * CELL * amount * 0.25; i++) {
    const v = rng.next() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rng.next()})`;
    ctx.fillRect(Math.floor(rng.next() * CELL), Math.floor(rng.next() * CELL), 1, 1);
  }
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, font = 'monospace'): void {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

const PRINT_FONT = "Impact, 'Arial Black', 'Arial Narrow', sans-serif";

/**
 * Band name on the chest: words on separate lines, font shrunk until every
 * line fits the chest (u 0.25–0.75 = 32 px of the 64 px cell, planar-projected).
 */
function bandPrint(ctx: CanvasRenderingContext2D, name: string, top: number, bottom: number, color: string, font = PRINT_FONT): void {
  const words = name.split(' ');
  const lineH = (bottom - top) / words.length;
  let size = Math.min(12, lineH);
  ctx.font = `bold ${size}px ${font}`;
  while (size > 5 && Math.max(...words.map((w) => ctx.measureText(w).width)) > 26) {
    size -= 1;
    ctx.font = `bold ${size}px ${font}`;
  }
  words.forEach((w, i) => text(ctx, w, 32, top + lineH * (i + 0.5), size, color, font));
}

/** Torso cells: print sits around u = 0.5 (x = 32), chest height ≈ y 14–34. */
function skull(ctx: CanvasRenderingContext2D, x: number, y: number, ink: string): void {
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.ellipse(x, y, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - 5, y + 5, 10, 5);
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 5, y - 2, 4, 4);
  ctx.fillRect(x + 1, y - 2, 4, 4);
  ctx.fillRect(x - 1, y + 3, 2, 2);
  ctx.fillRect(x - 4, y + 7, 1, 3);
  ctx.fillRect(x - 1, y + 7, 1, 3);
  ctx.fillRect(x + 2, y + 7, 1, 3);
}

function seams(ctx: CanvasRenderingContext2D, color: string): void {
  // Side seams at u = 0.25 / 0.75 and hem.
  ctx.fillStyle = color;
  ctx.fillRect(15, 0, 1, CELL);
  ctx.fillRect(47, 0, 1, CELL);
  ctx.fillRect(0, CELL - 3, CELL, 1);
}

// ------------------------------------------------------------------ shirts

const SHIRT_PAINTERS: Painter[] = [
  // 0 skull tee
  (c, r) => {
    fill(c, '#141414');
    bandPrint(c, MERCH_BANDS.skullTee, 6, 15, '#c81818');
    skull(c, 32, 26, '#e8e4d8');
    seams(c, '#000');
    grain(c, r);
  },
  // 1 black band tee
  (c, r) => {
    fill(c, '#151515');
    bandPrint(c, MERCH_BANDS.blackTee, 10, 32, '#f0f0f0');
    c.fillStyle = '#c01818';
    c.fillRect(22, 34, 20, 2);
    seams(c, '#000');
    grain(c, r);
  },
  // 2 band tee with jagged underline
  (c, r) => {
    fill(c, '#131313');
    bandPrint(c, MERCH_BANDS.jaggedTee, 10, 31, '#d8d8d8');
    c.strokeStyle = '#d8d8d8';
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.moveTo(20 + i * 4, 32);
      c.lineTo(21 + i * 4, 36 + r.int(0, 3));
      c.stroke();
    }
    seams(c, '#000');
    grain(c, r);
  },
  // 3 white tee, black print
  (c, r) => {
    fill(c, '#ecebe6');
    bandPrint(c, MERCH_BANDS.whiteTee, 12, 24, '#111');
    c.fillStyle = '#111';
    c.beginPath();
    c.arc(32, 32, 5, 0, Math.PI * 2);
    c.fill();
    seams(c, '#bbb');
    grain(c, r, 0.4, 0.08);
  },
  // 4 plain (tinted)
  (c, r) => {
    fill(c, '#f2f2f2');
    seams(c, '#c8c8c8');
    grain(c, r, 0.5, 0.1);
  },
  // 5 pinstripe baseball jersey (front buttons, number)
  (c, r) => {
    fill(c, '#efefea');
    c.fillStyle = '#26304a';
    for (let x = 1; x < CELL; x += 4) c.fillRect(x, 0, 1, CELL);
    c.fillStyle = '#efefea';
    c.fillRect(30, 0, 4, CELL);
    c.fillStyle = '#26304a';
    for (let y = 6; y < CELL; y += 7) c.fillRect(31, y, 2, 2);
    text(c, '13', 22, 22, 10, '#26304a', 'serif');
    grain(c, r, 0.4, 0.08);
  },
  // 6 flannel
  (c, r) => {
    fill(c, '#7a1616');
    c.fillStyle = 'rgba(0,0,0,0.55)';
    for (let x = 0; x < CELL; x += 10) c.fillRect(x, 0, 4, CELL);
    for (let y = 0; y < CELL; y += 10) c.fillRect(0, y, CELL, 4);
    c.fillStyle = '#ddd';
    for (let y = 6; y < CELL; y += 9) c.fillRect(31, y, 2, 2);
    grain(c, r);
  },
  // 7 black hoodie with small chest print + front pocket
  (c, r) => {
    fill(c, '#161616');
    bandPrint(c, MERCH_BANDS.hoodie, 8, 30, '#bdbdbd');
    c.fillStyle = '#0c0c0c';
    c.fillRect(20, 38, 24, 14);
    c.fillStyle = '#2a2a2a';
    c.fillRect(31, 0, 1, 12);
    c.fillRect(33, 0, 1, 12);
    grain(c, r);
  },
  // 8 varsity jacket: navy body, letter patch, white trim
  (c, r) => {
    fill(c, '#1b2448');
    c.fillStyle = '#e8e2cc';
    c.fillRect(31, 0, 2, CELL);
    for (let y = 0; y < CELL; y += 7) c.fillRect(30, y, 4, 2);
    c.fillStyle = '#c01818';
    c.fillRect(18, 14, 9, 11);
    text(c, 'P', 22, 20, 9, '#e8e2cc', 'serif');
    c.fillStyle = '#e8e2cc';
    c.fillRect(0, CELL - 6, CELL, 2);
    grain(c, r);
  },
  // 9 camo puffer: quilted bands
  (c, r) => {
    camo(c, r, ['#5a4632', '#7a6040', '#3a2c20', '#9a7c52']);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = 8; y < CELL; y += 9) c.fillRect(0, y, CELL, 2);
    c.fillStyle = '#222';
    c.fillRect(31, 0, 2, CELL);
  },
  // 10 grey band tee
  (c, r) => {
    fill(c, '#5f5f62');
    bandPrint(c, MERCH_BANDS.greyTee, 12, 26, '#111');
    c.fillStyle = '#111';
    c.fillRect(22, 29, 20, 2);
    seams(c, '#444');
    grain(c, r);
  },
  // 11 player "MOSH" tee
  (c, r) => {
    fill(c, '#f4f2ee');
    text(c, 'MOSH', 32, 20, 12, '#c41616', 'serif');
    c.fillStyle = '#c41616';
    c.fillRect(20, 28, 24, 2);
    text(c, 'PIT', 32, 36, 9, '#111', 'serif');
    text(c, 'XXX', 32, 8, 5, '#c41616');
    seams(c, '#c8c8c8');
    grain(c, r, 0.4, 0.08);
  },
  // 12 fabric black
  (c, r) => {
    fill(c, '#151515');
    grain(c, r);
  },
  // 13 fabric white (tint)
  (c, r) => {
    fill(c, '#f2f2f2');
    grain(c, r, 0.5, 0.08);
  },
  // 14 fabric pinstripe
  (c, r) => {
    fill(c, '#efefea');
    c.fillStyle = '#26304a';
    for (let x = 1; x < CELL; x += 4) c.fillRect(x, 0, 1, CELL);
    c.fillRect(0, CELL - 4, CELL, 2);
    grain(c, r, 0.4, 0.08);
  },
  // 15 fabric flannel
  (c, r) => SHIRT_PAINTERS[6]!(c, r),
  // 16 fabric varsity cream sleeves
  (c, r) => {
    fill(c, '#e8e2cc');
    c.fillStyle = '#1b2448';
    c.fillRect(0, CELL - 8, CELL, 3);
    grain(c, r, 0.4, 0.1);
  },
  // 17 fabric camo puffer
  (c, r) => SHIRT_PAINTERS[9]!(c, r),
  // 18 fabric grey
  (c, r) => {
    fill(c, '#5f5f62');
    grain(c, r);
  },
];

function camo(c: CanvasRenderingContext2D, r: Rng, palette: string[]): void {
  fill(c, palette[0]!);
  for (let i = 0; i < 26; i++) {
    c.fillStyle = palette[1 + (i % (palette.length - 1))]!;
    c.beginPath();
    c.ellipse(r.next() * CELL, r.next() * CELL, 4 + r.next() * 8, 3 + r.next() * 5, r.next() * 3, 0, Math.PI * 2);
    c.fill();
  }
  grain(c, r, 0.4, 0.1);
}

// ------------------------------------------------------------------ pants

const PANTS_PAINTERS: Painter[] = [
  (c, r) => denim(c, r, '#3a5688', '#4c6aa0'),
  (c, r) => denim(c, r, '#1a1b20', '#2a2b33'),
  (c, r) => camo(c, r, ['#4e5a34', '#2e3a22', '#6e6a44', '#1e1e16']),
  (c, r) => {
    fill(c, '#4d5532');
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(6, 24, 12, 10);
    c.fillRect(38, 24, 12, 10);
    seamsPants(c, 'rgba(0,0,0,0.4)');
    grain(c, r);
  },
  (c, r) => {
    fill(c, '#141414');
    c.fillStyle = '#e8e8e8';
    c.fillRect(14, 0, 2, CELL);
    c.fillRect(46, 0, 2, CELL);
    grain(c, r);
  },
  (c, r) => {
    fill(c, '#8a7a56');
    seamsPants(c, 'rgba(0,0,0,0.3)');
    grain(c, r);
  },
  (c, r) => {
    fill(c, '#7a7a7e');
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(0, CELL - 6, CELL, 6);
    grain(c, r, 0.6, 0.15);
  },
];

function seamsPants(c: CanvasRenderingContext2D, color: string): void {
  c.fillStyle = color;
  c.fillRect(15, 0, 1, CELL);
  c.fillRect(47, 0, 1, CELL);
}

function denim(c: CanvasRenderingContext2D, r: Rng, base: string, light: string): void {
  fill(c, base);
  c.fillStyle = light;
  for (let y = 0; y < CELL; y += 2) for (let x = (y / 2) % 3; x < CELL; x += 3) if (r.next() < 0.5) c.fillRect(x, y, 1, 1);
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fillRect(24, 4, 16, 18); // worn knee/thigh fade at the front
  seamsPants(c, 'rgba(210,170,90,0.6)');
  grain(c, r, 0.4, 0.1);
}

// ------------------------------------------------------------------ skin / tattoos (white base, tinted with skin colour)

function tattooSleeve(c: CanvasRenderingContext2D, r: Rng, density: number): void {
  fill(c, '#f4f4f4');
  c.strokeStyle = 'rgba(20,24,30,0.85)';
  c.fillStyle = 'rgba(20,24,30,0.85)';
  for (let i = 0; i < density; i++) {
    const x = r.next() * CELL;
    const y = r.next() * (CELL - 8);
    const k = r.int(0, 3);
    c.lineWidth = 1;
    if (k === 0) {
      c.beginPath();
      c.arc(x, y, 3 + r.next() * 4, 0, Math.PI * 2);
      c.stroke();
    } else if (k === 1) {
      // star
      c.beginPath();
      for (let p = 0; p < 10; p++) {
        const rad = p % 2 ? 2 : 5;
        const a = (p / 10) * Math.PI * 2;
        c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
      }
      c.fill();
    } else if (k === 2) {
      c.fillRect(x, y, 2 + r.next() * 6, 2);
      c.fillRect(x, y + 3, 1, 4);
    } else {
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + 6, y - 6, x + 10, y + 4);
      c.stroke();
    }
  }
}

const SKIN_PAINTERS: Painter[] = [
  (c, r) => {
    fill(c, '#f4f4f4');
    grain(c, r, 0.3, 0.05);
  },
  (c, r) => tattooSleeve(c, r, 26),
  (c, r) => tattooSleeve(c, r, 12),
  (c, r) => {
    tattooSleeve(c, r, 18);
    c.fillStyle = 'rgba(20,24,30,0.7)';
    c.fillRect(0, 4, CELL, 3);
    c.fillRect(0, 30, CELL, 2);
  },
];

// ------------------------------------------------------------------ faces
// Head sphere: u wraps around (front u = 0.5 → x 32), v: top of head y=0 … chin y≈44, neck band y 48–64.

function face(c: CanvasRenderingContext2D, r: Rng, opts: { mood: 'neutral' | 'shout' | 'stern'; shades?: boolean; neckInk?: boolean }): void {
  fill(c, '#f2f2f2');
  // ears + cheek shading
  c.fillStyle = 'rgba(160,110,90,0.35)';
  c.fillRect(15, 22, 3, 8);
  c.fillRect(46, 22, 3, 8);
  c.fillStyle = 'rgba(0,0,0,0.06)';
  c.fillRect(22, 30, 4, 6);
  c.fillRect(38, 30, 4, 6);
  // brows
  c.fillStyle = '#2a1c16';
  if (opts.mood === 'neutral') {
    c.fillRect(24, 19, 6, 2);
    c.fillRect(34, 19, 6, 2);
  } else {
    c.fillRect(24, 18, 6, 2);
    c.fillRect(28, 20, 3, 1);
    c.fillRect(34, 18, 6, 2);
    c.fillRect(33, 20, 3, 1);
  }
  // eyes
  if (opts.shades) {
    c.fillStyle = '#0c0c0c';
    c.fillRect(22, 22, 20, 5);
    c.fillStyle = '#5a6a80';
    c.fillRect(24, 23, 3, 1);
    c.fillRect(35, 23, 3, 1);
  } else {
    c.fillStyle = '#fff';
    c.fillRect(25, 23, 5, 3);
    c.fillRect(34, 23, 5, 3);
    c.fillStyle = '#2a1a12';
    c.fillRect(27, 23, 2, 3);
    c.fillRect(35, 23, 2, 3);
  }
  // nose
  c.fillStyle = 'rgba(120,70,50,0.45)';
  c.fillRect(31, 26, 2, 6);
  c.fillRect(30, 31, 4, 1);
  // mouth
  c.fillStyle = '#5a2424';
  if (opts.mood === 'shout') {
    c.fillRect(28, 35, 8, 5);
    c.fillStyle = '#eee';
    c.fillRect(29, 35, 6, 1);
  } else if (opts.mood === 'stern') {
    c.fillRect(28, 37, 8, 1);
  } else {
    c.fillRect(28, 36, 8, 2);
  }
  // neck band
  c.fillStyle = 'rgba(0,0,0,0.08)';
  c.fillRect(0, 48, CELL, 2);
  if (opts.neckInk) {
    c.fillStyle = 'rgba(20,24,30,0.85)';
    for (let i = 0; i < 9; i++) c.fillRect(r.int(16, 46), r.int(50, 60), r.int(2, 5), r.int(1, 3));
    c.beginPath();
    c.arc(32, 56, 4, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(20,24,30,0.85)';
    c.stroke();
  }
  grain(c, r, 0.2, 0.04);
}

const FACE_PAINTERS: Painter[] = [
  (c, r) => face(c, r, { mood: 'neutral' }),
  (c, r) => face(c, r, { mood: 'shout' }),
  (c, r) => face(c, r, { mood: 'stern', shades: true }),
  (c, r) => face(c, r, { mood: 'neutral', neckInk: true }),
  (c, r) => face(c, r, { mood: 'shout', neckInk: true }),
  (c, r) => face(c, r, { mood: 'stern' }),
];

// ------------------------------------------------------------------ caps (front at x = 32, lower part of dome)

const CAP_PAINTERS: Painter[] = [
  (c, r) => {
    fill(c, '#f0f0f0');
    grain(c, r, 0.3, 0.08);
  },
  (c, r) => {
    fill(c, '#141414');
    text(c, 'HC', 32, 40, 10, '#f0f0f0', 'serif');
    grain(c, r);
  },
  (c, r) => {
    fill(c, '#1b2448');
    text(c, 'B', 32, 40, 12, '#f0f0f0', 'serif');
    grain(c, r);
  },
  (c, r) => {
    fill(c, '#141414');
    c.fillStyle = '#c01818';
    c.fillRect(24, 34, 16, 9);
    text(c, 'XXX', 32, 39, 6, '#f0f0f0');
    grain(c, r);
  },
];

// ------------------------------------------------------------------ public atlases (lazy singletons)

let atlases: { shirt: Atlas; pants: Atlas; skin: Atlas; face: Atlas; cap: Atlas; shoe: THREE.Texture; knit: THREE.Texture } | null = null;

export function characterAtlases(): NonNullable<typeof atlases> {
  if (atlases) return atlases;
  if (SHIRT_PAINTERS.length > SHIRT_ATLAS.cols * SHIRT_ATLAS.rows) throw new Error('shirt atlas too small');
  atlases = {
    shirt: makeAtlas(SHIRT_ATLAS.cols, SHIRT_ATLAS.rows, SHIRT_PAINTERS, 21),
    pants: makeAtlas(PANTS_ATLAS.cols, PANTS_ATLAS.rows, PANTS_PAINTERS, 22),
    skin: makeAtlas(TATTOO_COUNT, 1, SKIN_PAINTERS, 23),
    face: makeAtlas(FACE_COUNT, 1, FACE_PAINTERS, 24),
    cap: makeAtlas(CAP_COUNT, 1, CAP_PAINTERS, 25),
    shoe: makeAtlas(1, 1, [
      (c, r) => {
        fill(c, '#e6e6e6');
        c.fillStyle = '#fafafa';
        c.fillRect(0, 44, CELL, 20); // chunky sole
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.fillRect(0, 44, CELL, 1);
        c.fillStyle = 'rgba(0,0,0,0.35)';
        for (let x = 26; x < 40; x += 3) c.fillRect(x, 10, 2, 14); // laces
        grain(c, r, 0.3, 0.08);
      },
    ], 26).texture,
    knit: makeAtlas(1, 1, [
      (c, r) => {
        fill(c, '#eeeeee');
        c.fillStyle = 'rgba(0,0,0,0.18)';
        for (let x = 0; x < CELL; x += 3) c.fillRect(x, 0, 1, CELL);
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.fillRect(0, 44, CELL, 2);
        grain(c, r, 0.4, 0.1);
      },
    ], 27).texture,
  };
  return atlases;
}
