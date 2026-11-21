import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math';
import type { VenueDefinition } from '../data/venueTypes';

/**
 * Third-person orbit camera. Mouse / right stick orbit, gentle auto-follow
 * while running, kept inside the room and under the (low!) ceiling.
 */
export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  yaw = Math.PI;
  pitch = 0.32;
  distance = 4.3;
  private shake = 0;
  private idleLook = 0;
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5, maxY: 3 };
  private fovKick = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 60);
  }

  setVenue(v: VenueDefinition): void {
    const m = 0.25;
    this.bounds = {
      minX: -v.room.width / 2 + m,
      maxX: v.room.width / 2 - m,
      minZ: -v.room.depth / 2 + m,
      maxZ: v.room.depth / 2 - m,
      maxY: v.room.height - 0.2,
    };
    // Low ceilings need a flatter camera.
    this.pitch = v.room.height < 3.5 ? 0.3 : 0.4;
  }

  /** Mouse/stick look in radians. */
  look(dx: number, dy: number): void {
    if (dx !== 0 || dy !== 0) this.idleLook = 0;
    this.yaw -= dx;
    this.pitch = clamp(this.pitch + dy, -0.15, 0.9);
  }

  addShake(amount: number): void {
    this.shake = Math.min(0.5, this.shake + amount);
  }

  kickFov(amount: number): void {
    this.fovKick = Math.max(this.fovKick, amount);
  }

  snapBehind(x: number, z: number, yaw: number): void {
    this.yaw = yaw;
    this.target.set(x, 1.1, z);
    this.update(1, x, 0, z, 0, 0, true);
  }

  update(dt: number, px: number, py: number, pz: number, vx: number, vz: number, snap = false): void {
    this.idleLook += dt;
    const speed = Math.hypot(vx, vz);
    if (this.idleLook > 1.2 && speed > 2.5) {
      const moveYaw = Math.atan2(vx, vz);
      const fwdDot = Math.cos(moveYaw - this.yaw);
      if (fwdDot > -0.2) this.yaw = dampAngle(this.yaw, moveYaw, 0.9, dt);
    }
    const ty = 1.15 + py * 0.5;
    if (snap) this.target.set(px, ty, pz);
    else {
      this.target.x = damp(this.target.x, px, 10, dt);
      this.target.y = damp(this.target.y, ty, 6, dt);
      this.target.z = damp(this.target.z, pz, 10, dt);
    }
    const cp = Math.cos(this.pitch);
    let dist = this.distance;
    // Pull in when the room is in the way.
    for (let i = 0; i < 4; i++) {
      this.desired.set(
        this.target.x - Math.sin(this.yaw) * cp * dist,
        this.target.y + Math.sin(this.pitch) * dist,
        this.target.z - Math.cos(this.yaw) * cp * dist,
      );
      const b = this.bounds;
      if (this.desired.x > b.minX && this.desired.x < b.maxX && this.desired.z > b.minZ && this.desired.z < b.maxZ) break;
      dist *= 0.8;
    }
    const b = this.bounds;
    this.desired.x = clamp(this.desired.x, b.minX, b.maxX);
    this.desired.z = clamp(this.desired.z, b.minZ, b.maxZ);
    this.desired.y = clamp(this.desired.y, 0.4, b.maxY);

    const cam = this.camera;
    if (snap) cam.position.copy(this.desired);
    else cam.position.lerp(this.desired, 1 - Math.exp(-14 * dt));
    this.shake = Math.max(0, this.shake - dt * 1.8);
    if (this.shake > 0) {
      const s = this.shake * this.shake;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    this.fovKick = Math.max(0, this.fovKick - dt * 3);
    cam.fov = 62 + this.fovKick * 8;
    cam.updateProjectionMatrix();
    cam.lookAt(this.target);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
