import * as THREE from 'three';
import { GRAPHICS_PRESETS, type GraphicsPreset } from '../data/graphics';
import { MOVE_TUNING } from '../gameplay/MoveSystem';
import type { PitSession } from '../gameplay/PitSession';
import { CameraController } from './CameraController';
import type { CharacterLibrary } from './characters';
import { CrowdRenderer } from './CrowdRenderer';
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
  private readonly crowd: CrowdRenderer | SkinnedCrowdRenderer;
  private readonly player: PlayerView;
  private readonly particles = new Particles();
  private readonly unsubscribe: Array<() => void> = [];
  private readonly focus = new THREE.Vector3();

  constructor(
    private readonly session: PitSession,
    private readonly renderer: Renderer,
    graphics: GraphicsPreset = 'ps2',
    lib: CharacterLibrary | null = null,
  ) {
    const detail = GRAPHICS_PRESETS[graphics].detail;
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
    const skinned = !!lib?.ready;
    const shadows = skinned && graphics !== 'ps1';
    renderer.gl.shadowMap.enabled = shadows;
    renderer.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.crowd = skinned ? new SkinnedCrowdRenderer(session.crowd.agents, lib!, shadows) : new CrowdRenderer(session.crowd.agents, detail);
    this.player = new PlayerView(undefined, detail, skinned ? lib!.create('player') : null);
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
    this.cameraCtl.snapBehind(session.player.x, session.player.z, Math.PI);

    const ev = session.events;
    this.unsubscribe.push(
      ev.on('pulse', () => {
        this.lights.onPulse();
        this.player.onPulse();
      }),
      ev.on('section', (e) => this.lights.setSection(e.section.type)),
      ev.on('frenzy', (e) => {
        this.lights.setFrenzy(e.active);
        if (e.active) {
          this.renderer.pulseFlash(0.5, 0xffd040);
          this.cameraCtl.kickFov(1);
        }
      }),
      ev.on('moveStart', (e) => {
        if (e.move.rating === 'perfect') this.renderer.pulseFlash(0.12, 0xffffff);
      }),
      ev.on('impact', (e) => {
        this.cameraCtl.addShake(0.12 + e.strength * 0.1 + e.hits * 0.04);
        this.particles.burst(e.x, 1.4, e.z, 8 + e.hits * 6);
        if (e.hits > 0) this.lights.flash(0.4);
      }),
      ev.on('bail', () => {
        this.cameraCtl.addShake(0.35);
        this.renderer.pulseFlash(0.25, 0xff2020);
        this.player.bailStart = session.songTime;
        this.player.bailUntil = session.songTime + MOVE_TUNING.bailSec;
      }),
      ev.on('bank', (e) => {
        if (e.result.total > 20000) this.renderer.pulseFlash(0.2, 0x40ff80);
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
    const p = s.player;
    this.cameraCtl.update(dt, p.x, p.y, p.z, p.vx, p.vz);
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
