import * as THREE from 'three';
import type { JointName } from '../animation/pose';
import { pantsStyle, shirtStyle, type Appearance } from '../data/appearance';
import type { BandRole } from '../gameplay/crowd/CrowdSim';

/**
 * Low-poly, smooth-shaded body parts in the style of late-90s 3D fighters:
 * tapered limbs, shaped torso, sphere heads with a jaw, fists, chunky
 * sneakers, caps with flat brims. Every part's origin sits on its joint
 * pivot so its world matrix equals the joint matrix (needed for instancing).
 * Cylinders/spheres face the body front at u = 0.5 of their atlas cell.
 */

export type MaterialKind = 'shirt' | 'pants' | 'skin' | 'face' | 'cap' | 'knit' | 'shoe' | 'plain' | 'prop';

export const PART_DEFS = [
  { name: 'pelvis', joint: 'body', kind: 'pants' },
  { name: 'torso', joint: 'spine', kind: 'shirt' },
  { name: 'head', joint: 'neck', kind: 'face' },
  { name: 'hairBuzz', joint: 'neck', kind: 'plain' },
  { name: 'hairShort', joint: 'neck', kind: 'plain' },
  { name: 'beard', joint: 'neck', kind: 'plain' },
  { name: 'cap', joint: 'neck', kind: 'cap' },
  { name: 'capBack', joint: 'neck', kind: 'cap' },
  { name: 'beanie', joint: 'neck', kind: 'knit' },
  { name: 'upperArmL', joint: 'shoulderL', kind: 'skin' },
  { name: 'sleeveL', joint: 'shoulderL', kind: 'shirt' },
  { name: 'sleeveLongL', joint: 'shoulderL', kind: 'shirt' },
  { name: 'forearmL', joint: 'elbowL', kind: 'skin' },
  { name: 'cuffL', joint: 'elbowL', kind: 'shirt' },
  { name: 'handL', joint: 'elbowL', kind: 'plain' },
  { name: 'upperArmR', joint: 'shoulderR', kind: 'skin' },
  { name: 'sleeveR', joint: 'shoulderR', kind: 'shirt' },
  { name: 'sleeveLongR', joint: 'shoulderR', kind: 'shirt' },
  { name: 'forearmR', joint: 'elbowR', kind: 'skin' },
  { name: 'cuffR', joint: 'elbowR', kind: 'shirt' },
  { name: 'handR', joint: 'elbowR', kind: 'plain' },
  { name: 'thighL', joint: 'hipL', kind: 'pants' },
  { name: 'shinL', joint: 'kneeL', kind: 'pants' },
  { name: 'footL', joint: 'kneeL', kind: 'shoe' },
  { name: 'thighR', joint: 'hipR', kind: 'pants' },
  { name: 'shinR', joint: 'kneeR', kind: 'pants' },
  { name: 'footR', joint: 'kneeR', kind: 'shoe' },
  { name: 'guitar', joint: 'spine', kind: 'prop' },
] as const satisfies readonly { name: string; joint: JointName | 'body'; kind: MaterialKind }[];

export type PartName = (typeof PART_DEFS)[number]['name'];
export const PART_NAMES: PartName[] = PART_DEFS.map((p) => p.name);

// ------------------------------------------------------------------ geometry helpers

/** Tapered tube hanging down from its pivot. Front (+z) at u = 0.5. */
function tube(rTop: number, rBottom: number, h: number, seg = 8, dy = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, false, Math.PI);
  g.translate(0, -h / 2 + dy, 0);
  return g;
}

/** Remap the v coordinate of every vertex into [v0, v1]. */
function remapV(g: THREE.BufferGeometry, v0: number, v1: number): THREE.BufferGeometry {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
  return g;
}

/** Collapse all UVs onto one texel (plain-coloured pieces like cap brims). */
function solidUV(g: THREE.BufferGeometry, u: number, v: number): THREE.BufferGeometry {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
  return g;
}

function deform(g: THREE.BufferGeometry, fn: (p: THREE.Vector3) => void): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    fn(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Merge geometries (position/normal/uv) without an addon import. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const size = flat[0]!.getAttribute(name).itemSize;
    const arrays = flat.map((p) => p.getAttribute(name).array as Float32Array);
    const merged = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of arrays) {
      merged.set(a, o);
      o += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(merged, size));
  }
  return out;
}

