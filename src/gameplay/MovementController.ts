import { clamp, dampAngle, length2, lerp, wrapAngle } from '../core/math';

export const MOVEMENT_TUNING = {
  radius: 0.33,
  walkSpeed: 3.1,
  sprintSpeed: 6.2,
  /** Acceleration up to walking speed, and beyond it while sprinting (run-up builds slowly). */
  accel: 16,
  sprintAccel: 4.5,
  /** Deceleration when releasing the stick / when above the target speed. */
  friction: 11,
  /** Braking when the stick points against the running direction (skid). */
  brake: 24,
  /** Stick more than this far (rad) from the heading at speed = skid instead of turn. */
  skidAngle: 2.2,
  /** Turn rate (rad/s) standing still → at full sprint: faster = wider arcs. */
  turnRateSlow: 16,
  turnRateFast: 4.2,
  /** Below this speed direction changes are instant pivots. */
  pivotSpeed: 0.6,
  /** Facing follows the heading at this rate. */
  faceRate: 14,
  /** Crowd contact correction is limited to this speed (m/s): bodies block, but never fling the player. */
  maxPushSpeed: 9,
};

export interface MovementInput {
  /** Desired direction in world space (camera-relative stick already rotated), length 0..1. */
  moveX: number;
  moveZ: number;
  sprint: boolean;
}

/** How the running move changes locomotion. `null` = free running. */
export interface MovementModifier {
  steer: number;
  speed: number;
  carry: number;
  /** Keep the facing (spins, cartwheels turn the body themselves). */
  lockFacing: boolean;
}

/**
 * Momentum-based locomotion in the style of a skateboarding game: speed and
 * heading are separate, turning gets wider with speed, reversing skids, and
 * sprinting slowly builds a run-up. Moves only scale these rules.
 */
export class MovementController {
  x = 0;
  z = 0;
  /** Ground speed (m/s) along `heading`. */
  speed = 0;
  /** Direction of travel (yaw, 0 = +z). */
  heading = Math.PI;
  /** Direction the body faces. */
  yaw = Math.PI;
  /** Height above the floor (driven by the move's air phase, for camera/shadow/collisions). */
  y = 0;
  /** True while braking against the running direction. */
  skidding = false;
  /** Distance travelled, drives the locomotion cycle. */
  stride = 0;
  private pushX = 0;
  private pushZ = 0;
  private sideVX = 0;
  private sideVZ = 0;

  get vx(): number {
    return Math.sin(this.heading) * this.speed + this.sideVX;
  }

  get vz(): number {
    return Math.cos(this.heading) * this.speed + this.sideVZ;
  }

  /** 0..1 share of full sprint speed – the "momentum" used for scoring and move selection. */
  get momentum(): number {
    return clamp(this.speed / MOVEMENT_TUNING.sprintSpeed, 0, 1);
  }

  reset(x: number, z: number, yaw = Math.PI): void {
    this.x = x;
    this.z = z;
    this.speed = this.y = this.stride = 0;
    this.heading = this.yaw = yaw;
    this.skidding = false;
    this.pushX = this.pushZ = this.sideVX = this.sideVZ = 0;
  }

  /** Extra sideways travel that fades out (cartwheels). Direction = world yaw. */
  addSideImpulse(yaw: number, speed: number): void {
    this.sideVX = Math.sin(yaw) * speed;
    this.sideVZ = Math.cos(yaw) * speed;
  }

  /** Turn the body to a yaw immediately (move setups like the cartwheel). */
  face(yaw: number): void {
    this.yaw = yaw;
  }

  /** Crowd contact for this step; applied speed-limited in `update`. */
  push(dx: number, dz: number): void {
    this.pushX += dx;
    this.pushZ += dz;
  }

  update(dt: number, input: MovementInput, mod: MovementModifier | null): void {
    const T = MOVEMENT_TUNING;
    const steer = mod?.steer ?? 1;
    const speedFactor = mod?.speed ?? 1;
    const carry = mod?.carry ?? 0;
    const mag = Math.min(1, length2(input.moveX, input.moveZ));
    this.skidding = false;

    if (mag > 0.1) {
      const want = Math.atan2(input.moveX, input.moveZ);
      const sprinting = input.sprint && !mod;
      const target = (sprinting ? T.sprintSpeed : T.walkSpeed) * mag * speedFactor;
      if (this.speed < T.pivotSpeed) {
        // Standing or slow: pivot straight into the new direction (immediate control).
        this.heading = dampAngle(this.heading, want, 30 * steer + 4, dt);
      } else {
        const diff = wrapAngle(want - this.heading);
        if (Math.abs(diff) > T.skidAngle && steer > 0.5) {
          this.skidding = true;
          this.speed = Math.max(0, this.speed - T.brake * dt);
        } else {
          const rate = lerp(T.turnRateSlow, T.turnRateFast, clamp(this.speed / T.sprintSpeed, 0, 1)) * steer;
          this.heading = wrapAngle(this.heading + clamp(diff, -rate * dt, rate * dt));
        }
      }
      if (!this.skidding) {
        if (this.speed < target) {
          const a = this.speed < T.walkSpeed ? T.accel : T.sprintAccel;
          this.speed = Math.min(target, this.speed + a * dt * Math.max(0.3, steer));
        } else {
          this.speed = Math.max(target, this.speed - T.friction * (1 - carry * 0.8) * dt);
        }
      }
    } else {
      this.speed = Math.max(0, this.speed - T.friction * (1 - carry * 0.85) * dt);
    }

    // Side impulse fades out.
    const sideDecay = Math.exp(-2.2 * dt);
    this.sideVX *= sideDecay;
    this.sideVZ *= sideDecay;

    // Crowd push, speed-limited.
    const pushLen = length2(this.pushX, this.pushZ);
    const maxPush = T.maxPushSpeed * dt;
    const k = pushLen > maxPush ? maxPush / pushLen : 1;
    const vx = this.vx;
    const vz = this.vz;
    this.x += vx * dt + this.pushX * k;
    this.z += vz * dt + this.pushZ * k;
    this.pushX = this.pushZ = 0;
    this.stride += length2(vx, vz) * dt;

    if (!mod?.lockFacing && this.speed > 0.15) this.yaw = dampAngle(this.yaw, this.heading, T.faceRate, dt);
  }

  /** Keep the body inside an axis-aligned rectangle; kills speed into walls. */
  clampTo(minX: number, maxX: number, minZ: number, maxZ: number): boolean {
    const r = MOVEMENT_TUNING.radius;
    const nx = clamp(this.x, minX + r, maxX - r);
    const nz = clamp(this.z, minZ + r, maxZ - r);
    const hit = nx !== this.x || nz !== this.z;
    if (hit) {
      this.speed *= 0.5;
      this.sideVX = this.sideVZ = 0;
    }
    this.x = nx;
    this.z = nz;
    return hit;
  }
}
