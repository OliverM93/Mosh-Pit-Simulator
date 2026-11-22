import { clamp, damp, dampAngle, TAU } from '../../core/math';
import { Rng } from '../../core/random';
import { randomAppearance, type Appearance } from '../../data/appearance';
import type { VenueDefinition } from '../../data/venueTypes';

export type { Appearance };

export type CrowdRole = 'watcher' | 'dancer' | 'ninja' | 'surfer' | 'band';
export type BandRole = 'vocals' | 'guitar' | 'bass' | 'drums';
export type WatcherTrait = 'bobber' | 'headbanger' | 'fist' | 'crossed';
export type AgentState = 'idle' | 'dance' | 'stumble' | 'cheer' | 'shove' | 'ooh' | 'surf' | 'band';

export interface CrowdAgent {
  id: number;
  role: CrowdRole;
  band?: BandRole;
  trait: WatcherTrait;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  yaw: number;
  radius: number;
  mass: number;
  // Watcher home on the pit ring.
  ringAngle: number;
  ringRow: number;
  ringJitter: number;
  // Behaviour.
  state: AgentState;
  stateTime: number;
  stateDuration: number;
  pendingState: AgentState | null;
  pendingDelay: number;
  targetX: number;
  targetZ: number;
  /** Current animation clip id and its 0..1 phase (renderer samples this). */
  clip: string;
  phase: number;
  mirror: boolean;
  /** Dance move timing (dancers/ninjas). */
  moveStart: number;
  moveEnd: number;
  moveCount: number;
  beatOffset: number;
  appearance: Appearance;
}

export interface CrowdContext {
  time: number;
  beat: number;
  pulseInterval: number;
  pulsePhase: number;
  /** 0..1 musical + hype energy. */
  energy: number;
  frenzy: boolean;
  /** Target pit radius multiplier (breakdowns open the pit). */
  pitScale: number;
  playerX: number;
  playerZ: number;
}

export const CROWD_TUNING = {
  ringGap: 0.6,
  rowGap: 0.6,
  homeSpring: 9,
  homeDamping: 6,
  dancerSpeed: 1.3,
  /** Dancers keep at least this far from the player. */
  dancerKeepAway: 2.2,
  /** Watchers push the player back into the pit with this strength. */
  wallPush: 0.35,
  surferSpeed: 0.85,
  surferHeight: 1.85,
};

/**
 * Crowd behaviour: watchers form the (breathing) pit wall, dancers and
 * ninjas move in the pit, surfers ride over the audience, the band plays.
 * Pure simulation – rendering reads `agents`.
 */