/** Partial sphere centred on the body front. */
function dome(r: number, thetaStart: number, thetaLength: number, phiLength = Math.PI * 2, wSeg = 12, hSeg = 6): THREE.SphereGeometry {
  return new THREE.SphereGeometry(r, wSeg, hSeg, Math.PI / 2 - phiLength / 2, phiLength, thetaStart, thetaLength);
}

const HEAD_Y = 0.17;
const HEAD_SCALE = new THREE.Vector3(0.92, 1.1, 1);

// ------------------------------------------------------------------ part geometry

let cache: Record<PartName, THREE.BufferGeometry> | null = null;

export function partGeometries(): Record<PartName, THREE.BufferGeometry> {
  if (cache) return cache;

  // Torso: V-shaped, flattened, sloped shoulders, a hint of chest.
  const torso = deform(new THREE.CylinderGeometry(0.25, 0.185, 0.52, 10, 4, false, Math.PI), (p) => {
    const rel = p.y + 0.26;
    p.z *= 0.58;
    if (rel > 0.45) p.x *= 0.8;
    if (p.z > 0 && rel > 0.26 && rel < 0.45) p.z *= 1.12;
  });
  torso.translate(0, 0.26, 0);

  const pelvis = new THREE.CylinderGeometry(0.19, 0.2, 0.2, 10, 1, false, Math.PI);
  pelvis.scale(1, 1, 0.62);
  pelvis.translate(0, -0.07, 0);

  // Head: sphere with a narrower jaw; neck tube underneath. Face texture rows: head v∈[0.25,1], neck v∈[0,0.24].
  const skull = deform(dome(0.125, 0, Math.PI, Math.PI * 2, 12, 9), (p) => {
    p.multiply(HEAD_SCALE);
    if (p.y < -0.02) {
      p.x *= 0.86;
      p.z *= 0.94;
    }
  });
  remapV(skull, 0.25, 1);
  skull.translate(0, HEAD_Y, 0.01);
  const neck = remapV(new THREE.CylinderGeometry(0.058, 0.07, 0.14, 8, 1, true, Math.PI), 0, 0.24);
  neck.translate(0, 0.04, 0);
  const head = merge([skull, neck]);

  const hairPiece = (r: number, len: number) => {
    const g = deform(dome(r, 0, len), (p) => p.multiply(HEAD_SCALE));
    g.translate(0, HEAD_Y, 0.005);
    return g;
  };
  const hairBuzz = hairPiece(0.129, 0.45 * Math.PI);
  const hairShort = hairPiece(0.136, 0.47 * Math.PI);
  const beard = deform(dome(0.131, 0.66 * Math.PI, 0.27 * Math.PI, Math.PI * 1.25, 12, 3), (p) => p.multiply(HEAD_SCALE));
  beard.translate(0, HEAD_Y, 0.012);

  // Cap: dome + flat brim (brim takes the plain corner texel of the cap cell).
  const capDome = dome(0.138, 0, 0.47 * Math.PI);
  capDome.scale(0.95, 0.92, 1.03);
  capDome.translate(0, HEAD_Y + 0.012, 0.004);
  const brim = solidUV(new THREE.BoxGeometry(0.21, 0.016, 0.15), 0.03, 0.97);
  brim.rotateX(0.06);
  brim.translate(0, HEAD_Y + 0.03, 0.185);
  const cap = merge([capDome, brim]);
  const capBack = cap.clone();
  capBack.rotateY(Math.PI);

  const beanieTop = dome(0.14, 0, 0.5 * Math.PI);
  beanieTop.scale(0.95, 1.25, 1.03);
  beanieTop.translate(0, HEAD_Y + 0.012, 0.004);
  const fold = new THREE.CylinderGeometry(0.142, 0.142, 0.055, 12, 1, true, Math.PI);
  fold.scale(0.95, 1, 1.03);
  fold.translate(0, HEAD_Y + 0.035, 0.004);
  const beanie = merge([beanieTop, remapV(fold, 0, 0.3)]);

  const hand = new THREE.BoxGeometry(0.075, 0.1, 0.09);
  hand.translate(0, -0.315, 0.008);

  // Sneaker: upper uses v∈[0.35,1] of the shoe texture, chunky sole v∈[0,0.3].
  const upper = remapV(new THREE.BoxGeometry(0.11, 0.085, 0.24), 0.35, 1);
  upper.translate(0, -0.46, 0.045);
  const sole = remapV(new THREE.BoxGeometry(0.125, 0.04, 0.28), 0, 0.3);
  sole.translate(0, -0.5, 0.05);
  const foot = merge([upper, sole]);

  // Guitar in torso space: body at the belly, neck up to the player's left.
  const gBody = new THREE.BoxGeometry(0.34, 0.26, 0.06);
  gBody.translate(-0.04, 0.12, 0.2);
  const gNeck = new THREE.BoxGeometry(0.06, 0.06, 0.55);
  gNeck.rotateY(Math.PI / 2);
  gNeck.rotateZ(0.5);
  gNeck.translate(0.28, 0.29, 0.2);

  cache = {
    pelvis,
    torso,
    head,
    hairBuzz,
    hairShort,
    beard,
    cap,
    capBack,
    beanie,
    upperArmL: tube(0.062, 0.05, 0.3),
    sleeveL: tube(0.084, 0.078, 0.16, 8, 0.005),
    sleeveLongL: tube(0.078, 0.07, 0.31),
    forearmL: tube(0.053, 0.043, 0.27),
    cuffL: tube(0.066, 0.06, 0.26),
    handL: hand,
    upperArmR: tube(0.062, 0.05, 0.3),
    sleeveR: tube(0.084, 0.078, 0.16, 8, 0.005),
    sleeveLongR: tube(0.078, 0.07, 0.31),
    forearmR: tube(0.053, 0.043, 0.27),
    cuffR: tube(0.066, 0.06, 0.26),
    handR: hand.clone(),
    thighL: tube(0.1, 0.082, 0.46),
    shinL: tube(0.079, 0.092, 0.44),
    footL: foot,
    thighR: tube(0.1, 0.082, 0.46),
    shinR: tube(0.079, 0.092, 0.44),
    footR: foot.clone(),
    guitar: merge([gBody, gNeck]),
  };
  return cache;
}

