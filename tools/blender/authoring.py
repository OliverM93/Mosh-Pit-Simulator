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

from retarget import POSES, postprocess, write_action

LEGS = {'L': ('upperleg01.L', 'lowerleg01.L', 'foot.L'), 'R': ('upperleg01.R', 'lowerleg01.R', 'foot.R')}
ARMS = {'L': ('upperarm01.L', 'lowerarm01.L', 'wrist.L'), 'R': ('upperarm01.R', 'lowerarm01.R', 'wrist.R')}
FPS = 30


class Skeleton:
    """FK on local pose quaternions (same convention as retarget.world_to_local)."""

    def __init__(self, rig):
        self.bones = rig.data.bones
        self.order = [b.name for b in self.bones]
        self.rest = {b.name: b.matrix_local.to_3x3() for b in self.bones}
        self.rest_head = {b.name: b.head_local.copy() for b in self.bones}

    def fk(self, local, root_pos):
        world, head = {}, {}
        for n in self.order:
            b = self.bones[n]
            q = local[n].to_matrix()
            if b.parent is None:
                world[n] = self.rest[n] @ q
                head[n] = root_pos.copy()
            else:
                p = b.parent.name
                world[n] = world[p] @ (self.rest[p].inverted() @ self.rest[n]) @ q
                head[n] = head[p] + world[p] @ (self.rest[p].inverted() @ (self.rest_head[n] - self.rest_head[p]))
        return world, head

    def set_world(self, local, world, n, w_new):
        """Change one bone's world rotation (its children follow on the next fk)."""
        b = self.bones[n]
        if b.parent is None:
            local[n] = (self.rest[n].inverted() @ w_new).to_quaternion()
        else:
            p = b.parent.name
            local_rest = self.rest[p].inverted() @ self.rest[n]
            local[n] = (local_rest.inverted() @ world[p].inverted() @ w_new).to_quaternion()


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


def two_step(t):
    """One 2-step: hop off the left foot while the right foot kicks out diagonally in front (reads from behind
    the player too), weight shifts onto the left side, the left fist punches across, the right arm swings wide."""
    kick = bump(t, 0.06, 0.88)
    hop = bump(t, 0.18, 0.6)
    land = bump(t, 0.55, 1.0)
    return {
        'pelvis': Vector((0.1 * kick, -0.06 * kick, 0.09 * hop - 0.06 * land)),
        'pelvis_rot': (-0.1 * kick, 0.12 * kick, 0.28 * kick),
        'chest_rot': (0.15 * kick, -0.2 * kick, -0.5 * kick),
        'foot_R': Vector((-0.42 * kick, -0.5 * kick, 0.38 * bump(t, 0.1, 0.82))),
        'foot_pitch_R': -0.6 * kick,
        'foot_L': Vector((0.04 * kick, -0.04 * kick, 0.1 * hop)),
        # Left fist punches down across the body, right arm swings out wide and back.
        'hand_L': Vector((-0.3 * kick, -0.28 * kick, -0.42 * kick)),
        'hand_R': Vector((-0.38 * kick, 0.22 * kick, -0.05 * kick)),
    }


def windmill(t):
    """Big alternating arm circles (forward over the top, down behind) with a bouncing, twisting torso."""
    env = min(1.0, t / 0.18, (1 - t) / 0.18)
    env = env * env * (3 - 2 * env)
    out = {'pelvis': Vector((0, 0, -0.05 * env + 0.03 * env * math.cos(4 * math.pi * t)))}
    out['chest_rot'] = (0.2 * env, 0, 0.25 * env * math.sin(2 * math.pi * t))
    r = 0.52
    for s, phase, side in (('L', 0.0, 1), ('R', math.pi, -1)):
        a = 2 * math.pi * t * 2 + phase  # two turns per clip
        # Circle around the shoulder (the stance fists sit in front of the chin), tilted outwards so the arm
        # sweeps wide past the side on the way down – readable from behind.
        out_x = side * (0.18 + 0.32 * (1 - math.cos(a)) / 2)
        circle = Vector((out_x, 0.22 - r * math.sin(a), r * math.cos(a) - 0.2))
        out[f'hand_{s}'] = circle * env
    return out


AUTHORED = [
    # (clip name, duration s, spec, mirrored copy)
    ('two_step', 0.5, two_step, True),
    ('windmill', 0.9, windmill, False),
]
