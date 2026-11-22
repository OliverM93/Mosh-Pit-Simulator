import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle } from '../core/math';
import type { VenueDefinition } from '../data/venueTypes';

export const CAMERA_TUNING = {
  distance: 4.1,
  height: 1.3,
  /** Look-at point above the floor. */
  focusHeight: 1.15,
  /** Look ahead along the velocity (s). */
  lookAhead: 0.18,
  /** Yaw follow rate: base + per m/s of speed. */
  followBase: 0.6,
  followPerSpeed: 0.45,
  /** Running towards the camera: swing round slowly instead of flipping. */
  reverseAngle: 2.3,
  reverseRate: 0.5,
  /** Follow rate factor during moves (spins/flips must not whip the camera). */
  duringMove: 0.25,
  /** Manual look pauses auto-follow for this long. */
  manualHoldSec: 1.4,
  fov: 60,
};

/**
 * Third-person chase camera: slightly raised behind the player, follows the
 * direction of *travel* (not the body facing – spinkicks don't rotate it),
 * lags softly, stays inside the room and under the low ceiling.
 * Mouse / right stick can look around; auto-follow resumes after a moment.
 */
export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  yaw = Math.PI;
  private pitch = 0.22;
  private manual = 0;
  private shake = 0;
  private fovKick = 0;
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5, maxY: 3 };

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA_TUNING.fov, aspect, 0.1, 60);
  }

  setVenue(v: VenueDefinition): void {
    const m = 0.3;
    this.bounds = {
      minX: -v.room.width / 2 + m,
      maxX: v.room.width / 2 - m,
      minZ: -v.room.depth / 2 + m,
      maxZ: v.room.depth / 2 - m,
      maxY: v.room.height - 0.25,
    };
  }

  /** Mouse/stick look in radians. */
  look(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.manual = CAMERA_TUNING.manualHoldSec;
    this.yaw -= dx;
    this.pitch = clamp(this.pitch + dy, -0.05, 0.6);
  }

  addShake(amount: number): void {
    this.shake = Math.min(0.5, this.shake + amount);
  }

  kickFov(amount: number): void {
    this.fovKick = Math.max(this.fovKick, amount);
  }

  snapBehind(x: number, z: number, yaw: number): void {
    this.yaw = yaw;
    this.update(1, x, 0, z, yaw, 0, false, true);
  }

  /**
   * @param heading direction of travel (yaw), @param speed ground speed,
   * @param inMove a full-body move runs (follow gently).
   */
  update(dt: number, px: number, py: number, pz: number, heading: number, speed: number, inMove: boolean, snap = false): void {
    const T = CAMERA_TUNING;
    this.manual = Math.max(0, this.manual - dt);
    if (this.manual <= 0 && speed > 0.8) {
      const diff = wrapAngle(heading - this.yaw);
      let rate = T.followBase + speed * T.followPerSpeed;
      if (Math.abs(diff) > T.reverseAngle) rate = T.reverseRate;
      if (inMove) rate *= T.duringMove;
      this.yaw = dampAngle(this.yaw, heading, rate, dt);
      this.pitch = damp(this.pitch, 0.22, 1.5, dt);
    }

    const ax = Math.sin(heading) * speed * T.lookAhead;
    const az = Math.cos(heading) * speed * T.lookAhead;
    const ty = T.focusHeight + py * 0.4;
    if (snap) this.target.set(px + ax, ty, pz + az);
    else {
      this.target.x = damp(this.target.x, px + ax, 7, dt);
      this.target.y = damp(this.target.y, ty, 5, dt);
      this.target.z = damp(this.target.z, pz + az, 7, dt);
    }

    // Behind the player, pulled in when a wall is in the way.
    const b = this.bounds;
    let dist = T.distance;
    for (let i = 0; i < 5; i++) {
      this.desired.set(
        this.target.x - Math.sin(this.yaw) * dist,
        T.height + this.pitch * dist * 0.5 + py * 0.3,
        this.target.z - Math.cos(this.yaw) * dist,
      );
      if (this.desired.x > b.minX && this.desired.x < b.maxX && this.desired.z > b.minZ && this.desired.z < b.maxZ) break;
      dist *= 0.82;
    }
    this.desired.x = clamp(this.desired.x, b.minX, b.maxX);
    this.desired.z = clamp(this.desired.z, b.minZ, b.maxZ);
    this.desired.y = clamp(this.desired.y, 0.5, b.maxY);

    const cam = this.camera;
    if (snap) cam.position.copy(this.desired);
    else cam.position.lerp(this.desired, 1 - Math.exp(-9 * dt));
    this.shake = Math.max(0, this.shake - dt * 1.8);
    if (this.shake > 0) {
      const s = this.shake * this.shake;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    this.fovKick = Math.max(0, this.fovKick - dt * 3);
    cam.fov = T.fov + this.fovKick * 8 + Math.min(6, speed * 0.9);
    cam.updateProjectionMatrix();
    cam.lookAt(this.target);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