// ------------------------------------------------------------------ appearance → per-part look

export interface PartLook {
  visible: boolean;
  color: number;
  /** Atlas cell for atlas-textured kinds. */
  cell: number;
}

/** Resolve an appearance into colour, atlas cell and visibility for every part. */
export function resolveLook(a: Appearance, band?: BandRole): Record<PartName, PartLook> {
  const shirt = shirtStyle(a.shirt);
  const pants = pantsStyle(a.pants).cell;
  const shirtColor = shirt.tint ? a.shirtColor : 0xffffff;
  const long = shirt.longSleeves;
  const covered = a.headwear === 'beanie';
  const capColor = a.capStyle === 0 ? a.headwearColor : 0xffffff;
  const L = (visible: boolean, color: number, cell = 0): PartLook => ({ visible, color, cell });
  return {
    pelvis: L(true, 0xffffff, pants),
    torso: L(true, shirtColor, shirt.front),
    head: L(true, a.skin, a.face),
    hairBuzz: L(a.hair === 'buzz' && !covered, a.hairColor),
    hairShort: L(a.hair === 'short' && !covered, a.hairColor),
    beard: L(a.beard, a.hairColor),
    cap: L(a.headwear === 'cap', capColor, a.capStyle),
    capBack: L(a.headwear === 'cap_back', capColor, a.capStyle),
    beanie: L(covered, a.headwearColor),
    upperArmL: L(!long, a.skin, a.tattoo),
    sleeveL: L(!long, shirtColor, shirt.fabric),
    sleeveLongL: L(long, shirtColor, shirt.fabric),
    forearmL: L(!long, a.skin, a.tattoo),
    cuffL: L(long, shirtColor, shirt.fabric),
    handL: L(true, a.skin),
    upperArmR: L(!long, a.skin, a.tattoo),
    sleeveR: L(!long, shirtColor, shirt.fabric),
    sleeveLongR: L(long, shirtColor, shirt.fabric),
    forearmR: L(!long, a.skin, a.tattoo),
    cuffR: L(long, shirtColor, shirt.fabric),
    handR: L(true, a.skin),
    thighL: L(true, 0xffffff, pants),
    shinL: L(true, 0xffffff, pants),
    footL: L(true, a.shoes),
    thighR: L(true, 0xffffff, pants),
    shinR: L(true, 0xffffff, pants),
    footR: L(true, a.shoes),
    guitar: L(band === 'guitar' || band === 'bass', band === 'bass' ? 0x1a3a8a : 0x8a1010),
  };
}
