import { createPose, mirrorPose, POSE_SIZE, writeSpec, type Pose, type PoseSpec } from './pose';

/**
 * Keyframe clips for every move and crowd behaviour. Poses are hand-authored
 * and deliberately exaggerated (arcade, not mocap). Clip time is normalised
 * 0..1; callers drive it from song time (moves, beat loops) or real time
 * (reactions). See docs/TECHNICAL_ARCHITECTURE.md → Animationssystem.
 *
 * Convention reminder (see pose.ts): shoulder/hip X < 0 = swing forward,
 * knee X > 0 = bend, elbow X < 0 = bend, left Z > 0 / right Z < 0 = outward.
 */

export type Ease = 'linear' | 'inOut' | 'in' | 'out' | 'back';

export interface ClipKey {
  t: number;
  pose: PoseSpec;
  /** Easing of the segment that ends at this key. */
  ease?: Ease;
}

export interface ClipDef {
  id: string;
  loop: boolean;
  keys: ClipKey[];
}

export interface CompiledClip {
  id: string;
  loop: boolean;
  times: number[];
  poses: Pose[];
  eases: Ease[];
}

const PI = Math.PI;
const TAU = PI * 2;

// ---------------------------------------------------------------- helpers
const legsStepA: PoseSpec = { hipL: [-0.1, 0, 0.05], kneeL: [0.35, 0, 0], hipR: [-0.75, 0, -0.05], kneeR: [0.25, 0, 0] };
const legsStepB: PoseSpec = { hipL: [-0.75, 0, 0.05], kneeL: [0.25, 0, 0], hipR: [-0.1, 0, -0.05], kneeR: [0.35, 0, 0] };
const legsMid: PoseSpec = { hipL: [-0.35, 0, 0.05], kneeL: [0.9, 0, 0], hipR: [-0.35, 0, -0.05], kneeR: [0.9, 0, 0] };
const stance: PoseSpec = { y: -0.06, hipL: [-0.1, 0, 0.1], kneeL: [0.25, 0, 0], hipR: [-0.1, 0, -0.1], kneeR: [0.25, 0, 0] };

function m(...specs: PoseSpec[]): PoseSpec {
  return Object.assign({}, ...specs) as PoseSpec;
}

