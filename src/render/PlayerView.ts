import * as THREE from 'three';
import { Animator } from '../animation/Animator';
import type { PitSession } from '../gameplay/PitSession';
import { CharacterRig, type PartName } from './CharacterRig';
import { basic, lambert } from './ps1';
import { clothTexture, faceTexture, shirtTexture } from './textures';

export interface PlayerLook {
  skin: number;
  shirt: string;
  shirtInk: string;
  shirtText: string;
  pants: number;
  shoes: number;
  hat: number | null;
}

export const DEFAULT_LOOK: PlayerLook = {
  skin: 0xe0ac85,
  shirt: '#f2f2f2',
  shirtInk: '#c01818',
  shirtText: 'MOSH',
  pants: 0x4d5532,
  shoes: 0xf0f0f0,
  hat: 0xb01010,
};

/** The player's character: rig, animator, blob shadow and the "space ring". */
export class PlayerView {
  readonly group = new THREE.Group();
  readonly rig: CharacterRig;
  private readonly animator = new Animator();
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly shadow: THREE.Mesh;
  private ringPulse = 0;
  bailStart = -Infinity;
  bailUntil = -Infinity;

  constructor(look: PlayerLook = DEFAULT_LOOK) {
    const cloth = clothTexture();
    const mats: Partial<Record<PartName, THREE.Material>> = {
      torso: lambert({ map: shirtTexture(look.shirtText, look.shirtInk, look.shirt) }),
      upperArmL: lambert({ map: cloth, color: look.shirt }),
      upperArmR: lambert({ map: cloth, color: look.shirt }),
      head: lambert({ map: faceTexture(), color: look.skin }),
      forearmL: lambert({ color: look.skin }),
      forearmR: lambert({ color: look.skin }),
      hat: lambert({ color: look.hat ?? 0 }),
      footL: lambert({ color: look.shoes }),
      footR: lambert({ color: look.shoes }),
    };
    const pants = lambert({ map: cloth, color: look.pants });
    for (const p of ['pelvis', 'thighL', 'thighR', 'shinL', 'shinR'] as const) mats[p] = pants;
    // A touch of self-illumination keeps the player readable in the dark pit.
    for (const m of [...Object.values(mats), pants]) (m as THREE.MeshLambertMaterial).emissive.setHex(0x262222);
    this.rig = new CharacterRig(mats, pants);
    this.rig.parts.guitar.visible = false;
    this.rig.parts.hat.visible = look.hat !== null;
    this.group.add(this.rig.root);

    this.ringMat = basic({ color: 0x40ff80, transparent: true, opacity: 0.55, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.15, 24), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.38, 10), basic({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.015;
    this.group.add(this.ring, this.shadow);
  }

  onPulse(): void {
    this.ringPulse = 1;
  }

  update(dt: number, s: PitSession): void {
    const p = s.player;
    const t = s.songTime;
    const move = s.moves.current;
    if (s.moves.isBailing) {
      this.animator.play('bail', `bail:${this.bailStart}`, false, 0.05);
      this.animator.update(dt, (t - this.bailStart) / Math.max(0.1, this.bailUntil - this.bailStart));
    } else if (move) {
      this.animator.play(move.def.clip, `${move.def.id}:${move.startTime}`, move.mirror, 0.07);
      this.animator.update(dt, s.moves.progress(t));
    } else {
      const speed = p.speed;
      if (speed > 3.6) {
        this.animator.play('run', 'run', false, 0.15);
        this.animator.update(dt, p.stride / 2.6);
      } else if (speed > 0.45) {
        this.animator.play('walk', 'walk', false, 0.15);
        this.animator.update(dt, p.stride / 1.5);
      } else {
        this.animator.play('idle', 'idle', false, 0.18);
        this.animator.update(dt, s.timeline.beatAt(Math.max(0, t)));
      }
    }
    this.rig.apply(this.animator.pose, p.x, p.y, p.z, p.yaw);

    // Space ring: green = room for big moves, red = cramped. Pulses on the beat.
    const free = s.crowd.freeSpace(p.x, p.z);
    const color = free > 1.2 ? 0x40ff80 : free > 0.75 ? 0xffd040 : 0xff3030;
    this.ringMat.color.setHex(color);
    this.ringPulse = Math.max(0, this.ringPulse - dt * 5);
    const scale = 1 + this.ringPulse * 0.12;
    this.ring.scale.set(scale, scale, scale);
    this.ringMat.opacity = 0.35 + this.ringPulse * 0.4;
    this.ring.position.set(p.x, 0.02, p.z);
    const sh = Math.max(0.3, 1 - p.y * 0.6);
    this.shadow.scale.set(sh, sh, sh);
    this.shadow.position.set(p.x, 0.015, p.z);
  }
}