export class CrowdSim {
  readonly agents: CrowdAgent[] = [];
  pitRadius: number;
  private readonly venue: VenueDefinition;
  private readonly rng: Rng;
  private readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number; stageFront: number; stageHalfW: number };
  private grid = new Map<number, CrowdAgent[]>();
  private time = 0;

  constructor(venue: VenueDefinition) {
    this.venue = venue;
    this.rng = new Rng(venue.crowd.seed);
    this.pitRadius = venue.pit.radius;
    const { width, depth } = venue.room;
    this.bounds = {
      minX: -width / 2 + 0.3,
      maxX: width / 2 - 0.3,
      minZ: -depth / 2 + 0.3,
      maxZ: depth / 2 - 0.3,
      stageFront: -depth / 2 + venue.stage.depth,
      stageHalfW: venue.stage.width / 2,
    };
    this.spawn();
  }

  get stageFront(): number {
    return this.bounds.stageFront;
  }

  private appearance(): Appearance {
    return randomAppearance(this.rng);
  }

  private makeAgent(role: CrowdRole, x: number, z: number): CrowdAgent {
    const r = this.rng;
    const traits: WatcherTrait[] = ['bobber', 'bobber', 'headbanger', 'headbanger', 'fist', 'crossed'];
    const a: CrowdAgent = {
      id: this.agents.length,
      role,
      trait: r.pick(traits),
      x,
      z,
      y: 0,
      vx: 0,
      vz: 0,
      yaw: 0,
      radius: role === 'watcher' ? 0.29 : 0.31,
      mass: role === 'watcher' ? 3 : 1,
      ringAngle: 0,
      ringRow: 0,
      ringJitter: 0,
      state: 'idle',
      stateTime: 0,
      stateDuration: 0,
      pendingState: null,
      pendingDelay: 0,
      targetX: x,
      targetZ: z,
      clip: 'bob',
      phase: 0,
      mirror: r.chance(0.5),
      moveStart: 0,
      moveEnd: 0,
      moveCount: 0,
      beatOffset: r.chance(0.2) ? 0.5 : 0,
      appearance: this.appearance(),
    };
    this.agents.push(a);
    return a;
  }

  private spawn(): void {
    const v = this.venue;
    const pit = v.pit;
    const r = this.rng;

    // Watchers on concentric rings around the pit, skipping spots outside the room.
    let placed = 0;
    for (let row = 0; row < 12 && placed < v.crowd.watchers; row++) {
      const radius = pit.radius + 0.55 + row * CROWD_TUNING.rowGap;
      const count = Math.floor((TAU * radius) / CROWD_TUNING.ringGap);
      const offset = r.next() * TAU;
      for (let i = 0; i < count && placed < v.crowd.watchers; i++) {
        const ang = offset + (i / count) * TAU + r.range(-0.08, 0.08);
        const x = pit.x + Math.sin(ang) * radius;
        const z = pit.z + Math.cos(ang) * radius;
        if (!this.validFloor(x, z, 0.1)) continue;
        const a = this.makeAgent('watcher', x, z);
        a.ringAngle = ang;
        a.ringRow = row;
        a.ringJitter = r.range(-0.12, 0.12);
        placed++;
      }
    }

    for (let i = 0; i < v.crowd.dancers + v.crowd.ninjas; i++) {
      const ang = r.next() * TAU;
      const d = r.range(0.8, pit.radius * 0.7);
      const a = this.makeAgent(i < v.crowd.dancers ? 'dancer' : 'ninja', pit.x + Math.sin(ang) * d, pit.z + Math.cos(ang) * d);
      a.state = 'dance';
      this.pickDancerTarget(a);
    }

    for (let i = 0; i < v.crowd.surfers; i++) {
      const a = this.makeAgent('surfer', 0, 0);
      a.state = 'surf';
      this.resetSurfer(a, true);
    }

    // The band.
    const sz = -v.room.depth / 2 + v.stage.depth * 0.5;
    const bandSpots: [BandRole, number, number][] = [
      ['vocals', 0, sz + v.stage.depth * 0.3],
      ['guitar', -v.stage.width * 0.32, sz + 0.1],
      ['bass', v.stage.width * 0.32, sz + 0.1],
      ['drums', 0, sz - v.stage.depth * 0.25],
    ];
    for (const [role, x, z] of bandSpots) {
      const a = this.makeAgent('band', x, z);
      a.band = role;
      a.state = 'band';
      a.y = v.stage.height;
      a.yaw = 0; // face the crowd (+z)
      const look = a.appearance;
      look.shirt = role === 'vocals' ? 'hoodie' : role === 'guitar' ? 'tee_skull' : role === 'bass' ? 'jersey' : 'tee_brickface';
      look.headwear = role === 'drums' ? 'cap_back' : role === 'vocals' ? 'none' : 'cap';
      if (role === 'vocals') {
        look.hair = 'bald';
        look.beard = true;
      }
      look.tattoo = 2;
    }
  }

  private validFloor(x: number, z: number, margin: number): boolean {
    const b = this.bounds;
    if (x < b.minX + margin || x > b.maxX - margin || z < b.minZ + margin || z > b.maxZ - margin) return false;
    if (z < b.stageFront + 0.25 + margin && Math.abs(x) < b.stageHalfW + 0.2) return false;
    return true;
  }

  private clampToFloor(a: CrowdAgent): void {
    const b = this.bounds;
    a.x = clamp(a.x, b.minX, b.maxX);
    a.z = clamp(a.z, b.minZ, b.maxZ);
    const front = b.stageFront + 0.2;
    if (a.z < front && Math.abs(a.x) < b.stageHalfW + 0.1) a.z = front;
  }

  private pickDancerTarget(a: CrowdAgent): void {
    const pit = this.venue.pit;
    const ang = this.rng.next() * TAU;
    const d = this.rng.range(0, this.pitRadius * 0.72);
    a.targetX = pit.x + Math.sin(ang) * d;
    a.targetZ = pit.z + Math.cos(ang) * d;
  }

  private resetSurfer(a: CrowdAgent, initial: boolean): void {
    const pit = this.venue.pit;
    const side = this.rng.chance(0.5) ? -1 : 1;
    a.x = clamp(pit.x + side * (this.pitRadius + this.rng.range(1.3, 2.3)), this.bounds.minX + 0.5, this.bounds.maxX - 0.5);
    a.z = initial ? this.rng.range(pit.z, this.bounds.maxZ - 1) : this.bounds.maxZ - 0.8;
    a.targetX = a.x + this.rng.range(-0.6, 0.6);
    a.targetZ = this.bounds.stageFront + 0.6;
    a.y = CROWD_TUNING.surferHeight;
    a.clip = 'surf';
  }

  update(dt: number, ctx: CrowdContext): void {
    this.time = ctx.time;
    const targetRadius = this.venue.pit.radius * ctx.pitScale;
    this.pitRadius = damp(this.pitRadius, targetRadius, 1.6, dt);

    for (const a of this.agents) {
      a.stateTime += dt;
      if (a.pendingState && (a.pendingDelay -= dt) <= 0) {
        this.setReaction(a, a.pendingState);
        a.pendingState = null;
      }
      switch (a.role) {
        case 'watcher':
          this.updateWatcher(a, dt, ctx);
          break;
        case 'dancer':
        case 'ninja':
          this.updateDancer(a, dt, ctx);
          break;
        case 'surfer':
          this.updateSurfer(a, dt, ctx);
          break;
        case 'band':
          this.updateBand(a, ctx);
          break;
      }
    }
    this.separate();
  }

  private loopPhase(a: CrowdAgent, ctx: CrowdContext, beats: number): number {
    const p = (ctx.beat + a.beatOffset) / beats;
    return p - Math.floor(p);
  }

  private reactionActive(a: CrowdAgent): boolean {
    return (a.state === 'cheer' || a.state === 'ooh' || a.state === 'shove' || a.state === 'stumble') && a.stateTime < a.stateDuration;
  }

  private updateWatcher(a: CrowdAgent, dt: number, ctx: CrowdContext): void {
    const pit = this.venue.pit;
    const radius = this.pitRadius + 0.55 + a.ringRow * CROWD_TUNING.rowGap + a.ringJitter;
    let hx = pit.x + Math.sin(a.ringAngle) * radius;
    let hz = pit.z + Math.cos(a.ringAngle) * radius;
    const b = this.bounds;
    hx = clamp(hx, b.minX, b.maxX);
    hz = clamp(hz, b.minZ, b.maxZ);
    if (hz < b.stageFront + 0.3 && Math.abs(hx) < b.stageHalfW + 0.1) hz = b.stageFront + 0.3 + a.ringRow * 0.35;

    // Spring to home plus a little jostle.
    const jx = Math.sin(this.time * 1.3 + a.id * 1.7) * 0.25 * ctx.energy;
    const jz = Math.cos(this.time * 1.1 + a.id * 2.3) * 0.25 * ctx.energy;
    a.vx += ((hx - a.x) * CROWD_TUNING.homeSpring + jx - a.vx * CROWD_TUNING.homeDamping) * dt;
    a.vz += ((hz - a.z) * CROWD_TUNING.homeSpring + jz - a.vz * CROWD_TUNING.homeDamping) * dt;
    a.x += a.vx * dt;
    a.z += a.vz * dt;
    this.clampToFloor(a);

    // Face the pit; people between pit and stage face the band.
    const towardStage = a.z < pit.z - 0.5;
    const fx = towardStage ? 0 : pit.x - a.x;
    const fz = towardStage ? -1 : pit.z - a.z;
    const faceYaw = Math.atan2(fx, fz);
    a.yaw = dampAngle(a.yaw, faceYaw, 4, dt);

    if (this.reactionActive(a)) {
      a.phase = a.stateTime / a.stateDuration;
      return;
    }
    a.state = 'idle';
    const e = ctx.energy;
    if (ctx.frenzy && a.trait !== 'crossed' && a.id % 2 === 0) {
      a.clip = 'jump_cheer';
      a.phase = this.loopPhase(a, ctx, 2);
      return;
    }
    switch (a.trait) {
      case 'crossed':
        a.clip = 'arms_crossed';
        a.phase = this.loopPhase(a, ctx, 2);
        break;
      case 'fist':
        a.clip = e > 0.5 ? 'fist_pump' : 'bob';
        a.phase = this.loopPhase(a, ctx, e > 0.5 ? 1 : 2);
        break;
      case 'headbanger':
        a.clip = e > 0.4 ? 'headbang' : 'bob';
        a.phase = this.loopPhase(a, ctx, e > 0.85 ? 1 : 2);
        break;
      default:
        a.clip = e > 0.75 ? 'headbang' : 'bob';
        a.phase = this.loopPhase(a, ctx, 2);
    }
  }

  private updateDancer(a: CrowdAgent, dt: number, ctx: CrowdContext): void {
    const pit = this.venue.pit;
    if (a.state === 'stumble') {
      a.vx = damp(a.vx, 0, 3, dt);
      a.vz = damp(a.vz, 0, 3, dt);
      a.x += a.vx * dt;
      a.z += a.vz * dt;
      this.clampToFloor(a);
      a.phase = a.stateTime / a.stateDuration;
      if (a.stateTime >= a.stateDuration) {
        a.state = 'dance';
        a.moveEnd = 0;
      }
      return;
    }
    a.state = 'dance';

    // Walk towards the target while dancing; keep some distance to the player.
    let dx = a.targetX - a.x;
    let dz = a.targetZ - a.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.3) this.pickDancerTarget(a);
    const px = a.x - ctx.playerX;
    const pz = a.z - ctx.playerZ;
    const pd = Math.hypot(px, pz);
    const keep = CROWD_TUNING.dancerKeepAway;
    const dodging = pd < keep && pd > 0.01;
    if (dodging) {
      // Make room for the player (they need space for big moves).
      dx += (px / pd) * 4;
      dz += (pz / pd) * 4;
    }
    // Stay inside the pit.
    const cx = a.x - pit.x;
    const cz = a.z - pit.z;
    const cd = Math.hypot(cx, cz);
    if (cd > this.pitRadius * 0.85) {
      dx -= (cx / cd) * 2;
      dz -= (cz / cd) * 2;
    }
    const len = Math.hypot(dx, dz) || 1;
    const speed = CROWD_TUNING.dancerSpeed * (0.6 + ctx.energy * 0.6) * (dodging ? 2.2 : 1);
    a.vx = damp(a.vx, (dx / len) * speed, 4, dt);
    a.vz = damp(a.vz, (dz / len) * speed, 4, dt);
    a.x += a.vx * dt;
    a.z += a.vz * dt;
    this.clampToFloor(a);
    a.yaw = dampAngle(a.yaw, Math.atan2(a.vx, a.vz), 6, dt);

    // Beat-locked dance moves.
    if (ctx.time >= a.moveEnd) {
      const r = this.rng;
      let clip = 'two_step';
      let pulses = 1;
      const roll = r.next();
      if (a.role === 'ninja' && roll < 0.3 + ctx.energy * 0.25) {
        clip = r.pick(['spinkick', 'spinkick', 'floorwork', 'side_arms']);
        pulses = Math.max(1, Math.round(0.7 / ctx.pulseInterval));
      } else if (roll < 0.25 + ctx.energy * 0.2) {
        clip = r.pick(['forward_arms', 'side_arms', 'pick_up_change']);
        pulses = Math.max(1, Math.round(0.7 / ctx.pulseInterval));
      }
      a.mirror = clip === a.clip ? !a.mirror : r.chance(0.5);
      a.clip = clip;
      const start = ctx.time - ctx.pulsePhase * ctx.pulseInterval;
      a.moveStart = start;
      a.moveEnd = start + pulses * ctx.pulseInterval;
      a.moveCount++;
    }
    a.phase = clamp((ctx.time - a.moveStart) / Math.max(0.05, a.moveEnd - a.moveStart), 0, 1);
  }

  private updateSurfer(a: CrowdAgent, dt: number, ctx: CrowdContext): void {
    const dx = a.targetX - a.x;
    const dz = a.targetZ - a.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) {
      this.resetSurfer(a, false);
      return;
    }
    const s = CROWD_TUNING.surferSpeed * (0.7 + ctx.energy * 0.5);
    a.x += (dx / d) * s * dt + Math.sin(this.time * 2.1 + a.id) * 0.2 * dt;
    a.z += (dz / d) * s * dt;
    a.y = CROWD_TUNING.surferHeight + Math.sin(this.time * 3 + a.id) * 0.08;
    a.yaw = Math.atan2(dx, dz);
    a.clip = 'surf';
    a.phase = this.loopPhase(a, ctx, 2);
  }

  private updateBand(a: CrowdAgent, ctx: CrowdContext): void {
    const heavy = ctx.energy > 0.8;
    switch (a.band) {
      case 'vocals':
        a.clip = heavy ? 'band_vocals_heavy' : 'band_vocals';
        a.phase = this.loopPhase(a, ctx, heavy ? 2 : 4);
        break;
      case 'drums':
        a.clip = 'band_drums';
        a.phase = this.loopPhase(a, ctx, 1);
        break;
      default:
        a.clip = heavy ? 'band_guitar_heavy' : 'band_guitar';
        a.phase = this.loopPhase(a, ctx, heavy ? 2 : 1);
    }
  }

  private setReaction(a: CrowdAgent, state: AgentState): void {
    a.state = state;
    a.stateTime = 0;
    a.stateDuration = state === 'cheer' ? 1.4 : state === 'ooh' ? 1.2 : state === 'shove' ? 0.5 : 0.9;
    a.clip = state === 'cheer' ? (a.id % 3 === 0 ? 'jump_cheer' : 'cheer') : state;
    a.phase = 0;
  }

  /** Crowd reaction wave starting at (x, z). `strength` 0..1 decides how many react. */
  react(kind: 'cheer' | 'ooh', strength: number, x: number, z: number): void {
    for (const a of this.agents) {
      if (a.role !== 'watcher') continue;
      if (a.trait === 'crossed' && strength < 0.9) continue;
      const d = Math.hypot(a.x - x, a.z - z);
      const p = clamp(strength * 1.2 - d * 0.04, 0, 1);
      if (this.rng.next() > p) continue;
      a.pendingState = kind;
      a.pendingDelay = d * 0.06 + this.rng.range(0, 0.15);
    }
  }

  /** Knock people away from (x, z). Returns how many were hit. */
  impact(x: number, z: number, radius: number, strength: number): number {
    let hits = 0;
    for (const a of this.agents) {
      if (a.role === 'surfer' || a.role === 'band') continue;
      const dx = a.x - x;
      const dz = a.z - z;
      const d = Math.hypot(dx, dz);
      if (d > radius + a.radius || d < 0.001) continue;
      hits++;
      const f = strength * (1 - d / (radius + a.radius) * 0.5);
      if (a.role === 'watcher') {
        a.vx += (dx / d) * f * 2;
        a.vz += (dz / d) * f * 2;
        this.setReaction(a, 'shove');
      } else {
        a.vx = (dx / d) * f * 4;
        a.vz = (dz / d) * f * 4;
        this.setReaction(a, 'stumble');
        a.clip = 'stumble';
      }
    }
    return hits;
  }

  countNear(x: number, z: number, radius: number): number {
    let n = 0;
    for (const a of this.agents) {
      if (a.role === 'surfer' || a.role === 'band') continue;
      if (Math.hypot(a.x - x, a.z - z) < radius) n++;
    }
    return n;
  }

  /** Distance from (x, z) to the closest body (surface to surface). */
  freeSpace(x: number, z: number): number {
    let best = Infinity;
    for (const a of this.agents) {
      if (a.role === 'surfer' || a.role === 'band') continue;
      const d = Math.hypot(a.x - x, a.z - z) - a.radius;
      if (d < best) best = d;
    }
    return best;
  }

  /**
   * Push the player out of bodies. Watchers are heavy and shove the player
   * back towards the pit; dancers are light and get bumped.
   * Returns the summed push applied to the player.
   */
  resolvePlayer(px: number, pz: number, pr: number): { dx: number; dz: number; wall: boolean } {
    let dx = 0;
    let dz = 0;
    let wall = false;
    const pit = this.venue.pit;
    for (const a of this.agents) {
      if (a.role === 'surfer' || a.role === 'band') continue;
      const ox = px + dx - a.x;
      const oz = pz + dz - a.z;
      const d = Math.hypot(ox, oz);
      const min = pr + a.radius;
      if (d >= min || d < 0.0001) continue;
      const overlap = min - d;
      const nx = ox / d;
      const nz = oz / d;
      const playerShare = a.mass / (a.mass + 1);
      dx += nx * overlap * playerShare;
      dz += nz * overlap * playerShare;
      a.x -= nx * overlap * (1 - playerShare);
      a.z -= nz * overlap * (1 - playerShare);
      if (a.role === 'watcher') {
        wall = true;
        // Pit-wall push back towards the centre.
        const cx = pit.x - px;
        const cz = pit.z - pz;
        const cd = Math.hypot(cx, cz) || 1;
        dx += (cx / cd) * CROWD_TUNING.wallPush * 0.016;
        dz += (cz / cd) * CROWD_TUNING.wallPush * 0.016;
        if (a.state !== 'shove' && this.rng.chance(0.04)) this.setReaction(a, 'shove');
      }
    }
    return { dx, dz, wall };
  }

  private cellKey(x: number, z: number): number {
    return ((Math.floor(x) + 64) << 8) | (Math.floor(z) + 64);
  }

  /** Agent-agent separation using a 1 m uniform grid. */
  private separate(): void {
    this.grid.clear();
    for (const a of this.agents) {
      if (a.role === 'surfer' || a.role === 'band') continue;
      const k = this.cellKey(a.x, a.z);
      let cell = this.grid.get(k);
      if (!cell) this.grid.set(k, (cell = []));
      cell.push(a);
    }
    for (const a of this.agents) {
      if (a.role === 'surfer' || a.role === 'band') continue;
      const cx = Math.floor(a.x);
      const cz = Math.floor(a.z);
      for (let ix = -1; ix <= 1; ix++) {
        for (let iz = -1; iz <= 1; iz++) {
          const cell = this.grid.get(((cx + ix + 64) << 8) | (cz + iz + 64));
          if (!cell) continue;
          for (const b of cell) {
            if (b.id <= a.id) continue;
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const d = Math.hypot(dx, dz);
            const min = a.radius + b.radius;
            if (d >= min || d < 0.0001) continue;
            const overlap = (min - d) * 0.5;
            const nx = dx / d;
            const nz = dz / d;
            const wa = b.mass / (a.mass + b.mass);
            const wb = 1 - wa;
            a.x -= nx * overlap * wa * 2;
            a.z -= nz * overlap * wa * 2;
            b.x += nx * overlap * wb * 2;
            b.z += nz * overlap * wb * 2;
          }
        }
      }
    }
    for (const a of this.agents) {
      if (a.role !== 'surfer' && a.role !== 'band') this.clampToFloor(a);
    }
  }
}
