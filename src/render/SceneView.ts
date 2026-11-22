import * as THREE from 'three';
import type { GraphicsPreset } from '../data/graphics';
import type { PitSession } from '../gameplay/PitSession';
import { CameraController } from './CameraController';
import type { CharacterLibrary } from './characters';
import { SkinnedCrowdRenderer } from './SkinnedCrowdRenderer';
import { Particles } from './Particles';
import { PlayerView } from './PlayerView';
import type { Renderer } from './Renderer';
import { StageLights } from './StageLights';
import { buildVenue, type VenueView } from './VenueBuilder';

/**
 * Everything visual for one session. Reads session state every frame and
 * listens to session events for one-shot effects (shake, flashes, sweat).
 */
export class SceneView {
  readonly scene = new THREE.Scene();
  readonly cameraCtl: CameraController;
  private readonly venue: VenueView;
  private readonly lights: StageLights;
  private readonly crowd: SkinnedCrowdRenderer;
  private readonly player: PlayerView;
  private readonly particles = new Particles();
  private readonly unsubscribe: Array<() => void> = [];
  private readonly focus = new THREE.Vector3();

  constructor(
    private readonly session: PitSession,
    private readonly renderer: Renderer,
    graphics: GraphicsPreset = 'ps2',
    lib: CharacterLibrary,
  ) {
    if (!lib.ready) throw new Error('character models not loaded');
    const v = session.venue;
    this.scene.background = new THREE.Color(v.look.fog);
    this.scene.fog = new THREE.Fog(v.look.fog, v.look.fogNear, v.look.fogFar);
    this.venue = buildVenue(v);
    this.venue.setBanner(session.song.artist);
    if (session.song.logoUrl) {
      const img = new Image();
      img.onload = () => this.venue.setBannerImage(img);
      img.src = session.song.logoUrl;
    }
    this.lights = new StageLights(v);
    const shadows = graphics !== 'ps1';
    renderer.gl.shadowMap.enabled = shadows;
    renderer.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.crowd = new SkinnedCrowdRenderer(session.crowd.agents, lib, shadows);
    this.player = new PlayerView(lib.createLayered('player'), shadows);
    if (shadows) {
      // Key light straight over the pit: grounds the dancers with real shadows.
      const key = new THREE.SpotLight(0xffe0c0, 26, v.room.height + 6, 0.95, 0.6, 1.2);
      key.position.set(v.pit.x, v.room.height - 0.05, v.pit.z + 0.4);
      key.target.position.set(v.pit.x, 0, v.pit.z);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.bias = -0.0008;
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = v.room.height + 2;
      this.scene.add(key, key.target);
    }
    this.scene.add(this.venue.group, this.lights.group, this.crowd.group, this.player.group, this.particles.points);

    this.cameraCtl = new CameraController(renderer.aspect);
    this.cameraCtl.setVenue(v);
    this.cameraCtl.snapBehind(session.movement.x, session.movement.z, Math.PI);

    const ev = session.events;
    this.unsubscribe.push(
      ev.on('beat', (e) => {
        if (e.beatInBar % 2 === 0) this.lights.onPulse();
      }),
      ev.on('section', (e) => this.lights.setSection(e.section.type)),
      ev.on('frenzy', (e) => {
        this.lights.setFrenzy(e.active);
        if (e.active) {
          this.renderer.pulseFlash(0.5, 0xffd040);
          this.cameraCtl.kickFov(1);
        }
      }),
      ev.on('scored', (e) => {
        if (e.entry.tags.includes('ON BEAT')) this.lights.flash(0.25);
      }),
      ev.on('impact', (e) => {
        this.cameraCtl.addShake(0.08 + e.strength * 0.06 + e.hits * 0.03);
        this.particles.burst(e.x, 1.4, e.z, 8 + e.hits * 6);
        if (e.hits > 0) this.lights.flash(0.4);
      }),
      ev.on('bail', () => {
        this.cameraCtl.addShake(0.35);
        this.renderer.pulseFlash(0.25, 0xff2020);
      }),
      ev.on('bank', (e) => {
        if (e.result.total > 10000) this.renderer.pulseFlash(0.2, 0x40ff80);
      }),
      ev.on('beatdrop', () => {
        this.cameraCtl.addShake(0.25);
        this.lights.flash(1);
      }),
    );
  }

  get camera(): THREE.PerspectiveCamera {
    return this.cameraCtl.camera;
  }

  update(dt: number): void {
    const s = this.session;
    const p = s.movement;
    const full = s.moves.full;
    const inMove = !!full && full.def.category !== 'footwork';
    this.cameraCtl.update(dt, p.x, p.y, p.z, Math.atan2(p.vx, p.vz), Math.hypot(p.vx, p.vz), inMove || s.moves.isBailing(s.songTime));
    this.lights.update(dt, s.energy);
    this.player.update(dt, s);
    this.focus.set(p.x, 0, p.z);
    this.crowd.update(dt, this.camera, this.focus);
    this.particles.update(dt);
  }

  render(dt: number): void {
    this.renderer.render(this.scene, this.camera, dt);
  }

  resize(): void {
    this.cameraCtl.resize(this.renderer.aspect);
  }

  dispose(): void {
    for (const u of this.unsubscribe) u();
    this.crowd.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}
