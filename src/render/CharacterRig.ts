import * as THREE from 'three';
import { JOINT_INDEX, ROOT_INDEX, type JointName, type Pose } from '../animation/pose';

/**
 * Low-poly box character. Joints are Groups; every body part is a mesh whose
 * geometry is pre-offset so its origin sits on the joint pivot. The same rig
 * renders the player directly and acts as a "scratch rig" for the instanced
 * crowd (its part matrices are copied into InstancedMeshes).
 */

export const PART_NAMES = [
  'pelvis',
  'torso',
  'head',
  'hat',
  'upperArmL',
  'forearmL',
  'upperArmR',
  'forearmR',
  'thighL',
  'shinL',
  'footL',
  'thighR',
  'shinR',
  'footR',
  'guitar',
] as const;
export type PartName = (typeof PART_NAMES)[number];

export type PartSlot = 'skin' | 'shirt' | 'pants' | 'shoes' | 'hat' | 'prop';
export const PART_SLOT: Record<PartName, PartSlot> = {
  pelvis: 'pants',
  torso: 'shirt',
  head: 'skin',
  hat: 'hat',
  upperArmL: 'shirt',
  forearmL: 'skin',
  upperArmR: 'shirt',
  forearmR: 'skin',
  thighL: 'pants',
  shinL: 'pants',
  footL: 'shoes',
  thighR: 'pants',
  shinR: 'pants',
  footR: 'shoes',
  guitar: 'prop',
};

export const RIG = {
  hipHeight: 0.98,
  shoulderX: 0.26,
  shoulderY: 0.47,
  neckY: 0.52,
  hipX: 0.11,
};

/** Box with its pivot at the top centre (hangs down along -y). */
function hanging(w: number, h: number, d: number, dy = 0, dz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, -h / 2 + dy, dz);
  return g;
}

/** Remap UVs so only the front (+z) face shows the texture; others sample a corner pixel. */
function frontOnlyUV(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each).
  for (let face = 0; face < 6; face++) {
    if (face === 4) continue;
    for (let v = 0; v < 4; v++) uv.setXY(face * 4 + v, 0.04, 0.96);
  }
  uv.needsUpdate = true;
  return g;
}

let geometries: Record<PartName, THREE.BufferGeometry> | null = null;

export function partGeometries(): Record<PartName, THREE.BufferGeometry> {
  if (geometries) return geometries;
  const torso = new THREE.BoxGeometry(0.42, 0.52, 0.24);
  torso.translate(0, 0.26, 0);
  frontOnlyUV(torso);
  const head = new THREE.BoxGeometry(0.25, 0.27, 0.25);
  head.translate(0, 0.15, 0.01);
  frontOnlyUV(head);
  const hat = new THREE.BoxGeometry(0.27, 0.09, 0.27);
  hat.translate(0, 0.29, 0);
  const brim = new THREE.BoxGeometry(0.22, 0.03, 0.14);
  brim.translate(0, 0.25, 0.18);
  const pelvis = new THREE.BoxGeometry(0.38, 0.16, 0.23);
  pelvis.translate(0, -0.04, 0);
  // Guitar in torso-local space: body at the belly, neck pointing up-left.
  const gBody = new THREE.BoxGeometry(0.34, 0.26, 0.06);
  gBody.translate(-0.04, 0.12, 0.17);
  const gNeck = new THREE.BoxGeometry(0.06, 0.06, 0.55);
  gNeck.rotateY(Math.PI / 2);
  gNeck.rotateZ(0.5);
  gNeck.translate(0.28, 0.29, 0.17);
  geometries = {
    pelvis,
    torso,
    head,
    hat: mergeBoxes([hat, brim]),
    upperArmL: hanging(0.12, 0.3, 0.12),
    forearmL: hanging(0.1, 0.36, 0.1),
    upperArmR: hanging(0.12, 0.3, 0.12),
    forearmR: hanging(0.1, 0.36, 0.1),
    thighL: hanging(0.17, 0.45, 0.18),
    shinL: hanging(0.14, 0.44, 0.15),
    footL: hanging(0.14, 0.08, 0.27, -0.44, 0.05),
    thighR: hanging(0.17, 0.45, 0.18),
    shinR: hanging(0.14, 0.44, 0.15),
    footR: hanging(0.14, 0.08, 0.27, -0.44, 0.05),
    guitar: mergeBoxes([gBody, gNeck]),
  };
  return geometries;
}

