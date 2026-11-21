import * as THREE from 'three';
import type { SectionType } from '../audio/songTypes';
import type { VenueDefinition } from '../data/venueTypes';
import { basic } from './ps1';
import { coneTexture, softSpriteTexture } from './textures';

interface Cone {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  baseYaw: number;
  sway: number;
}

/**
 * Concert lighting: coloured stage washes that punch on every pulse, a bare
 * bulb over the pit, beat strobes in heavy parts, fake volumetric cones and
 * drifting smoke. Cheap: 4 dynamic point lights total.
 */
export class StageLights {
  readonly group = new THREE.Group();
  private readonly washL: THREE.PointLight;
  private readonly washR: THREE.PointLight;
  private readonly pitBulb: THREE.PointLight;
  private readonly strobe: THREE.PointLight;
  private readonly ambient: THREE.AmbientLight;
  private readonly cones: Cone[] = [];
  private readonly smoke: THREE.Sprite[] = [];
  private readonly colors: number[];
  private colorIndex = 0;
  private punch = 0;
  private strobeLevel = 0;
  private section: SectionType = 'intro';
  private frenzy = false;
  private time = 0;
  private readonly tmp = new THREE.Color();
  private readonly venue: VenueDefinition;

  constructor(venue: VenueDefinition) {
    this.venue = venue;
    const { width: W, depth: D, height: H } = venue.room;
    this.colors = venue.look.stageColors;
    this.ambient = new THREE.AmbientLight(venue.look.ambient, venue.look.ambientIntensity);
    this.group.add(this.ambient);
    const hemi = new THREE.HemisphereLight(0x6a5a8a, 0x201010, 0.5);
    this.group.add(hemi);

    const stageFront = -D / 2 + venue.stage.depth;
    this.washL = new THREE.PointLight(this.colors[0]!, 14, 11, 1.3);
    this.washL.position.set(-W * 0.22, H - 0.3, stageFront - 0.3);
    this.washR = new THREE.PointLight(this.colors[1]!, 14, 11, 1.3);
    this.washR.position.set(W * 0.22, H - 0.3, stageFront - 0.3);
    this.pitBulb = new THREE.PointLight(0xffc880, 7, 9, 1.4);
    this.pitBulb.position.set(venue.pit.x, H - 0.45, venue.pit.z);
    this.strobe = new THREE.PointLight(0xffffff, 0, 16, 1.2);
    this.strobe.position.set(0, H - 0.2, stageFront + 1);
    this.group.add(this.washL, this.washR, this.pitBulb, this.strobe);

    // Visible fixtures.
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), basic({ color: 0xffe0a0 }));
    bulb.position.copy(this.pitBulb.position);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 3), basic({ color: 0x111111 }));
    cord.position.set(bulb.position.x, H - 0.22, bulb.position.z);
    this.group.add(bulb, cord);
    const canMat = basic({ color: 0x222222 });
    for (const l of [this.washL, this.washR]) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.22, 6), canMat);
      can.position.copy(l.position);
      this.group.add(can);
    }

    // Fake volumetric cones from the stage cans down into the pit.
    const coneGeo = new THREE.ConeGeometry(1.1, H - 0.2, 12, 1, true);
    coneGeo.translate(0, -(H - 0.2) / 2, 0);
    const tex = coneTexture();
    const makeCone = (x: number, z: number, yaw: number, color: number) => {
      const material = new THREE.MeshBasicMaterial({
        map: tex,
        color,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      const mesh = new THREE.Mesh(coneGeo, material);
      mesh.position.set(x, H - 0.15, z);
      mesh.rotation.set(0.45, yaw, 0, 'YXZ');
      this.group.add(mesh);
      this.cones.push({ mesh, material, baseYaw: yaw, sway: Math.random() * 6 });
    };
    makeCone(this.washL.position.x, this.washL.position.z, -0.4, this.colors[0]!);
    makeCone(this.washR.position.x, this.washR.position.z, 0.4, this.colors[1]!);
    makeCone(0, stageFront - 0.5, 0, this.colors[2] ?? 0xffffff);

    // Smoke sprites near the stage.
    const smokeMat = new THREE.SpriteMaterial({
      map: softSpriteTexture(),
      color: 0x8a7a9a,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(smokeMat);
      const size = 2 + Math.random() * 2.5;
      s.scale.set(size, size, 1);
      s.position.set((Math.random() - 0.5) * W * 0.8, 1.2 + Math.random() * (H - 1.4), stageFront + Math.random() * 3 - 1);
      this.smoke.push(s);
      this.group.add(s);
    }
  }

  setSection(type: SectionType): void {
    this.section = type;
    this.colorIndex = (this.colorIndex + 1) % this.colors.length;
    if (type === 'breakdown' || type === 'heavy') this.colorIndex = 0; // red for the heavy stuff
    this.punch = 1.5;
  }

  setFrenzy(on: boolean): void {
    this.frenzy = on;
  }

  /** Call on every timing pulse. */
  onPulse(): void {
    this.punch = Math.max(this.punch, 1);
    if (this.section === 'heavy' || this.frenzy) this.strobeLevel = 1;
    if (this.frenzy) this.colorIndex = (this.colorIndex + 1) % this.colors.length;
  }

  flash(amount: number): void {
    this.strobeLevel = Math.max(this.strobeLevel, amount);
  }

  update(dt: number, energy: number): void {
    this.time += dt;
    this.punch = Math.max(0, this.punch - dt * 4);
    this.strobeLevel = Math.max(0, this.strobeLevel - dt * 14);
    const c1 = this.colors[this.colorIndex % this.colors.length]!;
    const c2 = this.colors[(this.colorIndex + 1) % this.colors.length]!;
    const base = 6 + energy * 10;
    this.washL.color.setHex(c1);
    this.washR.color.setHex(this.section === 'breakdown' || this.section === 'heavy' ? c1 : c2);
    this.washL.intensity = base + this.punch * 10;
    this.washR.intensity = base + this.punch * 10;
    this.strobe.intensity = this.strobeLevel * 60;
    this.pitBulb.intensity = 6 + Math.sin(this.time * 31) * 0.3;
    this.ambient.intensity = this.venue.look.ambientIntensity * (0.85 + energy * 0.3);

    for (let i = 0; i < this.cones.length; i++) {
      const cone = this.cones[i]!;
      const col = i === 0 ? this.washL.color : i === 1 ? this.washR.color : this.tmp.setHex(c2);
      cone.material.color.copy(col);
      cone.material.opacity = 0.07 + energy * 0.08 + this.punch * 0.05;
      cone.mesh.rotation.y = cone.baseYaw + Math.sin(this.time * (0.5 + energy) + cone.sway) * 0.35 * energy;
    }
    for (let i = 0; i < this.smoke.length; i++) {
      const s = this.smoke[i]!;
      s.position.x += Math.sin(this.time * 0.2 + i) * dt * 0.15;
      s.position.y += Math.cos(this.time * 0.15 + i * 2) * dt * 0.05;
    }
  }
}
