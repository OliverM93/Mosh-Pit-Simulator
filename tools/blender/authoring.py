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
            foot_w = _rot((d.get(f'foot_pitch_{s}', 0.0), 0, 0)) @ s_world[chain[2]]
            _solve_chain(sk, local, root, chain, target, pelvis_r @ s_knee_pole[s], foot_w)
        # Arms: hand targets ride with the chest.
        world, head = sk.fk(local, root)
        c = world[chest] @ sk.rest[chest].inverted()
        for s, chain in ARMS.items():
            target = head[chest] + c @ (s_hand[s] + d.get(f'hand_{s}', Vector()))
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


def two_step(t):
    """One 2-step: hop on the left foot while the right leg swings forward and *across* in front of it
    (crossing over to the left), then back. Hips turn into the cross, chest and arms swing against it.
    Chained/held 2-steps alternate sides and form a continuous rhythm."""
    swing = bump(t, 0.04, 0.9)
    across = bump(t, 0.12, 0.85)
    hop = bump(t, 0.12, 0.58)
    land = bump(t, 0.55, 1.0)
    return {
        'pelvis': Vector((0.08 * swing, -0.05 * swing, 0.11 * hop - 0.07 * land)),
        'pelvis_rot': (-0.06 * swing, -0.1 * swing, -0.45 * across),
        'chest_rot': (0.12 * swing, 0.08 * swing, 0.62 * across),
        # Right foot: forward, up and across the left leg (ends left of the left foot's line).
        'foot_R': Vector((0.62 * across, -0.42 * swing, 0.34 * bump(t, 0.1, 0.8))),
        'foot_pitch_R': -0.55 * swing,
        'foot_L': Vector((0.02 * swing, 0.0, 0.12 * hop)),
        # Arms swing against the legs: right arm drives back, left arm swings forward/down across.
        'hand_R': Vector((-0.2 * swing, 0.5 * swing, -0.45 * swing)),
        'hand_L': Vector((-0.28 * swing, -0.32 * swing, -0.38 * swing)),
    }


def _shoulder_circle(side, a, r, out0, out1):
    """Hand offset (from the stance fist) on a circle around the shoulder. a = 0 top, a grows forward→down."""
    out_x = side * (out0 + out1 * (1 - math.cos(a)) / 2)
    return Vector((out_x, 0.22 - r * math.sin(a), r * math.cos(a) - 0.2))


def arm_swing(t):
    """Powerful backward arm swing: the right arm whips up the front, over the top and down behind the body
    (full backward circle), the left arm punches forward/down against it, the torso twists and rocks with it.
    Alternating presses mirror it (left arm swings)."""
    env = ease_io(min(1.0, t / 0.12, (1 - t) / 0.16))
    # Slow wind-up, fast whip through the top and back, slower recovery.
    p = ease_io(min(1.0, max(0.0, (t - 0.05) / 0.8)))
    # Angle on the shoulder circle: low in front (0.8 pi) → up the front → over the top (0) → low behind (-0.85 pi).
    a = 0.8 * math.pi * (1 - p) - 0.85 * math.pi * p
    hand_r = _shoulder_circle(-1, a, 0.62, 0.12, 0.25)
    back = bump(t, 0.25, 1.0)
    return {
        'pelvis': Vector((0, 0, -0.07 * env)),
        'chest_rot': (0.25 * env - 0.3 * bump(t, 0.2, 0.6), 0.1 * back, -0.7 * back),
        'hand_R': hand_r * env,
        'hand_L': Vector((-0.18, -0.38, -0.32)) * bump(t, 0.15, 1.0),
    }


def windmill(t):
    """Forward windmill: both arms circle forward (up behind, over the top, down the front), alternating,
    with the torso pumping forward on every down-stroke and twisting with the arms."""
    env = ease_io(min(1.0, t / 0.12, (1 - t) / 0.14))
    th = 2 * math.pi * 2 * t
    a = th + 0.45 * math.sin(th)  # faster on the down-stroke = power
    out = {
        'pelvis': Vector((0, 0, (-0.06 + 0.035 * math.cos(2 * th)) * env)),
        'chest_rot': ((0.25 + 0.15 * math.sin(2 * th)) * env, 0, 0.45 * env * math.sin(th)),
    }
    for s, phase, side in (('L', 0.0, 1), ('R', math.pi, -1)):
        out[f'hand_{s}'] = _shoulder_circle(side, a + phase, 0.6, 0.16, 0.34) * env
    return out


AUTHORED = [
    # (clip name, duration s, spec, mirrored copy)
    ('two_step', 0.5, two_step, True),
    ('arm_swing', 0.6, arm_swing, True),
    ('windmill', 0.9, windmill, False),
]