// ---------------------------------------------------------------- player moves & locomotion
const DEFS: ClipDef[] = [
  {
    id: 'idle',
    loop: true,
    keys: [
      { t: 0, pose: m(stance, { y: -0.09, neck: [0.28, 0, 0], spine: [0.12, 0, 0], kneeL: [0.38, 0, 0], kneeR: [0.38, 0, 0], hipL: [-0.18, 0, 0.1], hipR: [-0.18, 0, -0.1] }) },
      { t: 0.5, pose: m(stance, { y: -0.01, neck: [-0.05, 0, 0], spine: [0.05, 0, 0] }) },
      { t: 1, pose: m(stance, { y: -0.09, neck: [0.28, 0, 0], spine: [0.12, 0, 0], kneeL: [0.38, 0, 0], kneeR: [0.38, 0, 0], hipL: [-0.18, 0, 0.1], hipR: [-0.18, 0, -0.1] }) },
    ],
  },
  {
    id: 'walk',
    loop: true,
    keys: [
      { t: 0, pose: { y: -0.02, hipL: [-0.5, 0, 0], kneeL: [0.1, 0, 0], hipR: [0.4, 0, 0], kneeR: [0.5, 0, 0], shoulderL: [0.4, 0, 0.12], shoulderR: [-0.4, 0, -0.12], spine: [0.08, 0.08, 0] } },
      { t: 0.25, pose: { y: 0.02, hipL: [0, 0, 0], kneeL: [0.2, 0, 0], hipR: [-0.1, 0, 0], kneeR: [0.9, 0, 0], spine: [0.08, 0, 0] } },
      { t: 0.5, pose: { y: -0.02, hipR: [-0.5, 0, 0], kneeR: [0.1, 0, 0], hipL: [0.4, 0, 0], kneeL: [0.5, 0, 0], shoulderR: [0.4, 0, -0.12], shoulderL: [-0.4, 0, 0.12], spine: [0.08, -0.08, 0] } },
      { t: 0.75, pose: { y: 0.02, hipR: [0, 0, 0], kneeR: [0.2, 0, 0], hipL: [-0.1, 0, 0], kneeL: [0.9, 0, 0], spine: [0.08, 0, 0] } },
      { t: 1, pose: { y: -0.02, hipL: [-0.5, 0, 0], kneeL: [0.1, 0, 0], hipR: [0.4, 0, 0], kneeR: [0.5, 0, 0], shoulderL: [0.4, 0, 0.12], shoulderR: [-0.4, 0, -0.12], spine: [0.08, 0.08, 0] } },
    ],
  },
  {
    id: 'run',
    loop: true,
    keys: [
      { t: 0, pose: { y: -0.05, pitch: 0.25, hipL: [-1.0, 0, 0], kneeL: [0.4, 0, 0], hipR: [0.6, 0, 0], kneeR: [1.2, 0, 0], shoulderL: [0.9, 0, 0.15], elbowL: [-1.4, 0, 0], shoulderR: [-1.1, 0, -0.15], elbowR: [-1.4, 0, 0] } },
      { t: 0.25, pose: { y: 0.06, pitch: 0.25, hipL: [-0.3, 0, 0], kneeL: [0.3, 0, 0], hipR: [-0.4, 0, 0], kneeR: [1.8, 0, 0], shoulderL: [0, 0, 0.15], elbowL: [-1.4, 0, 0], shoulderR: [0, 0, -0.15], elbowR: [-1.4, 0, 0] } },
      { t: 0.5, pose: { y: -0.05, pitch: 0.25, hipR: [-1.0, 0, 0], kneeR: [0.4, 0, 0], hipL: [0.6, 0, 0], kneeL: [1.2, 0, 0], shoulderR: [0.9, 0, -0.15], elbowR: [-1.4, 0, 0], shoulderL: [-1.1, 0, 0.15], elbowL: [-1.4, 0, 0] } },
      { t: 0.75, pose: { y: 0.06, pitch: 0.25, hipR: [-0.3, 0, 0], kneeR: [0.3, 0, 0], hipL: [-0.4, 0, 0], kneeL: [1.8, 0, 0], shoulderL: [0, 0, 0.15], elbowL: [-1.4, 0, 0], shoulderR: [0, 0, -0.15], elbowR: [-1.4, 0, 0] } },
      { t: 1, pose: { y: -0.05, pitch: 0.25, hipL: [-1.0, 0, 0], kneeL: [0.4, 0, 0], hipR: [0.6, 0, 0], kneeR: [1.2, 0, 0], shoulderL: [0.9, 0, 0.15], elbowL: [-1.4, 0, 0], shoulderR: [-1.1, 0, -0.15], elbowR: [-1.4, 0, 0] } },
    ],
  },
  {
    // One hop-step. End pose = mirrored start pose, so alternating repeats are seamless.
    id: 'two_step',
    loop: false,
    keys: [
      { t: 0, pose: m(legsStepA, { y: -0.1, spine: [0.2, 0.15, 0], neck: [0.25, 0, 0], yaw: 0.2, shoulderL: [-0.9, 0, 0.25], elbowL: [-1.3, 0, 0], shoulderR: [0.6, 0, -0.3], elbowR: [-0.7, 0, 0] }) },
      { t: 0.45, pose: m(legsMid, { y: 0.07, spine: [0.15, 0, 0], neck: [-0.05, 0, 0], yaw: 0, shoulderL: [-0.2, 0, 0.35], elbowL: [-1.0, 0, 0], shoulderR: [-0.2, 0, -0.35], elbowR: [-1.0, 0, 0] }), ease: 'out' },
      { t: 1, pose: m(legsStepB, { y: -0.1, spine: [0.2, -0.15, 0], neck: [0.25, 0, 0], yaw: -0.2, shoulderR: [-0.9, 0, -0.25], elbowR: [-1.3, 0, 0], shoulderL: [0.6, 0, 0.3], elbowL: [-0.7, 0, 0] }), ease: 'in' },
    ],
  },
  {
    id: 'crowd_push',
    loop: false,
    keys: [
      { t: 0, pose: m(stance, { pitch: 0.2, shoulderL: [-1.0, 0, 0.3], elbowL: [-1.6, 0, 0], shoulderR: [-1.0, 0, -0.3], elbowR: [-1.6, 0, 0] }) },
      { t: 0.25, pose: { pitch: 0.5, y: -0.08, hipL: [-1.0, 0, 0], kneeL: [0.6, 0, 0], hipR: [0.5, 0, 0], kneeR: [0.6, 0, 0], shoulderL: [-1.3, 0.4, 0.5], elbowL: [-1.9, 0, 0], shoulderR: [-1.3, -0.4, -0.5], elbowR: [-1.9, 0, 0], spine: [0.3, 0.3, 0], neck: [-0.3, 0, 0] }, ease: 'out' },
      { t: 0.6, pose: { pitch: 0.45, y: -0.04, hipR: [-1.0, 0, 0], kneeR: [0.6, 0, 0], hipL: [0.5, 0, 0], kneeL: [0.6, 0, 0], shoulderL: [-1.5, 0.3, 0.2], elbowL: [-0.6, 0, 0], shoulderR: [-1.5, -0.3, -0.2], elbowR: [-0.6, 0, 0], spine: [0.3, -0.3, 0], neck: [-0.3, 0, 0] } },
      { t: 1, pose: m(stance, { pitch: 0.1 }) },
    ],
  },
  {
    // Forward windmills: both arms rotate forward (−X), half a turn apart, legs 2-step twice.
    id: 'forward_arms',
    loop: false,
    keys: [
      { t: 0, pose: m(legsStepA, { y: -0.08, spine: [0.35, 0.2, 0], neck: [0.3, 0, 0], shoulderL: [0, 0, 0.25], shoulderR: [-PI, 0, -0.25] }) },
      { t: 0.25, pose: m(legsMid, { y: 0.05, spine: [0.4, 0, 0], neck: [0.1, 0, 0], shoulderL: [-PI / 2, 0, 0.3], shoulderR: [-1.5 * PI, 0, -0.3] }), ease: 'linear' },
      { t: 0.5, pose: m(legsStepB, { y: -0.08, spine: [0.35, -0.2, 0], neck: [0.3, 0, 0], shoulderL: [-PI, 0, 0.25], shoulderR: [-2 * PI, 0, -0.25] }), ease: 'linear' },
      { t: 0.75, pose: m(legsMid, { y: 0.05, spine: [0.4, 0, 0], neck: [0.1, 0, 0], shoulderL: [-1.5 * PI, 0, 0.3], shoulderR: [-2.5 * PI, 0, -0.3] }), ease: 'linear' },
      { t: 1, pose: m(legsStepA, { y: -0.08, spine: [0.35, 0.2, 0], neck: [0.3, 0, 0], shoulderL: [-2 * PI, 0, 0.25], shoulderR: [-3 * PI, 0, -0.25] }), ease: 'linear' },
    ],
  },
  {
    // Side windmills in the frontal plane with a big torso twist.
    id: 'side_arms',
    loop: false,
    keys: [
      { t: 0, pose: m(legsStepA, { y: -0.1, spine: [0.2, 0.5, 0.15], neck: [0.25, -0.3, 0], shoulderL: [0, 0, 0.1], shoulderR: [0, 0, -PI] }) },
      { t: 0.25, pose: m(legsMid, { y: 0.04, spine: [0.15, 0, 0], neck: [0.05, 0, 0], shoulderL: [0, 0, PI / 2], shoulderR: [0, 0, -1.5 * PI] }), ease: 'linear' },
      { t: 0.5, pose: m(legsStepB, { y: -0.1, spine: [0.2, -0.5, -0.15], neck: [0.25, 0.3, 0], shoulderL: [0, 0, PI], shoulderR: [0, 0, -2 * PI] }), ease: 'linear' },
      { t: 0.75, pose: m(legsMid, { y: 0.04, spine: [0.15, 0, 0], neck: [0.05, 0, 0], shoulderL: [0, 0, 1.5 * PI], shoulderR: [0, 0, -2.5 * PI] }), ease: 'linear' },
      { t: 1, pose: m(legsStepA, { y: -0.1, spine: [0.2, 0.5, 0.15], neck: [0.25, -0.3, 0], shoulderL: [0, 0, 2 * PI], shoulderR: [0, 0, -3 * PI] }), ease: 'linear' },
    ],
  },
  {
    // Bent over, arms scooping the floor like picking up dropped coins.
    id: 'pick_up_change',
    loop: false,
    keys: [
      { t: 0, pose: m(legsStepA, { y: -0.25, spine: [1.0, 0.2, 0], neck: [-0.5, 0, 0], shoulderL: [-0.3, 0, 0.3], elbowL: [-0.3, 0, 0], shoulderR: [-1.6, 0, -0.3], elbowR: [-0.4, 0, 0] }) },
      { t: 0.25, pose: m(legsMid, { y: -0.18, spine: [1.15, 0, 0], neck: [-0.6, 0, 0], shoulderL: [-1.0, 0, 0.5], elbowL: [-0.2, 0, 0], shoulderR: [-1.0, 0, -0.5], elbowR: [-0.2, 0, 0] }) },
      { t: 0.5, pose: m(legsStepB, { y: -0.25, spine: [1.0, -0.2, 0], neck: [-0.5, 0, 0], shoulderR: [-0.3, 0, -0.3], elbowR: [-0.3, 0, 0], shoulderL: [-1.6, 0, 0.3], elbowL: [-0.4, 0, 0] }) },
      { t: 0.75, pose: m(legsMid, { y: -0.18, spine: [1.15, 0, 0], neck: [-0.6, 0, 0], shoulderL: [-1.0, 0, 0.5], elbowL: [-0.2, 0, 0], shoulderR: [-1.0, 0, -0.5], elbowR: [-0.2, 0, 0] }) },
      { t: 1, pose: m(legsStepA, { y: -0.25, spine: [1.0, 0.2, 0], neck: [-0.5, 0, 0], shoulderL: [-0.3, 0, 0.3], elbowL: [-0.3, 0, 0], shoulderR: [-1.6, 0, -0.3], elbowR: [-0.4, 0, 0] }) },
    ],
  },
  {
    // Spinning hook kick: wind-up, full turn with the right leg out, land.
    id: 'spinkick',
    loop: false,
    keys: [
      { t: 0, pose: m(stance, {}) },
      { t: 0.15, pose: m(stance, { y: -0.16, yaw: -0.5, spine: [0.2, -0.4, 0], shoulderL: [-0.6, 0, 0.9], elbowL: [-1.4, 0, 0], shoulderR: [-0.5, 0, -0.9], elbowR: [-1.4, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0] }), ease: 'out' },
      { t: 0.5, pose: { y: 0.08, yaw: PI, roll: -0.35, spine: [-0.1, 0, 0.2], hipL: [-0.1, 0, 0.1], kneeL: [0.2, 0, 0], hipR: [-0.3, 0, -1.55], kneeR: [0.05, 0, 0], shoulderL: [0, 0, 1.4], elbowL: [-0.2, 0, 0], shoulderR: [0, 0, -1.2], elbowR: [-0.3, 0, 0], neck: [0, 0.4, 0] }, ease: 'in' },
      { t: 0.75, pose: { y: 0.0, yaw: 1.7 * PI, roll: -0.15, spine: [0.1, 0, 0.1], hipR: [-0.5, 0, -0.7], kneeR: [0.6, 0, 0], hipL: [-0.1, 0, 0.1], kneeL: [0.3, 0, 0], shoulderL: [-0.4, 0, 1.0], shoulderR: [-0.4, 0, -1.0] }, ease: 'out' },
      { t: 1, pose: m(stance, { yaw: TAU, y: -0.12, kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0] }), ease: 'inOut' },
    ],
  },
  {
    // Low sweep: drop to the floor, hands down, leg circles around.
    id: 'floorwork',
    loop: false,
    keys: [
      { t: 0, pose: m(stance, {}) },
      { t: 0.2, pose: { y: -0.52, pitch: 0.55, spine: [0.3, 0, 0], neck: [-0.4, 0, 0], hipL: [-1.6, 0, 0.4], kneeL: [2.2, 0, 0], hipR: [-0.4, 0, -1.3], kneeR: [0.1, 0, 0], shoulderL: [-1.2, 0, 0.3], elbowL: [-0.1, 0, 0], shoulderR: [-1.2, 0, -0.3], elbowR: [-0.1, 0, 0] }, ease: 'out' },
      { t: 0.5, pose: { y: -0.55, pitch: 0.55, yaw: PI, spine: [0.3, 0, 0], neck: [-0.4, 0, 0], hipL: [-1.6, 0, 0.4], kneeL: [2.2, 0, 0], hipR: [-0.6, 0, -1.4], kneeR: [0.1, 0, 0], shoulderL: [-1.2, 0, 0.3], elbowL: [-0.1, 0, 0], shoulderR: [-1.2, 0, -0.3], elbowR: [-0.1, 0, 0] }, ease: 'linear' },
      { t: 0.78, pose: { y: -0.5, pitch: 0.5, yaw: 1.85 * PI, spine: [0.3, 0, 0], neck: [-0.4, 0, 0], hipL: [-1.5, 0, 0.4], kneeL: [2.0, 0, 0], hipR: [-0.6, 0, -1.2], kneeR: [0.2, 0, 0], shoulderL: [-1.2, 0, 0.3], shoulderR: [-1.2, 0, -0.3] }, ease: 'linear' },
      { t: 1, pose: m(stance, { yaw: TAU, y: -0.15, kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0] }), ease: 'out' },
    ],
  },
  {
    // Cartwheel to the character's right (roll +). Mirrored for leftwards.
    id: 'cartwheel',
    loop: false,
    keys: [
      { t: 0, pose: m(stance, { shoulderL: [0, 0, 2.6], shoulderR: [0, 0, -2.6] }) },
      { t: 0.25, pose: { y: -0.1, roll: PI / 2, hipL: [0, 0, 0.75], hipR: [0, 0, -0.75], shoulderL: [0, 0, 2.7], shoulderR: [0, 0, -2.7], elbowL: [0, 0, 0], elbowR: [0, 0, 0] }, ease: 'in' },
      { t: 0.5, pose: { y: 0.05, roll: PI, hipL: [0, 0, 0.8], hipR: [0, 0, -0.8], shoulderL: [0, 0, 2.8], shoulderR: [0, 0, -2.8], elbowL: [0, 0, 0], elbowR: [0, 0, 0] }, ease: 'linear' },
      { t: 0.75, pose: { y: -0.1, roll: 1.5 * PI, hipL: [0, 0, 0.75], hipR: [0, 0, -0.75], shoulderL: [0, 0, 2.7], shoulderR: [0, 0, -2.7], elbowL: [0, 0, 0], elbowR: [0, 0, 0] }, ease: 'linear' },
      { t: 1, pose: m(stance, { roll: TAU, y: -0.12, shoulderL: [0, 0, 1.6], shoulderR: [0, 0, -1.6], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0] }), ease: 'out' },
    ],
  },
  {
    id: 'hop',
    loop: false,
    keys: [
      { t: 0, pose: m(stance, { y: -0.16, kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], hipL: [-0.4, 0, 0.1], hipR: [-0.4, 0, -0.1], shoulderL: [0.6, 0, 0.3], shoulderR: [0.6, 0, -0.3] }) },
      { t: 0.45, pose: { y: 0.05, hipL: [-1.1, 0, 0.15], kneeL: [1.9, 0, 0], hipR: [-1.1, 0, -0.15], kneeR: [1.9, 0, 0], shoulderL: [-2.4, 0, 0.5], elbowL: [-0.3, 0, 0], shoulderR: [-2.4, 0, -0.5], elbowR: [-0.3, 0, 0], neck: [-0.3, 0, 0] }, ease: 'out' },
      { t: 1, pose: m(stance, { y: -0.18, kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0], hipL: [-0.45, 0, 0.1], hipR: [-0.45, 0, -0.1] }), ease: 'in' },
    ],
  },
  {
    // Airborne spin with a high crescent kick.
    id: 'tornado_kick',
    loop: false,
    keys: [
      { t: 0, pose: { y: 0, yaw: 0, hipL: [-1.0, 0, 0.1], kneeL: [1.6, 0, 0], hipR: [-0.8, 0, -0.1], kneeR: [1.4, 0, 0], shoulderL: [-1.8, 0, 0.6], shoulderR: [-1.8, 0, -0.6] } },
      { t: 0.35, pose: { y: 0.1, yaw: 0.9 * PI, roll: -0.3, hipL: [-1.3, 0, 0.2], kneeL: [2.0, 0, 0], hipR: [-1.9, 0, -0.7], kneeR: [0.05, 0, 0], shoulderL: [-0.3, 0, 1.5], elbowL: [-0.2, 0, 0], shoulderR: [-0.3, 0, -1.3], spine: [-0.15, 0, 0.2], neck: [-0.2, 0.4, 0] }, ease: 'out' },
      { t: 0.7, pose: { y: 0.05, yaw: 1.7 * PI, roll: -0.15, hipL: [-0.9, 0, 0.2], kneeL: [1.4, 0, 0], hipR: [-0.6, 0, -1.0], kneeR: [0.3, 0, 0], shoulderL: [-0.6, 0, 1.2], shoulderR: [-0.6, 0, -1.2] }, ease: 'linear' },
      { t: 1, pose: m(stance, { yaw: TAU, y: -0.2, kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], hipL: [-0.5, 0, 0.15], hipR: [-0.5, 0, -0.15], shoulderL: [-0.4, 0, 1.0], shoulderR: [-0.4, 0, -1.0] }), ease: 'in' },
    ],
  },
  {
    // Body goes horizontal and spins, legs scissor through the air.
    id: 'butterfly_kick',
    loop: false,
    keys: [
      { t: 0, pose: { y: 0, pitch: 0.3, yaw: 0, hipL: [-0.6, 0, 0.2], kneeL: [0.8, 0, 0], hipR: [-0.6, 0, -0.2], kneeR: [0.8, 0, 0], shoulderL: [-0.6, 0, 1.3], shoulderR: [-0.6, 0, -1.3] } },
      { t: 0.3, pose: { y: 0.2, pitch: 1.3, yaw: 0.7 * PI, hipL: [0.9, 0, 0.6], kneeL: [0.05, 0, 0], hipR: [-0.5, 0, -0.6], kneeR: [0.1, 0, 0], shoulderL: [0, 0, 1.55], elbowL: [0, 0, 0], shoulderR: [0, 0, -1.55], elbowR: [0, 0, 0], neck: [-0.6, 0, 0] }, ease: 'out' },
      { t: 0.65, pose: { y: 0.2, pitch: 1.35, yaw: 1.5 * PI, hipL: [-0.5, 0, 0.6], kneeL: [0.1, 0, 0], hipR: [0.9, 0, -0.6], kneeR: [0.05, 0, 0], shoulderL: [0, 0, 1.55], elbowL: [0, 0, 0], shoulderR: [0, 0, -1.55], elbowR: [0, 0, 0], neck: [-0.6, 0, 0] }, ease: 'linear' },
      { t: 1, pose: m(stance, { yaw: TAU, y: -0.22, pitch: 0.2, kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0], hipL: [-0.6, 0, 0.2], hipR: [-0.6, 0, -0.2], shoulderL: [-0.3, 0, 1.2], shoulderR: [-0.3, 0, -1.2] }), ease: 'in' },
    ],
  },
  {
    // Player bail: flail, fall on the butt, get back up.
    id: 'bail',
    loop: false,
    keys: [
      { t: 0, pose: m(stance, {}) },
      { t: 0.15, pose: { y: 0.02, pitch: -0.45, shoulderL: [-2.6, 0, 0.9], shoulderR: [-2.2, 0, -1.1], elbowL: [-0.4, 0, 0], elbowR: [-0.8, 0, 0], hipL: [-0.6, 0, 0.2], kneeL: [0.3, 0, 0], hipR: [0.2, 0, -0.2], neck: [-0.5, 0, 0] }, ease: 'out' },
      { t: 0.4, pose: { y: -0.62, pitch: -0.55, shoulderL: [0.9, 0, 0.5], shoulderR: [0.9, 0, -0.5], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0], hipL: [-1.3, 0, 0.3], kneeL: [0.5, 0, 0], hipR: [-1.4, 0, -0.3], kneeR: [0.3, 0, 0], neck: [0.5, 0, 0] }, ease: 'in' },
      { t: 0.7, pose: { y: -0.6, pitch: -0.35, shoulderL: [0.7, 0, 0.5], shoulderR: [0.7, 0, -0.5], hipL: [-1.4, 0, 0.3], kneeL: [0.9, 0, 0], hipR: [-1.4, 0, -0.3], kneeR: [0.9, 0, 0], neck: [0.2, 0.5, 0] } },
      { t: 1, pose: m(stance, {}), ease: 'inOut' },
    ],
  },

  // ---------------------------------------------------------------- crowd
  {
    id: 'bob',
    loop: true,
    keys: [
      { t: 0, pose: m(stance, { y: -0.06, neck: [0.25, 0, 0], kneeL: [0.32, 0, 0], kneeR: [0.32, 0, 0] }) },
      { t: 0.25, pose: m(stance, { y: -0.01, neck: [0, 0, 0] }) },
      { t: 0.5, pose: m(stance, { y: -0.06, neck: [0.25, 0, 0], kneeL: [0.32, 0, 0], kneeR: [0.32, 0, 0] }) },
      { t: 0.75, pose: m(stance, { y: -0.01, neck: [0, 0, 0] }) },
      { t: 1, pose: m(stance, { y: -0.06, neck: [0.25, 0, 0], kneeL: [0.32, 0, 0], kneeR: [0.32, 0, 0] }) },
    ],
  },
  {
    id: 'headbang',
    loop: true,
    keys: [
      { t: 0, pose: m(stance, { y: -0.08, spine: [0.45, 0, 0], neck: [0.7, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] }) },
      { t: 0.5, pose: m(stance, { y: -0.02, spine: [0.1, 0, 0], neck: [-0.35, 0, 0] }) },
      { t: 1, pose: m(stance, { y: -0.08, spine: [0.45, 0, 0], neck: [0.7, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] }) },
    ],
  },
  {
    id: 'fist_pump',
    loop: true,
    keys: [
      { t: 0, pose: m(stance, { y: -0.06, neck: [0.2, 0, 0], shoulderR: [-2.7, 0, -0.2], elbowR: [-0.2, 0, 0] }) },
      { t: 0.5, pose: m(stance, { y: -0.01, neck: [-0.1, 0, 0], shoulderR: [-1.7, 0, -0.3], elbowR: [-1.8, 0, 0] }) },
      { t: 1, pose: m(stance, { y: -0.06, neck: [0.2, 0, 0], shoulderR: [-2.7, 0, -0.2], elbowR: [-0.2, 0, 0] }) },
    ],
  },
  {
    // The classic "arms crossed, not impressed" guy at the back.
    id: 'arms_crossed',
    loop: true,
    keys: [
      { t: 0, pose: m(stance, { spine: [-0.05, 0.05, 0], neck: [0.05, 0, 0], shoulderL: [-0.75, -0.5, -0.25], elbowL: [-1.9, 0, 0], shoulderR: [-0.65, 0.5, 0.25], elbowR: [-1.9, 0, 0] }) },
      { t: 0.5, pose: m(stance, { spine: [-0.05, -0.05, 0], neck: [0.12, 0, 0], shoulderL: [-0.75, -0.5, -0.25], elbowL: [-1.9, 0, 0], shoulderR: [-0.65, 0.5, 0.25], elbowR: [-1.9, 0, 0] }) },
      { t: 1, pose: m(stance, { spine: [-0.05, 0.05, 0], neck: [0.05, 0, 0], shoulderL: [-0.75, -0.5, -0.25], elbowL: [-1.9, 0, 0], shoulderR: [-0.65, 0.5, 0.25], elbowR: [-1.9, 0, 0] }) },
    ],
  },
  {
    id: 'jump_cheer',
    loop: true,
    keys: [
      { t: 0, pose: m(stance, { y: -0.14, kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], hipL: [-0.35, 0, 0.1], hipR: [-0.35, 0, -0.1], shoulderL: [-2.5, 0, 0.4], shoulderR: [-2.5, 0, -0.4], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0] }) },
      { t: 0.5, pose: { y: 0.22, hipL: [-0.2, 0, 0.1], kneeL: [0.4, 0, 0], hipR: [-0.2, 0, -0.1], kneeR: [0.4, 0, 0], shoulderL: [-2.9, 0, 0.5], shoulderR: [-2.9, 0, -0.5], elbowL: [-0.1, 0, 0], elbowR: [-0.1, 0, 0], neck: [-0.3, 0, 0] }, ease: 'out' },
      { t: 1, pose: m(stance, { y: -0.14, kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], hipL: [-0.35, 0, 0.1], hipR: [-0.35, 0, -0.1], shoulderL: [-2.5, 0, 0.4], shoulderR: [-2.5, 0, -0.4], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0] }), ease: 'in' },
    ],
  },
  {
    id: 'cheer',
    loop: false,
    keys: [
      { t: 0, pose: m(stance, {}) },
      { t: 0.15, pose: m(stance, { y: 0.05, shoulderL: [-2.8, 0, 0.5], shoulderR: [-2.8, 0, -0.5], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0], neck: [-0.4, 0, 0] }), ease: 'back' },
      { t: 0.35, pose: m(stance, { y: -0.05, shoulderL: [-2.4, 0, 0.6], shoulderR: [-2.4, 0, -0.6], elbowL: [-0.9, 0, 0], elbowR: [-0.9, 0, 0], neck: [-0.2, 0, 0] }) },
      { t: 0.55, pose: m(stance, { y: 0.05, shoulderL: [-2.8, 0, 0.5], shoulderR: [-2.8, 0, -0.5], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0], neck: [-0.4, 0, 0] }) },
      { t: 1, pose: m(stance, {}) },
    ],
  },
  {
    id: 'ooh',
    loop: false,
    keys: [
      { t: 0, pose: m(stance, {}) },
      { t: 0.2, pose: m(stance, { pitch: -0.15, shoulderL: [-2.3, 0, 0.9], elbowL: [-2.1, 0, 0], shoulderR: [-2.3, 0, -0.9], elbowR: [-2.1, 0, 0], neck: [-0.3, 0, 0] }), ease: 'out' },
      { t: 0.75, pose: m(stance, { pitch: -0.1, shoulderL: [-2.3, 0, 0.9], elbowL: [-2.1, 0, 0], shoulderR: [-2.3, 0, -0.9], elbowR: [-2.1, 0, 0], neck: [0.2, 0, 0] }) },
      { t: 1, pose: m(stance, {}) },
    ],
  },
  {
    id: 'shove',
    loop: false,
    keys: [
      { t: 0, pose: m(stance, { shoulderL: [-1.2, 0, 0.2], elbowL: [-1.6, 0, 0], shoulderR: [-1.2, 0, -0.2], elbowR: [-1.6, 0, 0] }) },
      { t: 0.35, pose: m(stance, { pitch: 0.25, shoulderL: [-1.5, 0, 0.15], elbowL: [-0.1, 0, 0], shoulderR: [-1.5, 0, -0.15], elbowR: [-0.1, 0, 0], neck: [-0.2, 0, 0] }), ease: 'back' },
      { t: 1, pose: m(stance, {}) },
    ],
  },
  {
    id: 'stumble',
    loop: false,
    keys: [
      { t: 0, pose: m(stance, {}) },
      { t: 0.2, pose: { pitch: -0.4, y: -0.05, shoulderL: [-2.4, 0, 1.0], shoulderR: [-2.0, 0, -1.2], hipL: [0.4, 0, 0.2], kneeL: [0.6, 0, 0], hipR: [-0.5, 0, -0.2], neck: [-0.5, 0, 0] }, ease: 'out' },
      { t: 0.55, pose: { pitch: 0.2, y: -0.12, shoulderL: [-1.0, 0, 1.2], shoulderR: [-1.0, 0, -1.2], hipL: [-0.6, 0, 0.2], kneeL: [0.8, 0, 0], hipR: [0.3, 0, -0.2], kneeR: [0.6, 0, 0] } },
      { t: 1, pose: m(stance, {}) },
    ],
  },
  {
    // Crowd surfer lying on their back, flailing.
    id: 'surf',
    loop: true,
    keys: [
      { t: 0, pose: { pitch: -1.5, roll: 0.15, shoulderL: [-1.8, 0, 0.9], shoulderR: [-2.4, 0, -0.5], elbowL: [-0.4, 0, 0], hipL: [-0.2, 0, 0.3], hipR: [-0.5, 0, -0.2], kneeR: [0.6, 0, 0], neck: [0.5, 0, 0] } },
      { t: 0.5, pose: { pitch: -1.5, roll: -0.15, shoulderL: [-2.4, 0, 0.5], shoulderR: [-1.8, 0, -0.9], elbowR: [-0.4, 0, 0], hipL: [-0.5, 0, 0.2], kneeL: [0.6, 0, 0], hipR: [-0.2, 0, -0.3], neck: [0.5, 0, 0] } },
      { t: 1, pose: { pitch: -1.5, roll: 0.15, shoulderL: [-1.8, 0, 0.9], shoulderR: [-2.4, 0, -0.5], elbowL: [-0.4, 0, 0], hipL: [-0.2, 0, 0.3], hipR: [-0.5, 0, -0.2], kneeR: [0.6, 0, 0], neck: [0.5, 0, 0] } },
    ],
  },

  // ---------------------------------------------------------------- band
  {
    id: 'band_vocals',
    loop: true,
    keys: [
      { t: 0, pose: m(stance, { spine: [0.4, 0, 0], neck: [0.2, 0, 0], shoulderR: [-1.7, 0, -0.1], elbowR: [-2.1, 0, 0], shoulderL: [-1.6, 0, 0.6], elbowL: [-0.2, 0, 0] }) },
      { t: 0.25, pose: m(stance, { spine: [0.3, 0.2, 0], neck: [0, 0, 0], shoulderR: [-1.7, 0, -0.1], elbowR: [-2.1, 0, 0], shoulderL: [-0.8, 0, 0.4], elbowL: [-0.8, 0, 0] }) },
      { t: 0.5, pose: m(stance, { spine: [0.45, 0, 0], neck: [0.3, 0, 0], shoulderR: [-1.7, 0, -0.1], elbowR: [-2.1, 0, 0], shoulderL: [-2.4, 0, 0.3], elbowL: [-0.2, 0, 0] }) },
      { t: 0.75, pose: m(stance, { spine: [0.3, -0.2, 0], neck: [0, 0, 0], shoulderR: [-1.7, 0, -0.1], elbowR: [-2.1, 0, 0], shoulderL: [-0.8, 0, 0.4], elbowL: [-0.8, 0, 0] }) },
      { t: 1, pose: m(stance, { spine: [0.4, 0, 0], neck: [0.2, 0, 0], shoulderR: [-1.7, 0, -0.1], elbowR: [-2.1, 0, 0], shoulderL: [-1.6, 0, 0.6], elbowL: [-0.2, 0, 0] }) },
    ],
  },
  {
    id: 'band_vocals_heavy',
    loop: true,
    keys: [
      { t: 0, pose: m(stance, { y: -0.18, spine: [0.7, 0, 0], neck: [0.5, 0, 0], kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0], hipL: [-0.4, 0, 0.3], hipR: [-0.4, 0, -0.3], shoulderR: [-1.6, 0, -0.1], elbowR: [-2.2, 0, 0], shoulderL: [0.3, 0, 0.5] }) },
      { t: 0.5, pose: m(stance, { y: -0.05, spine: [0.2, 0, 0], neck: [-0.4, 0, 0], hipL: [-0.1, 0, 0.3], hipR: [-0.1, 0, -0.3], shoulderR: [-1.6, 0, -0.1], elbowR: [-2.2, 0, 0], shoulderL: [-2.6, 0, 0.4] }) },
      { t: 1, pose: m(stance, { y: -0.18, spine: [0.7, 0, 0], neck: [0.5, 0, 0], kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0], hipL: [-0.4, 0, 0.3], hipR: [-0.4, 0, -0.3], shoulderR: [-1.6, 0, -0.1], elbowR: [-2.2, 0, 0], shoulderL: [0.3, 0, 0.5] }) },
    ],
  },
  {
    id: 'band_guitar',
    loop: true,
    keys: [
      { t: 0, pose: m(stance, { y: -0.08, spine: [0.3, 0, 0], neck: [0.45, 0, 0], shoulderL: [-1.0, 0.3, 0.6], elbowL: [-1.4, 0, 0], shoulderR: [-0.6, 0, -0.3], elbowR: [-1.0, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] }) },
      { t: 0.5, pose: m(stance, { y: -0.02, spine: [0.15, 0, 0], neck: [-0.1, 0, 0], shoulderL: [-1.0, 0.3, 0.6], elbowL: [-1.4, 0, 0], shoulderR: [-0.3, 0, -0.3], elbowR: [-1.6, 0, 0] }) },
      { t: 1, pose: m(stance, { y: -0.08, spine: [0.3, 0, 0], neck: [0.45, 0, 0], shoulderL: [-1.0, 0.3, 0.6], elbowL: [-1.4, 0, 0], shoulderR: [-0.6, 0, -0.3], elbowR: [-1.0, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] }) },
    ],
  },
  {
    id: 'band_guitar_heavy',
    loop: true,
    keys: [
      { t: 0, pose: { y: -0.22, spine: [0.75, 0, 0], neck: [0.8, 0, 0], hipL: [-0.5, 0, 0.35], kneeL: [0.9, 0, 0], hipR: [-0.5, 0, -0.35], kneeR: [0.9, 0, 0], shoulderL: [-1.2, 0.3, 0.6], elbowL: [-1.3, 0, 0], shoulderR: [-0.8, 0, -0.3], elbowR: [-0.8, 0, 0] } },
      { t: 0.5, pose: { y: -0.12, spine: [0.3, 0, 0], neck: [-0.5, 0, 0], hipL: [-0.3, 0, 0.35], kneeL: [0.6, 0, 0], hipR: [-0.3, 0, -0.35], kneeR: [0.6, 0, 0], shoulderL: [-1.2, 0.3, 0.6], elbowL: [-1.3, 0, 0], shoulderR: [-0.3, 0, -0.3], elbowR: [-1.7, 0, 0] } },
      { t: 1, pose: { y: -0.22, spine: [0.75, 0, 0], neck: [0.8, 0, 0], hipL: [-0.5, 0, 0.35], kneeL: [0.9, 0, 0], hipR: [-0.5, 0, -0.35], kneeR: [0.9, 0, 0], shoulderL: [-1.2, 0.3, 0.6], elbowL: [-1.3, 0, 0], shoulderR: [-0.8, 0, -0.3], elbowR: [-0.8, 0, 0] } },
    ],
  },
  {
    id: 'band_drums',
    loop: true,
    keys: [
      { t: 0, pose: { y: -0.42, hipL: [-1.5, 0, 0.3], kneeL: [1.5, 0, 0], hipR: [-1.5, 0, -0.3], kneeR: [1.5, 0, 0], spine: [0.25, 0, 0], neck: [0.4, 0, 0], shoulderL: [-1.3, 0, 0.3], elbowL: [-0.4, 0, 0], shoulderR: [-0.7, 0, -0.3], elbowR: [-1.6, 0, 0] } },
      { t: 0.5, pose: { y: -0.42, hipL: [-1.5, 0, 0.3], kneeL: [1.5, 0, 0], hipR: [-1.5, 0, -0.3], kneeR: [1.5, 0, 0], spine: [0.15, 0, 0], neck: [0, 0, 0], shoulderL: [-0.7, 0, 0.3], elbowL: [-1.6, 0, 0], shoulderR: [-1.3, 0, -0.3], elbowR: [-0.4, 0, 0] } },
      { t: 1, pose: { y: -0.42, hipL: [-1.5, 0, 0.3], kneeL: [1.5, 0, 0], hipR: [-1.5, 0, -0.3], kneeR: [1.5, 0, 0], spine: [0.25, 0, 0], neck: [0.4, 0, 0], shoulderL: [-1.3, 0, 0.3], elbowL: [-0.4, 0, 0], shoulderR: [-0.7, 0, -0.3], elbowR: [-1.6, 0, 0] } },
    ],
  },
];

