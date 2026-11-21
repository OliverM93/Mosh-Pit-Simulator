import * as THREE from 'three';
import { Animator } from '../animation/Animator';
import type { CrowdAgent } from '../gameplay/crowd/CrowdSim';
import { atlasFor, CharacterRig, characterMaterial } from './CharacterRig';
import { PART_DEFS, partGeometries, resolveLook, type PartName } from './characterParts';
import { cellOffset } from './characterTextures';
import { lambert } from './ps1';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Draws the whole crowd + band with one InstancedMesh per body part
 * (constant draw calls regardless of crowd size). Each agent's pose is
 * evaluated on a shared scratch rig whose part matrices are copied over.
 * Per-instance colour and texture-atlas cell give every person their own
 * outfit, tattoos and face.
 */
export class CrowdRenderer {
  readonly group = new THREE.Group();
  private readonly meshes = {} as Record<PartName, THREE.InstancedMesh>;
  private readonly visible: Record<PartName, boolean>[] = [];
  private readonly scratch: CharacterRig;
  private readonly animators: Animator[] = [];
  private readonly agents: readonly CrowdAgent[];

  constructor(agents: readonly CrowdAgent[]) {
    this.agents = agents;
    const n = agents.length;
    const geo = partGeometries();
    const materials = new Map<string, THREE.Material>();
    for (const def of PART_DEFS) {
      let mat = materials.get(def.kind);
      if (!mat) materials.set(def.kind, (mat = characterMaterial(def.kind, true)));
      const g = geo[def.name].clone();
      if (atlasFor(def.kind)) g.setAttribute('instanceAtlas', new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2));
      const mesh = new THREE.InstancedMesh(g, mat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.meshes[def.name] = mesh;
      this.group.add(mesh);
    }
    this.scratch = new CharacterRig({}, lambert({}));
    const color = new THREE.Color();
    agents.forEach((a, i) => {
      this.animators.push(new Animator());
      const look = resolveLook(a.appearance, a.band);
      const vis = {} as Record<PartName, boolean>;
      for (const def of PART_DEFS) {
        const l = look[def.name];
        vis[def.name] = l.visible;
        const mesh = this.meshes[def.name];
        mesh.setColorAt(i, color.setHex(l.color));
        const atlas = atlasFor(def.kind);
        if (atlas) {
          const [u, v] = cellOffset(atlas, l.cell);
          (mesh.geometry.getAttribute('instanceAtlas') as THREE.InstancedBufferAttribute).setXY(i, u, v);
        }
      }
      this.visible.push(vis);
    });
    for (const def of PART_DEFS) this.meshes[def.name].instanceColor!.needsUpdate = true;
  }

  /**
   * @param focus the player position: bodies on the camera→player sight line
   *              are hidden so the player is never occluded.
   */
  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3): void {
    const camPos = camera.position;
    const rig = this.scratch;
    const sx = focus.x - camPos.x;
    const sz = focus.z - camPos.z;
    const len2 = Math.max(0.01, sx * sx + sz * sz);
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i]!;
      const anim = this.animators[i]!;
      // New clip instance → cross-fade. Dancers restart on every beat-locked move.
      const key = a.role === 'dancer' || a.role === 'ninja' ? `${a.clip}:${a.moveCount}` : `${a.clip}:${a.state}`;
      anim.play(a.clip, key, a.mirror, a.state === 'stumble' || a.state === 'shove' ? 0.05 : 0.15);
      const pose = anim.update(dt, a.phase);

      // Hide bodies that clip into the camera or stand on the sight line to the player.
      const dx = a.x - camPos.x;
      const dz = a.z - camPos.z;
      let hide = dx * dx + dz * dz < 0.8 && Math.abs(camPos.y - 1.2 - a.y) < 1.2;
      if (!hide && a.role !== 'surfer' && a.role !== 'band') {
        const t = (dx * sx + dz * sz) / len2;
        if (t > -0.05 && t < 0.82) {
          const ox = dx - sx * t;
          const oz = dz - sz * t;
          hide = ox * ox + oz * oz < 0.36;
        }
      }
      const vis = this.visible[i]!;
      if (hide) {
        for (const def of PART_DEFS) this.meshes[def.name].setMatrixAt(i, ZERO);
        continue;
      }
      rig.apply(pose, a.x, a.y, a.z, a.yaw, a.appearance.height, a.appearance.build);
      rig.root.updateMatrixWorld(true);
      for (const def of PART_DEFS) this.meshes[def.name].setMatrixAt(i, vis[def.name] ? rig.parts[def.name].matrixWorld : ZERO);
    }
    for (const def of PART_DEFS) this.meshes[def.name].instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const def of PART_DEFS) {
      this.meshes[def.name].geometry.dispose();
      this.meshes[def.name].dispose();
    }
  }
}
