/**
 * Pose representation shared by player, crowd and band.
 * A pose is a flat Float32Array: 6 root channels + 3 Euler angles per joint.
 * Character faces +Z, +X is the character's LEFT, +Y up.
 * Rotation conventions (radians):
 *  - joint X < 0 swings a hanging limb FORWARD (arm raise, leg kick); knees/elbows bend with X > 0 / X < 0.
 *  - left arm Z > 0 raises it sideways, right arm Z < 0.
 *  - spine/neck X > 0 leans forward.
 */

export const JOINTS = ['spine', 'neck', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'hipR', 'kneeR'] as const;
export type JointName = (typeof JOINTS)[number];

/** Root channels: local offsets (m) and body rotation (rad), applied around the hips. */
export const ROOT = ['x', 'y', 'z', 'pitch', 'yaw', 'roll'] as const;
export type RootChannel = (typeof ROOT)[number];

export const ROOT_COUNT = ROOT.length;
export const POSE_SIZE = ROOT_COUNT + JOINTS.length * 3;

export const JOINT_INDEX: Record<JointName, number> = Object.fromEntries(JOINTS.map((j, i) => [j, ROOT_COUNT + i * 3])) as Record<JointName, number>;
export const ROOT_INDEX: Record<RootChannel, number> = Object.fromEntries(ROOT.map((r, i) => [r, i])) as Record<RootChannel, number>;

export type Pose = Float32Array;
export type Vec3 = readonly [number, number, number];

/** Sparse authoring format – unspecified channels fall back to the base pose. */
export type PoseSpec = Partial<Record<JointName, Vec3>> & Partial<Record<RootChannel, number>>;

export function createPose(): Pose {
  return new Float32Array(POSE_SIZE);
}

/** Relaxed standing pose every spec is layered on. */
export const BASE_SPEC: PoseSpec = {
  shoulderL: [0, 0, 0.1],
  shoulderR: [0, 0, -0.1],
  elbowL: [-0.15, 0, 0],
  elbowR: [-0.15, 0, 0],
};

export function writeSpec(out: Pose, spec: PoseSpec, base: PoseSpec = BASE_SPEC): Pose {
  out.fill(0);
  apply(out, base);
  apply(out, spec);
  return out;
}

function apply(out: Pose, spec: PoseSpec): void {
  for (const r of ROOT) {
    const v = spec[r];
    if (v !== undefined) out[ROOT_INDEX[r]] = v;
  }
  for (const j of JOINTS) {
    const v = spec[j];
    if (!v) continue;
    const i = JOINT_INDEX[j];
    out[i] = v[0];
    out[i + 1] = v[1];
    out[i + 2] = v[2];
  }
}

export function lerpPose(out: Pose, a: Pose, b: Pose, t: number): Pose {
  for (let i = 0; i < POSE_SIZE; i++) out[i] = a[i]! + (b[i]! - a[i]!) * t;
  return out;
}

const MIRROR_PAIRS: [JointName, JointName][] = [
  ['shoulderL', 'shoulderR'],
  ['elbowL', 'elbowR'],
  ['hipL', 'hipR'],
  ['kneeL', 'kneeR'],
];

/** Mirror left/right in place: swap paired joints, negate Y/Z rotations and lateral root channels. */
export function mirrorPose(p: Pose): Pose {
  for (const [l, r] of MIRROR_PAIRS) {
    const li = JOINT_INDEX[l];
    const ri = JOINT_INDEX[r];
    for (let k = 0; k < 3; k++) {
      const t = p[li + k]!;
      p[li + k] = p[ri + k]!;
      p[ri + k] = t;
    }
  }
  for (const j of JOINTS) {
    const i = JOINT_INDEX[j];
    p[i + 1] = -p[i + 1]!;
    p[i + 2] = -p[i + 2]!;
  }
  p[ROOT_INDEX.x] = -p[ROOT_INDEX.x]!;
  p[ROOT_INDEX.yaw] = -p[ROOT_INDEX.yaw]!;
  p[ROOT_INDEX.roll] = -p[ROOT_INDEX.roll]!;
  return p;
}

const TAU = Math.PI * 2;

/** Make `from`'s angles the closest equivalent to `to` so blends never spin the long way round. */
export function unwrapToward(from: Pose, to: Pose): void {
  // Channels 0..2 are root offsets in metres; everything from 3 on is an angle.
  for (let i = 3; i < POSE_SIZE; i++) {
    const d = from[i]! - to[i]!;
    if (Math.abs(d) > Math.PI) from[i] = to[i]! + (((d + Math.PI) % TAU) + TAU) % TAU - Math.PI;
  }
}