/** Merge non-indexed copies of simple geometries (avoids an addon import). */
function mergeBoxes(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => p.toNonIndexed());
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const arrays = flat.map((p) => p.getAttribute(name).array as Float32Array);
    const size = flat[0]!.getAttribute(name).itemSize;
    const total = arrays.reduce((n, a) => n + a.length, 0);
    const merged = new Float32Array(total);
    let o = 0;
    for (const a of arrays) {
      merged.set(a, o);
      o += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(merged, size));
  }
  return out;
}

export class CharacterRig {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly joints: Record<JointName, THREE.Group>;
  readonly parts: Record<PartName, THREE.Mesh>;

  constructor(materials: Partial<Record<PartName, THREE.Material>>, fallback: THREE.Material) {
    const geo = partGeometries();
    const j = (name: JointName) => {
      const g = new THREE.Group();
      g.name = name;
      return g;
    };
    this.joints = {
      spine: j('spine'),
      neck: j('neck'),
      shoulderL: j('shoulderL'),
      elbowL: j('elbowL'),
      shoulderR: j('shoulderR'),
      elbowR: j('elbowR'),
      hipL: j('hipL'),
      kneeL: j('kneeL'),
      hipR: j('hipR'),
      kneeR: j('kneeR'),
    };
    const J = this.joints;
    this.root.add(this.body);
    this.body.rotation.order = 'YXZ';
    this.body.add(J.spine, J.hipL, J.hipR);
    J.spine.position.set(0, 0.02, 0);
    J.spine.add(J.neck, J.shoulderL, J.shoulderR);
    J.neck.position.set(0, RIG.neckY, 0);
    J.shoulderL.position.set(RIG.shoulderX, RIG.shoulderY, 0);
    J.shoulderR.position.set(-RIG.shoulderX, RIG.shoulderY, 0);
    J.shoulderL.add(J.elbowL);
    J.shoulderR.add(J.elbowR);
    J.elbowL.position.set(0, -0.29, 0);
    J.elbowR.position.set(0, -0.29, 0);
    J.hipL.position.set(RIG.hipX, -0.04, 0);
    J.hipR.position.set(-RIG.hipX, -0.04, 0);
    J.hipL.add(J.kneeL);
    J.hipR.add(J.kneeR);
    J.kneeL.position.set(0, -0.44, 0);
    J.kneeR.position.set(0, -0.44, 0);

    const mesh = (name: PartName, parent: THREE.Object3D) => {
      const m = new THREE.Mesh(geo[name], materials[name] ?? fallback);
      m.name = name;
      parent.add(m);
      return m;
    };
    this.parts = {
      pelvis: mesh('pelvis', this.body),
      torso: mesh('torso', J.spine),
      head: mesh('head', J.neck),
      hat: mesh('hat', J.neck),
      upperArmL: mesh('upperArmL', J.shoulderL),
      forearmL: mesh('forearmL', J.elbowL),
      upperArmR: mesh('upperArmR', J.shoulderR),
      forearmR: mesh('forearmR', J.elbowR),
      thighL: mesh('thighL', J.hipL),
      shinL: mesh('shinL', J.kneeL),
      footL: mesh('footL', J.kneeL),
      thighR: mesh('thighR', J.hipR),
      shinR: mesh('shinR', J.kneeR),
      footR: mesh('footR', J.kneeR),
      guitar: mesh('guitar', J.spine),
    };
  }

  /** Apply a pose plus world placement. */
  apply(pose: Pose, x: number, y: number, z: number, yaw: number, height = 1, build = 1): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
    this.root.scale.set(build, height, build);
    this.body.position.set(pose[ROOT_INDEX.x]!, RIG.hipHeight + pose[ROOT_INDEX.y]!, pose[ROOT_INDEX.z]!);
    this.body.rotation.set(pose[ROOT_INDEX.pitch]!, pose[ROOT_INDEX.yaw]!, pose[ROOT_INDEX.roll]!);
    for (const name in this.joints) {
      const i = JOINT_INDEX[name as JointName];
      this.joints[name as JointName].rotation.set(pose[i]!, pose[i + 1]!, pose[i + 2]!);
    }
  }
}