// ---------------------------------------------------------------- compile & sample

function compile(def: ClipDef): CompiledClip {
  const keys = def.keys.slice().sort((a, b) => a.t - b.t);
  return {
    id: def.id,
    loop: def.loop,
    times: keys.map((k) => k.t),
    poses: keys.map((k) => writeSpec(createPose(), k.pose)),
    eases: keys.map((k) => k.ease ?? 'inOut'),
  };
}

export const CLIPS: ReadonlyMap<string, CompiledClip> = new Map(DEFS.map((d) => [d.id, compile(d)]));

export function getClip(id: string): CompiledClip {
  return CLIPS.get(id) ?? CLIPS.get('idle')!;
}

function ease(kind: Ease, t: number): number {
  switch (kind) {
    case 'linear':
      return t;
    case 'in':
      return t * t;
    case 'out':
      return 1 - (1 - t) * (1 - t);
    case 'back': {
      const c = 1.9;
      const x = t - 1;
      return 1 + (c + 1) * x * x * x + c * x * x;
    }
    default:
      return t * t * (3 - 2 * t);
  }
}

/** Sample a clip at normalised time `t` into `out`. */
export function sampleClip(clip: CompiledClip, t: number, out: Pose, mirror = false): Pose {
  const times = clip.times;
  const n = times.length;
  const x = clip.loop ? t - Math.floor(t) : Math.min(1, Math.max(0, t));
  if (n === 1 || x <= times[0]!) {
    out.set(clip.poses[0]!);
  } else if (x >= times[n - 1]!) {
    out.set(clip.poses[n - 1]!);
  } else {
    let i = 1;
    while (i < n - 1 && times[i]! < x) i++;
    const t0 = times[i - 1]!;
    const t1 = times[i]!;
    const k = ease(clip.eases[i]!, (x - t0) / (t1 - t0));
    const a = clip.poses[i - 1]!;
    const b = clip.poses[i]!;
    for (let j = 0; j < POSE_SIZE; j++) out[j] = a[j]! + (b[j]! - a[j]!) * k;
  }
  if (mirror) mirrorPose(out);
  return out;
}
