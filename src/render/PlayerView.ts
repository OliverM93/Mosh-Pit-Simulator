import * as THREE from 'three';
import { Animator } from '../animation/Animator';
import { PLAYER_APPEARANCE, type Appearance } from '../data/appearance';
import type { PitSession } from '../gameplay/PitSession';
import { CharacterRig, singleCharacterMaterials } from './CharacterRig';
import { resolveLook } from './characterParts';
import type { SkinnedCharacter } from './characters';
import { basic, lambert } from './ps1';

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
  private readonly build: number;
  private readonly height: number;

  private readonly skinned: SkinnedCharacter | null;
  /** Wall-clock time for looping idle (mocap idles are not beat-based). */
  private clock = 0;

  constructor(appearance: Appearance = PLAYER_APPEARANCE, detail = 1, skinned: SkinnedCharacter | null = null) {
    this.skinned = skinned;
    // A touch of self-illumination keeps the player readable in the dark pit.
    const mats = singleCharacterMaterials(resolveLook(appearance), 0x2a2420);
    this.rig = new CharacterRig(mats, lambert({}), detail);
    const look = resolveLook(appearance);
    for (const name of Object.keys(look) as (keyof typeof look)[]) this.rig.parts[name].visible = look[name].visible;
    this.rig.root.scale.set(appearance.build, appearance.height, appearance.build);
    this.build = appearance.build;
    this.height = appearance.height;
    if (skinned) {
      skinned.setShadows(true, true);
      this.group.add(skinned.object);
    } else {
      this.group.add(this.rig.root);
    }

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
    this.clock += dt;
    // What to show: [clip, instance key, phase, loop, fade].
    let clip: string;
    let key: string;
    let phase: number;
    let mirror = false;
    let loop = false;
    let fade = 0.12;
    if (s.moves.isBailing) {
      [clip, key, phase, fade] = ['bail', `bail:${this.bailStart}`, (t - this.bailStart) / Math.max(0.1, this.bailUntil - this.bailStart), 0.08];
    } else if (move) {
      [clip, key, phase, mirror, fade] = [move.def.clip, `${move.def.id}:${move.startTime}`, s.moves.progress(t), move.mirror, 0.1];
    } else {
      const speed = p.speed;
      loop = true;
      fade = 0.2;
      if (speed > 3.6) [clip, key, phase] = ['run', 'run', p.stride / 2.6];
      else if (speed > 0.45) [clip, key, phase] = ['walk', 'walk', p.stride / 1.5];
      else [clip, key, phase] = ['idle', 'idle', this.skinned ? this.clock / 2.5 : s.timeline.beatAt(Math.max(0, t))];
    }
    if (this.skinned) {
      const sk = this.skinned;
      sk.play(sk.resolve(clip, mirror), key + (mirror ? ':m' : ''), fade);
      sk.setPhase(phase, loop);
      sk.update(dt);
      sk.object.position.set(p.x, 0, p.z);
      sk.object.rotation.y = p.yaw;
    } else {
      this.animator.play(clip, key, mirror, fade * 0.7);
      this.animator.update(dt, phase);
      this.rig.apply(this.animator.pose, p.x, p.y, p.z, p.yaw, this.height, this.build);
    }

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
