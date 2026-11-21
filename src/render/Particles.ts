import * as THREE from 'three';

const MAX = 160;

/** Pooled sweat/dust particles as screen-space squares (no textures). */
export class Particles {
  readonly points: THREE.Points;
  private readonly pos = new Float32Array(MAX * 3);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private next = 0;

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9 });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.pos.fill(-1000);
  }

  burst(x: number, y: number, z: number, count: number, speed = 2.5): void {
    for (let i = 0; i < count; i++) {
      const k = this.next;
      this.next = (this.next + 1) % MAX;
      this.pos[k * 3] = x;
      this.pos[k * 3 + 1] = y;
      this.pos[k * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.vel[k * 3] = Math.cos(a) * s;
      this.vel[k * 3 + 1] = 1 + Math.random() * 2.5;
      this.vel[k * 3 + 2] = Math.sin(a) * s;
      this.life[k] = 0.5 + Math.random() * 0.5;
    }
  }

  update(dt: number): void {
    for (let k = 0; k < MAX; k++) {
      if (this.life[k]! <= 0) continue;
      this.life[k]! -= dt;
      this.vel[k * 3 + 1]! -= 9 * dt;
      this.pos[k * 3]! += this.vel[k * 3]! * dt;
      this.pos[k * 3 + 1]! += this.vel[k * 3 + 1]! * dt;
      this.pos[k * 3 + 2]! += this.vel[k * 3 + 2]! * dt;
      if (this.life[k]! <= 0 || this.pos[k * 3 + 1]! < 0) {
        this.life[k] = 0;
        this.pos[k * 3 + 1] = -1000;
      }
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
