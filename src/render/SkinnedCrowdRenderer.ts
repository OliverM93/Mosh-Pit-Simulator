import * as THREE from 'three';
import type { CrowdAgent } from '../gameplay/crowd/CrowdSim';
import { CROWD_VARIANTS, type CharacterLibrary, type SkinnedCharacter } from './characters';

/** Clips that repeat on the beat / continuously (everything else plays once per instance). */
const LOOPING = new Set([
  'bob', 'headbang', 'fist_pump', 'arms_crossed', 'jump_cheer', 'surf', 'idle',
  'band_vocals', 'band_vocals_heavy', 'band_guitar', 'band_guitar_heavy', 'band_drums',
]);
const BAND_VARIANT: Record<string, string> = { vocals: 'c4', guitar: 'c1', bass: 'c5', drums: 'c7' };

/**
 * Crowd + band as skinned Blender characters (D-025). One SkinnedCharacter
 * per agent (shared geometry/materials/clips), driven by CrowdSim's clip and
 * phase. Bodies blocking the camera→player sight line are hidden.
 */
export class SkinnedCrowdRenderer {
  readonly group = new THREE.Group();
  private readonly agents: readonly CrowdAgent[];
  private readonly chars: SkinnedCharacter[] = [];

  constructor(agents: readonly CrowdAgent[], lib: CharacterLibrary, shadows: boolean) {
    this.agents = agents;
    const guitarBody = new THREE.BoxGeometry(0.36, 0.27, 0.06);
    const guitarNeck = new THREE.BoxGeometry(0.62, 0.05, 0.04);
    for (const a of agents) {
      const variant = a.band ? BAND_VARIANT[a.band]! : CROWD_VARIANTS[(a.id * 7 + 3) % CROWD_VARIANTS.length]!;
      const c = lib.create(variant);
      const s = a.appearance.height;
      c.object.scale.setScalar(s);
      c.setShadows(false, shadows);
      if (a.band === 'guitar' || a.band === 'bass') {
        const mat = new THREE.MeshStandardMaterial({ color: a.band === 'bass' ? 0x1a3a8a : 0x8a1010, roughness: 0.35, metalness: 0.2 });
        const g = new THREE.Group();
        const body = new THREE.Mesh(guitarBody, mat);
        const neck = new THREE.Mesh(guitarNeck, new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.6 }));
        neck.position.set(-0.4, 0.12, 0);
        neck.rotation.z = -0.35;
        g.add(body, neck);
        g.position.set(0.02, 1.02, 0.17);
        g.rotation.z = 0.3;
        c.object.add(g);
      }
      this.chars.push(c);
      this.group.add(c.object);
    }
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3): void {
    const camPos = camera.position;
    const sx = focus.x - camPos.x;
    const sz = focus.z - camPos.z;
    const len2 = Math.max(0.01, sx * sx + sz * sz);
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i]!;
      const c = this.chars[i]!;
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
      c.object.visible = !hide;
      if (hide) continue;
      const key = a.role === 'dancer' || a.role === 'ninja' ? `${a.clip}:${a.moveCount}` : `${a.clip}:${a.state}`;
      const fade = a.state === 'stumble' || a.state === 'shove' ? 0.08 : 0.25;
      c.play(c.resolve(a.clip, a.mirror), key + (a.mirror ? ':m' : ''), fade);
      c.setPhase(a.phase, LOOPING.has(a.clip));
      c.update(dt);
      // Surfers: mocap/keyframe surf pose lies at hip height; lift onto the hands of the crowd.
      c.object.position.set(a.x, a.role === 'surfer' ? a.y - 0.6 : a.y, a.z);
      c.object.rotation.y = a.yaw;
    }
  }

  dispose(): void {
    this.group.clear();
  }
}
