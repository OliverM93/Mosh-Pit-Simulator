import { approach, clamp, dampAngle, length2 } from '../core/math';
import type { ActiveMove } from './MoveSystem';

export const PLAYER_TUNING = {
  radius: 0.33,
  walkSpeed: 2.9,
  sprintSpeed: 5.2,
  accel: 20,
  decel: 14,
  turnRate: 14,
  gravity: 26,
  /** Sprint this long right before an advanced move = run-up bonus. */
  runUpMinSec: 0.35,
  runUpGraceSec: 0.35,
};

export interface PlayerInput {
  /** World-space desired direction (already camera-relative), length 0..1. */
  moveX: number;
  moveZ: number;
  sprint: boolean;
  /** Camera yaw (for face-camera moves). */
  cameraYaw: number;
}

/**
 * Kinematic player body on the pit floor. Position is x/z on the floor,
 * y is jump height. Facing yaw 0 = +z.
 */
export class Player {
  x = 0;
  z = 0;
  y = 0;
  vx = 0;
  vz = 0;
  vy = 0;
  yaw = Math.PI; // face the stage (-z)
  sprintTime = 0;
  lastSprintTime = -Infinity;
  /** Distance walked, drives the run cycle. */
  stride = 0;
  private moveDirX = 0;
  private moveDirZ = 1;

  get speed(): number {
    return length2(this.vx, this.vz);
  }

  get airborne(): boolean {
    return this.y > 0.001 || this.vy > 0;
  }

  /** Did the player sprint long enough right before `songTime`? */
  hasRunUp(now: number): boolean {
    return this.sprintTime >= PLAYER_TUNING.runUpMinSec || now - this.lastSprintTime <= PLAYER_TUNING.runUpGraceSec;
  }

  /** Called when a move starts: set facing / launch jumps. */
  beginMove(move: ActiveMove, input: PlayerInput): void {
    const def = move.def;
    if (def.faceCamera) {
      this.yaw = input.cameraYaw;
    } else if (def.rootMotion && def.rootMotion.forward > 0 && length2(input.moveX, input.moveZ) > 0.2) {
      this.yaw = Math.atan2(input.moveX, input.moveZ);
    }
    if (def.jumpHeight) {
      this.aimJump(def.jumpHeight, Math.max(0.1, move.endTime - move.startTime));
    }
  }

  /** Hop converted to an air move: re-aim the arc to land at the new end time. */
  retargetJump(move: ActiveMove, now: number): void {
    this.aimJump(move.def.jumpHeight ?? 0.6, Math.max(0.1, move.endTime - now));
  }

  /**
   * Ballistic arc from the current height that peaks at `height` and lands
   * after exactly `T` seconds – so jumps always land on the beat grid.
   */
  private aimJump(height: number, T: number): void {
    const y = this.y;
    const h = Math.max(height, y + 0.05);
    const g = ((2 * h - y + 2 * Math.sqrt(h * (h - y))) * 2) / (T * T);
    this.jumpGravity = g;
    this.vy = (0.5 * g * T * T - y) / T;
  }

  private jumpGravity = PLAYER_TUNING.gravity;

  update(dt: number, now: number, input: PlayerInput, move: ActiveMove | null, bailing: boolean): void {
    const control = bailing ? 0.15 : move ? move.def.moveControl : 1;
    const inMag = Math.min(1, length2(input.moveX, input.moveZ));
    const sprinting = input.sprint && inMag > 0.3 && !move && !bailing;
    const maxSpeed = (sprinting ? PLAYER_TUNING.sprintSpeed : PLAYER_TUNING.walkSpeed) * control;

    const tvx = input.moveX * maxSpeed;
    const tvz = input.moveZ * maxSpeed;
    const rate = inMag > 0.05 ? PLAYER_TUNING.accel : PLAYER_TUNING.decel;
    this.vx = approach(this.vx, tvx, rate * dt);
    this.vz = approach(this.vz, tvz, rate * dt);

    // Root motion of the current move (spread evenly over its length).
    let rmx = 0;
    let rmz = 0;
    if (move && move.def.rootMotion) {
      const len = Math.max(0.05, move.endTime - move.startTime);
      const fwd = move.def.rootMotion.forward / len;
      const side = (move.def.rootMotion.side / len) * (move.mirror ? -1 : 1);
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      // Character right = (-cos, sin) when facing (sin, cos).
      rmx = sin * fwd - cos * side;
      rmz = cos * fwd + sin * side;
    }

    this.x += (this.vx + rmx) * dt;
    this.z += (this.vz + rmz) * dt;

    if (sprinting && this.speed > PLAYER_TUNING.walkSpeed) {
      this.sprintTime += dt;
      this.lastSprintTime = now;
    } else {
      this.sprintTime = 0;
    }

    const sp = this.speed;
    if (sp > 0.2) {
      this.moveDirX = this.vx / sp;
      this.moveDirZ = this.vz / sp;
      this.stride += sp * dt;
      if (control > 0.5 && !(move && move.def.faceCamera)) {
        this.yaw = dampAngle(this.yaw, Math.atan2(this.moveDirX, this.moveDirZ), PLAYER_TUNING.turnRate * control, dt);
      }
    }

    // Vertical.
    if (this.y > 0 || this.vy > 0) {
      this.vy -= this.jumpGravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.jumpGravity = PLAYER_TUNING.gravity;
      }
    }
    if (move && move.airborne && now >= move.endTime - 0.02) {
      this.y = 0;
      this.vy = 0;
    }
  }

  /** Keep the player inside an axis-aligned room rectangle. */
  clampTo(minX: number, maxX: number, minZ: number, maxZ: number): void {
    const r = PLAYER_TUNING.radius;
    this.x = clamp(this.x, minX + r, maxX - r);
    this.z = clamp(this.z, minZ + r, maxZ - r);
  }

  push(dx: number, dz: number): void {
    this.x += dx;
    this.z += dz;
  }

  reset(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.y = this.vx = this.vz = this.vy = 0;
    this.yaw = Math.PI;
    this.sprintTime = 0;
    this.lastSprintTime = -Infinity;
    this.stride = 0;
  }
}
