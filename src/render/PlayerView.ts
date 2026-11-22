import * as THREE from 'three';
import { clamp, smoothstep } from '../core/math';
import { MOVE_TUNING, type ActiveMove } from '../gameplay/MoveController';
import type { PitSession } from '../gameplay/PitSession';
import type { AnimationController, ClipPart } from './AnimationController';
import { basic } from './ps1';

/** Locomotion blend: speeds (m/s) and stride lengths (m per clip cycle) of the mocap walk/run. */
const LOCO = { walkFrom: 0.15, walkFull: 1.4, runFrom: 3.3, runFull: 5.6, walkStride: 1.8, runStride: 3.1 };
/** Fade times (s). */
const FADE = { intoMove: 0.08, outOfMove: 0.2, upper: 0.12, bail: 0.06, getUp: 0.5 };

/**
 * The player's character: drives the layered AnimationController from
 * gameplay state (locomotion speed, running moves, bail) and draws the
 * space ring (green = room for big moves, red = crash risk).
 */
export class PlayerView {
  readonly group = new THREE.Group();
  private readonly anim: AnimationController;
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly blob: THREE.Mesh | null;
  private clock = 0;
  private cycle = 0;

  constructor(anim: AnimationController, realShadows: boolean) {
    this.anim = anim;
    anim.setShadows(true, true);
    this.group.add(anim.object);
    this.ringMat = basic({ color: 0x40ff80, transparent: true, opacity: 0.35, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.02, 40), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.group.add(this.ring);
    this.blob = realShadows ? null : new THREE.Mesh(new THREE.CircleGeometry(0.38, 12), basic({ color: 0, transparent: true, opacity: 0.45, depthWrite: false }));
    if (this.blob) {
      this.blob.rotation.x = -Math.PI / 2;
      this.group.add(this.blob);
    }
  }

  update(dt: number, s: PitSession): void {
    const mv = s.movement;
    const t = s.songTime;
    const a = this.anim;
    this.clock += dt;

    // Locomotion source: idle / walk / run weighted by speed, one shared cycle phase.
    const sp = mv.speed;
    const walk = smoothstep(clamp((sp - LOCO.walkFrom) / (LOCO.walkFull - LOCO.walkFrom), 0, 1));
    const run = smoothstep(clamp((sp - LOCO.runFrom) / (LOCO.runFull - LOCO.runFrom), 0, 1));
    this.cycle += (dt * sp) / (LOCO.walkStride + (LOCO.runStride - LOCO.walkStride) * run);
    const phase = this.cycle - Math.floor(this.cycle);
    const loco: ClipPart[] = [
      { clip: 'idle', time: (this.clock / a.duration('idle')) % 1 * a.duration('idle'), weight: 1 - walk },
      { clip: 'walk', time: phase * a.duration('walk'), weight: walk * (1 - run) },
      { clip: 'run', time: phase * a.duration('run'), weight: walk * run },
    ];

    if (s.moves.isBailing(t)) {
      const start = s.moves.bailUntil - MOVE_TUNING.bailSec;
      const p = clamp((t - start) / MOVE_TUNING.bailSec, 0, 1);
      const part = [{ clip: 'bail', time: p * a.duration('bail'), weight: 1 }];
      a.want('lower', `bail:${start}`, part, FADE.bail);
      a.want('upper', `bail:${start}`, part, FADE.bail);
    } else {
      const full = s.moves.full;
      const upper = s.moves.upper;
      if (full) {
        const part = [this.movePart(full, s)];
        a.want('lower', `m${full.seq}`, part, FADE.intoMove);
        if (!upper) a.want('upper', `m${full.seq}`, part, FADE.intoMove);
      } else {
        // Getting up after a bail needs a slower blend than leaving a move.
        const fade = t < s.moves.bailUntil + 0.5 ? FADE.getUp : FADE.outOfMove;
        a.want('lower', 'loco', loco, fade);
        if (!upper) a.want('upper', 'loco', loco, fade);
      }
      if (upper) a.want('upper', `m${upper.seq}`, [this.movePart(upper, s)], FADE.upper);
    }
    a.update(dt);
    a.object.position.set(mv.x, 0, mv.z);
    a.object.rotation.y = mv.yaw;

    // Space ring: how much room there is for big moves.
    const free = s.crowd.freeSpace(mv.x, mv.z);
    this.ringMat.color.setHex(free > 1.2 ? 0x40ff80 : free > 0.75 ? 0xffd040 : 0xff3030);
    this.ring.position.set(mv.x, 0.02, mv.z);
    if (this.blob) {
      const k = Math.max(0.4, 1 - mv.y * 0.8);
      this.blob.scale.set(k, k, k);
      this.blob.position.set(mv.x, 0.015, mv.z);
    }
  }

  /** Clip time from move progress (gameplay owns the timing; the clip range cuts slow wind-ups). */
  private movePart(m: ActiveMove, s: PitSession): ClipPart {
    const clip = this.anim.resolve(m.def.clip, m.mirror);
    const [r0, r1] = m.def.clipRange;
    const p = s.moves.progress(m, s.songTime);
    return { clip, time: (r0 + (r1 - r0) * p) * this.anim.duration(clip), weight: 1 };
  }
}
