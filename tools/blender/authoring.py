"""
Hand-authored moves on the game skeleton (D-029): poses are described as offsets from the mocap fighting
stance – pelvis/chest rotation, foot and hand targets – and solved with analytic two-bone IK. Clips start
and end exactly in the stance, so they chain with every other move. Used for the hardcore moves no free
mocap exists for (2-step, windmill).

Armature space: the character faces -Y, +X is its left, +Z up. Offsets for hands are given in that frame
*as carried by the chest* (they turn and lean with the torso).
"""
import math

from mathutils import Euler, Matrix, Vector

from retarget import POSES, Skeleton, postprocess, write_action

LEGS = {'L': ('upperleg01.L', 'lowerleg01.L', 'foot.L'), 'R': ('upperleg01.R', 'lowerleg01.R', 'foot.R')}
ARMS = {'L': ('upperarm01.L', 'lowerarm01.L', 'wrist.L'), 'R': ('upperarm01.R', 'lowerarm01.R', 'wrist.R')}
FPS = 30


def _two_bone(hip, knee, end, target, pole):
    """New middle-joint position for a two-bone chain reaching `target`, bending towards `pole`."""
    l1 = (knee - hip).length
    l2 = (end - knee).length
    d_vec = target - hip
    d = min(max(d_vec.length, 1e-4), (l1 + l2) * 0.999)
    axis = d_vec.normalized()
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, l1 * l1 - a * a))
    p = pole - axis * pole.dot(axis)
    p = p.normalized() if p.length > 1e-6 else Vector((0, -1, 0))
    return hip + axis * a + p * h


def _solve_chain(sk, local, root, chain, target, pole, keep_end_world=None):
    upper, lower, end = chain
    world, head = sk.fk(local, root)
    new_mid = _two_bone(head[upper], head[lower], head[end], target, pole)
    r1 = (head[lower] - head[upper]).rotation_difference(new_mid - head[upper]).to_matrix()
    sk.set_world(local, world, upper, r1 @ world[upper])
    world, head = sk.fk(local, root)
    r2 = (head[end] - head[lower]).rotation_difference(target - head[lower]).to_matrix()
    sk.set_world(local, world, lower, r2 @ world[lower])
    if keep_end_world is not None:  # planted foot keeps its orientation
        world, head = sk.fk(local, root)
        sk.set_world(local, world, end, keep_end_world)


def _rot(e):
    return Euler(e, 'XYZ').to_matrix() if e else Matrix.Identity(3)


