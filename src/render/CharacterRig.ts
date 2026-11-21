import * as THREE from 'three';
import { JOINT_INDEX, ROOT_INDEX, type JointName, type Pose } from '../animation/pose';
import { PART_DEFS, partGeometries, type MaterialKind, type PartLook, type PartName } from './characterParts';
import { characterAtlases, cellOffset, type Atlas } from './characterTextures';
import { lambert } from './ps1';

export { PART_NAMES, type PartName } from './characterParts';

/** Joint layout (metres). Shared by player, crowd and band. */
export const RIG = {
  hipHeight: 1.0,
  shoulderX: 0.225,
  shoulderY: 0.47,
  neckY: 0.52,
  hipX: 0.105,
};

/**
 * Character skeleton: joints are Groups, body parts are meshes attached at
 * the joint pivots. Renders the player directly and serves as the "scratch
 * rig" for the instanced crowd (its part matrices are copied over).
 */
export class CharacterRig {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly joints: Record<JointName, THREE.Group>;
  readonly parts: Record<PartName, THREE.Mesh>;

  constructor(materials: Partial<Record<PartName, THREE.Material>>, fallback: THREE.Material) {
    const geo = partGeometries();
    const names: JointName[] = ['spine', 'neck', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'hipR', 'kneeR'];
    this.joints = Object.fromEntries(
      names.map((n) => {
        const g = new THREE.Group();
        g.name = n;
        return [n, g];
      }),
    ) as Record<JointName, THREE.Group>;
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

    const parts = {} as Record<PartName, THREE.Mesh>;
    for (const def of PART_DEFS) {
      const m = new THREE.Mesh(geo[def.name], materials[def.name] ?? fallback);
      m.name = def.name;
      (def.joint === 'body' ? this.body : J[def.joint]).add(m);
      parts[def.name] = m;
    }
    this.parts = parts;
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

/** Texture atlas used by a material kind (null = untextured). */
export function atlasFor(kind: MaterialKind): Atlas | null {
  const a = characterAtlases();
  switch (kind) {
    case 'shirt':
      return a.shirt;
    case 'pants':
      return a.pants;
    case 'skin':
      return a.skin;
    case 'face':
      return a.face;
    case 'cap':
      return a.cap;
    default:
      return null;
  }
}

/** Smooth-shaded character material (fighting-game look) for one kind; atlas-aware when instanced. */
export function characterMaterial(kind: MaterialKind, instanced: boolean, emissive = 0x000000): THREE.MeshLambertMaterial {
  const a = characterAtlases();
  const atlas = atlasFor(kind);
  const map = atlas ? atlas.texture : kind === 'shoe' ? a.shoe : kind === 'knit' ? a.knit : null;
  const mat = lambert({ map, flatShading: false, emissive }, instanced && atlas ? atlas : undefined);
  return mat;
}

/** Per-part materials for a single (non-instanced) character such as the player. */
export function singleCharacterMaterials(look: Record<PartName, PartLook>, emissive = 0x000000): Record<PartName, THREE.Material> {
  const out = {} as Record<PartName, THREE.Material>;
  for (const def of PART_DEFS) {
    const l = look[def.name];
    const mat = characterMaterial(def.kind, false, emissive);
    mat.color.setHex(l.color);
    const atlas = atlasFor(def.kind);
    if (atlas && mat.map) {
      const t = atlas.texture.clone();
      t.repeat.set(1 / atlas.cols, 1 / atlas.rows);
      const [u, v] = cellOffset(atlas, l.cell);
      t.offset.set(u, v);
      t.needsUpdate = true;
      mat.map = t;
    }
    out[def.name] = mat;
  }
  return out;
}
