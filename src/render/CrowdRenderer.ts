import * as THREE from 'three';
import { Animator } from '../animation/Animator';
import type { CrowdAgent } from '../gameplay/crowd/CrowdSim';
import { CharacterRig, PART_NAMES, PART_SLOT, partGeometries, type PartName } from './CharacterRig';
import { lambert } from './ps1';
import { clothTexture, faceTexture } from './textures';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Draws the whole crowd + band with one InstancedMesh per body part
 * (~15 draw calls total regardless of crowd size). Each agent's pose is
 * evaluated on a shared scratch rig whose part matrices are copied over.
 */
export class CrowdRenderer {
  readonly group = new THREE.Group();
  private readonly meshes: Record<PartName, THREE.InstancedMesh>;
  private readonly scratch: CharacterRig;
  private readonly animators: Animator[] = [];
  private readonly agents: readonly CrowdAgent[];
  private readonly tmpColor = new THREE.Color();

  constructor(agents: readonly CrowdAgent[]) {
    this.agents = agents;
    const n = agents.length;
    const geo = partGeometries();
    const cloth = lambert({ map: clothTexture() });
    const skin = lambert({ map: faceTexture() });
    const plain = lambert({});
    this.meshes = {} as Record<PartName, THREE.InstancedMesh>;
    for (const name of PART_NAMES) {
      const mat = name === 'head' ? skin : PART_SLOT[name] === 'skin' || PART_SLOT[name] === 'prop' ? plain : cloth;
      const mesh = new THREE.InstancedMesh(geo[name], mat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.meshes[name] = mesh;
      this.group.add(mesh);
    }
    this.scratch = new CharacterRig({}, plain);
    for (let i = 0; i < n; i++) {
      this.animators.push(new Animator());
      this.applyColors(i, agents[i]!);
    }
    for (const name of PART_NAMES) this.meshes[name].instanceColor!.needsUpdate = true;
  }

  private applyColors(i: number, a: CrowdAgent): void {
    const ap = a.appearance;
    for (const name of PART_NAMES) {
      const slot = PART_SLOT[name];
      const hex = slot === 'skin' ? ap.skin : slot === 'shirt' ? ap.shirt : slot === 'pants' ? ap.pants : slot === 'shoes' ? ap.shoes : slot === 'hat' ? (ap.hat ?? 0) : a.band === 'bass' ? 0x1a3a8a : 0x8a1010;
      this.meshes[name].setColorAt(i, this.tmpColor.setHex(hex));
    }
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
      if (hide) {
        for (const name of PART_NAMES) this.meshes[name].setMatrixAt(i, ZERO);
        continue;
      }
      rig.apply(pose, a.x, a.y, a.z, a.yaw, a.appearance.height, a.appearance.build);
      rig.root.updateMatrixWorld(true);
      for (const name of PART_NAMES) {
        const hidden = (name === 'hat' && a.appearance.hat === null) || (name === 'guitar' && a.band !== 'guitar' && a.band !== 'bass');
        this.meshes[name].setMatrixAt(i, hidden ? ZERO : rig.parts[name].matrixWorld);
      }
    }
    for (const name of PART_NAMES) this.meshes[name].instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const name of PART_NAMES) this.meshes[name].dispose();
  }
}