def author(rig, name, duration, spec, mirror=False):
    """Bake `spec(t) -> dict` (t = 0..1) into an action. Keys: pelvis (Vector), pelvis_rot, chest_rot (Euler xyz),
    foot_L/foot_R (Vector offsets from the stance), foot_pitch_L/R, hand_L/hand_R (offsets in the chest frame)."""
    sk = Skeleton(rig)
    stance_local, stance_root = POSES['stance']
    s_world, s_head = sk.fk(stance_local, stance_root)
    chest = 'spine01'
    s_chest = s_world[chest] @ sk.rest[chest].inverted()
    s_hand = {s: s_chest.inverted() @ (s_head[ARMS[s][2]] - s_head[chest]) for s in 'LR'}
    s_shoulder = {s: s_chest.inverted() @ (s_head[ARMS[s][0]] - s_head[chest]) for s in 'LR'}
    arm_len = {s: ((s_head[ARMS[s][1]] - s_head[ARMS[s][0]]).length + (s_head[ARMS[s][2]] - s_head[ARMS[s][1]]).length)
               for s in 'LR'}
    s_elbow = {s: s_chest.inverted() @ (s_head[ARMS[s][1]] - s_head[chest]) for s in 'LR'}
    s_knee_pole = {}
    for s, (up, lo, ft) in LEGS.items():
        mid = (s_head[up] + s_head[ft]) * 0.5
        s_knee_pole[s] = (s_head[lo] - mid) + Vector((0, -0.05, 0))

    keys = []
    n = max(2, round(duration * FPS) + 1)
    for k in range(n):
        t = k / (n - 1)
        d = spec(t)
        if mirror:
            d = _mirror_spec(d)
        local = {b: q.copy() for b, q in stance_local.items()}
        root = stance_root + d.get('pelvis', Vector())
        world, _ = sk.fk(local, root)
        sk.set_world(local, world, 'root', _rot(d.get('pelvis_rot')) @ world['root'])
        world, _ = sk.fk(local, root)
        sk.set_world(local, world, 'spine03', _rot(d.get('chest_rot')) @ world['spine03'])
        pelvis_r = _rot(d.get('pelvis_rot'))
        # Legs: feet stay planted at the stance position plus their offsets.
        for s, chain in LEGS.items():
            target = s_head[chain[2]] + d.get(f'foot_{s}', Vector())
            inward = 1 if s == 'R' else -1  # +X is the character's left: the right knee/foot turn in towards +X
            yaw_in = _rot((0, 0, inward * d.get(f'foot_in_{s}', 0.0)))
            foot_w = yaw_in @ _rot((d.get(f'foot_pitch_{s}', 0.0), 0, 0)) @ s_world[chain[2]]
            pole = _rot((0, 0, inward * d.get(f'knee_in_{s}', 0.0))) @ (pelvis_r @ s_knee_pole[s])
            _solve_chain(sk, local, root, chain, target, pole, foot_w)
        # Arms: hand targets ride with the chest.
        world, head = sk.fk(local, root)
        c = world[chest] @ sk.rest[chest].inverted()
        for s, chain in ARMS.items():
            local_t = s_hand[s] + d.get(f'hand_{s}', Vector())
            if f'arm_{s}' in d:
                # Straight-arm swing: direction from the shoulder (chest frame) at nearly full reach, blended
                # with the stance fist by weight w.
                direction, w = d[f'arm_{s}']
                reach = s_shoulder[s] + direction.normalized() * arm_len[s] * 0.96
                local_t = local_t.lerp(reach, w)
            target = head[chest] + c @ local_t
            pole = c @ (s_elbow[s] - s_hand[s] * 0.5 + Vector((0.15 if s == 'L' else -0.15, 0.1, -0.1)))
            _solve_chain(sk, local, root, chain, target, pole)
        keys.append((local, root))
    keys = postprocess(keys)
    write_action(rig, name, keys)
    return n


def _mirror_spec(d):
    out = {}
    for k, v in d.items():
        k2 = k[:-2] + ('_R' if k.endswith('_L') else '_L') if k.endswith(('_L', '_R')) else k
        if isinstance(v, Vector):
            v = Vector((-v.x, v.y, v.z))
        elif isinstance(v, tuple) and len(v) == 2:  # (direction, weight)
            v = (Vector((-v[0].x, v[0].y, v[0].z)), v[1])
        elif isinstance(v, tuple) and len(v) == 3:
            v = (v[0], -v[1], -v[2])
        out[k2] = v
    return out


# ------------------------------------------------------------------ the moves

def bump(t, a, b):
    """0 → 1 → 0 between a and b (smooth)."""
    if t <= a or t >= b:
        return 0.0
    x = (t - a) / (b - a)
    return math.sin(math.pi * x) ** 2


def ease_io(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def path(t, pts):
    """Smooth piecewise path through (time, Vector) points; holds the end points outside."""
    if t <= pts[0][0]:
        return pts[0][1].copy()
    for (t0, a), (t1, b) in zip(pts, pts[1:]):
        if t <= t1:
            return a.lerp(b, ease_io((t - t0) / (t1 - t0)))
    return pts[-1][1].copy()


def scalar(t, pts):
    return path(t, [(k, Vector((v, 0, 0))) for k, v in pts]).x


def two_step(t):
    """Hardcore 2-step (one side): whole-body bounce – hop on the left foot while the right leg turns inward and
    swings in an arc across in front of the left leg, then back out. Hips shift over the support foot, the
    torso rocks back on the hop and drives forward on the landing, arms swing hard against the legs."""
    body = bump(t, 0.02, 0.98)
    hop = bump(t, 0.1, 0.55)
    land = bump(t, 0.5, 0.98)
    foot = path(t, [(0.04, Vector()), (0.28, Vector((0.08, -0.3, 0.3))), (0.5, Vector((0.62, -0.42, 0.24))),
                    (0.7, Vector((0.48, -0.1, 0.1))), (0.92, Vector()), ])
    return {
        'pelvis': Vector((0.13 * body, -0.04 * body, 0.13 * hop - 0.1 * land)),
        'pelvis_rot': (-0.12 * hop + 0.12 * land, 0.12 * body, 0.32 * bump(t, 0.15, 0.8)),
        'chest_rot': (-0.15 * hop + 0.3 * land, -0.12 * body, -0.55 * bump(t, 0.1, 0.85)),
        'foot_R': foot,
        'knee_in_R': 1.1 * bump(t, 0.08, 0.85),
        'foot_in_R': 0.7 * bump(t, 0.1, 0.85),
        'foot_pitch_R': -0.35 * bump(t, 0.15, 0.75),
        'foot_L': Vector((0.03 * body, 0, 0.13 * hop)),
        # Arms swing hard against the legs: left fist chops down across to the right, right arm whips back/out.
        'arm_L': (path(t, [(0, Vector((0.3, -0.6, -0.6))), (0.45, Vector((-0.45, -0.6, -0.65))),
                           (1, Vector((0.2, -0.5, -0.7)))]), 0.85 * body),
        'arm_R': (path(t, [(0, Vector((-0.4, -0.5, -0.6))), (0.45, Vector((-0.75, 0.55, -0.4))),
                           (1, Vector((-0.4, -0.3, -0.7)))]), 0.85 * body),
    }


def arm_swing(t):
    """Powerful backward arm swing, readable from behind: the straight right arm is thrown across the body,
    whips out to the side, over the head and down behind; the left arm swings the opposite way. The torso
    twists hard with the swing and the body dips. Alternating presses mirror it."""
    w = ease_io(min(1.0, t / 0.1, (1 - t) / 0.14))
    right = path(t, [(0.0, Vector((0.45, -0.6, -0.65))), (0.14, Vector((0.5, -0.6, -0.6))),
                     (0.34, Vector((-1.0, -0.25, 0.05))), (0.5, Vector((-0.4, 0.1, 1.0))),
                     (0.68, Vector((-0.55, 0.8, -0.2))), (0.86, Vector((-0.35, 0.35, -0.9))),
                     (1.0, Vector((-0.3, 0.2, -0.9)))])
    left = path(t, [(0.0, Vector((0.6, 0.55, -0.6))), (0.2, Vector((0.7, 0.6, -0.4))),
                    (0.5, Vector((-0.2, -0.85, -0.45))), (0.75, Vector((0.9, -0.2, -0.3))),
                    (1.0, Vector((0.6, 0.3, -0.7)))])
    twist = scalar(t, [(0, 0), (0.14, 0.55), (0.5, -0.1), (0.72, -0.7), (1, -0.3)])
    return {
        'pelvis': Vector((0, 0, -0.09 * bump(t, 0.2, 0.9))),
        'pelvis_rot': (0, 0, 0.25 * twist * w),
        'chest_rot': (0.15 * w, -0.15 * bump(t, 0.35, 0.75), twist * w),
        'arm_R': (right, w),
        'arm_L': (left, 0.9 * w),
    }


def windmill(t):
    """Forward windmill with straight arms: both arms circle forward (up behind, over the top, down the front),
    alternating, in planes tilted outwards so they read from behind; the torso pumps on every down-stroke."""
    env = ease_io(min(1.0, t / 0.1, (1 - t) / 0.12))
    th = 2 * math.pi * 2 * t
    a = th + 0.45 * math.sin(th)  # faster on the down-stroke = power
    out = {
        'pelvis': Vector((0, 0, (-0.07 + 0.04 * math.cos(2 * th)) * env)),
        'chest_rot': ((0.3 + 0.15 * math.sin(2 * th)) * env, 0, 0.45 * env * math.sin(th)),
    }
    for s, phase, side in (('L', 0.0, 1), ('R', math.pi, -1)):
        aa = a + phase
        out[f'arm_{s}'] = (Vector((side * 0.55, -math.sin(aa), math.cos(aa))), env)
    return out


AUTHORED = [
    # (clip name, duration s, spec, mirrored copy)
    ('two_step', 0.5, two_step, True),
    ('arm_swing', 0.6, arm_swing, True),
    ('windmill', 0.9, windmill, False),
]
