"""
Video mocap (D-031): MediaPipe Pose world landmarks (see video/pose_video.py) → game skeleton.

Limbs are aimed bone by bone at the landmark segments (shoulder→elbow→wrist, hip→knee→ankle→toe), the pelvis,
chest and head get full orientations from hip/shoulder/ear pairs, and the root height comes from the hips'
vertical movement in the image (MediaPipe world coordinates are hip-centred, so the hop would be lost otherwise).
A repeating cycle is cut out, smoothed into a loop, settled onto the floor and split into its two halves
(one 2-step each side) that flow into each other.
"""
import json
import math

from mathutils import Matrix, Quaternion, Vector

from retarget import Skeleton, settle_keys, write_action

# MediaPipe landmark indices (person's left/right).
NOSE, L_EAR, R_EAR = 0, 7, 8
L_SH, R_SH, L_EL, R_EL, L_WR, R_WR, L_IDX, R_IDX = 11, 12, 13, 14, 15, 16, 19, 20
L_HIP, R_HIP, L_KNEE, R_KNEE, L_ANK, R_ANK, L_HEEL, R_HEEL, L_TOE, R_TOE = 23, 24, 25, 26, 27, 28, 29, 30, 31, 32

# (bone, from landmark, to landmark, joint whose head ends the bone's segment)
LIMBS = [
    ('upperarm01.L', L_SH, L_EL, 'lowerarm01.L'), ('lowerarm01.L', L_EL, L_WR, 'wrist.L'),
    ('upperarm01.R', R_SH, R_EL, 'lowerarm01.R'), ('lowerarm01.R', R_EL, R_WR, 'wrist.R'),
    ('upperleg01.L', L_HIP, L_KNEE, 'lowerleg01.L'), ('lowerleg01.L', L_KNEE, L_ANK, 'foot.L'),
    ('foot.L', L_ANK, L_TOE, 'toe1-1.L'),
    ('upperleg01.R', R_HIP, R_KNEE, 'lowerleg01.R'), ('lowerleg01.R', R_KNEE, R_ANK, 'foot.R'),
    ('foot.R', R_ANK, R_TOE, 'toe1-1.R'),
]
UP = Vector((0, 0, 1))


def _to_blender(p):
    """MediaPipe world (x right in the image = person's left when facing the camera, y down, z away from the
    camera) → armature space (+X left, -Y forward, +Z up)."""
    return Vector((p[0], p[2], -p[1]))


def _smooth(seq, sigma):
    """Gaussian smoothing of a list of equally long lists of Vectors (per landmark)."""
    if sigma <= 0:
        return seq
    r = max(1, int(sigma * 3))
    w = [math.exp(-0.5 * (k / sigma) ** 2) for k in range(-r, r + 1)]
    n = len(seq)
    out = []
    for i in range(n):
        acc = [Vector() for _ in seq[i]]
        tot = 0.0
        for k, wk in zip(range(-r, r + 1), w):
            j = min(n - 1, max(0, i + k))
            tot += wk
            for m, v in enumerate(seq[j]):
                acc[m] += v * wk
        out.append([a / tot for a in acc])
    return out


def _basis(left, up):
    """Rotation whose columns are (left, back, up) – the rest armature axes carried by a body part."""
    x = left.normalized()
    z = (up - x * up.dot(x)).normalized()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()


def load(path, sigma=1.0):
    d = json.load(open(path))
    world = _smooth([[_to_blender(p) for p in f] for f in d['world']], sigma)
    image = _smooth([[Vector((p[0], p[1], 0)) for p in f] for f in d['image']], sigma * 1.5)
    return d['fps'], world, image


def find_cycle(world, pmin, pmax):
    """Best loop window [s, s+p]: limb directions at s and s+p match."""
    def feat(f):
        hip = (f[L_HIP] + f[R_HIP]) * 0.5
        return [f[i] - hip for i in (L_SH, R_SH, L_EL, R_EL, L_WR, R_WR, L_KNEE, R_KNEE, L_ANK, R_ANK)]
    feats = [feat(f) for f in world]
    best = None
    for p in range(pmin, pmax + 1):
        for s in range(0, len(world) - p):
            d = sum((a - b).length for a, b in zip(feats[s], feats[s + p]))
            if best is None or d < best[0]:
                best = (d, s, s + p)
    return best[1], best[2]


def pose_frame(sk, stance_local, f, root):
    """One frame of landmarks → local quaternions (starting from the stance for bones we do not drive)."""
    # Every frame is solved from the rest pose (stance_local only defines which bones exist).
    local = {b: Quaternion() for b in stance_local}
    mid_hip = (f[L_HIP] + f[R_HIP]) * 0.5
    mid_sh = (f[L_SH] + f[R_SH]) * 0.5
    torso_up = (mid_sh - mid_hip).normalized()
    pelvis = _basis(f[L_HIP] - f[R_HIP], (UP + torso_up).normalized())
    chest = _basis(f[L_SH] - f[R_SH], torso_up)
    head = _basis(f[L_EAR] - f[R_EAR], ((f[L_EAR] + f[R_EAR]) * 0.5 - mid_sh).normalized())

    world, _ = sk.fk(local, root)
    sk.set_world(local, world, 'root', pelvis @ sk.rest['root'])
    # Spread the chest's rotation (relative to the pelvis) over three spine bones, the head's over neck + head.
    rel = (chest @ pelvis.inverted()).to_quaternion()
    for b in ('spine05', 'spine03', 'spine01'):
        world, _ = sk.fk(local, root)
        sk.set_world(local, world, b, Quaternion().slerp(rel, 1 / 3).to_matrix() @ world[b])
    rel_h = (head @ chest.inverted()).to_quaternion()
    for b in ('neck01', 'head'):
        world, _ = sk.fk(local, root)
        sk.set_world(local, world, b, Quaternion().slerp(rel_h, 0.5).to_matrix() @ world[b])
    # Limbs: aim each bone's segment at the landmark segment (minimal rotation keeps the parent's twist).
    for bone, a, b, child in LIMBS:
        world, head_pos = sk.fk(local, root)
        cur = head_pos[child] - head_pos[bone]
        want = f[b] - f[a]
        if cur.length < 1e-6 or want.length < 1e-6:
            continue
        sk.set_world(local, world, bone, cur.rotation_difference(want).to_matrix() @ world[bone])
    return local


def build(rig, path, stance, names, *, pmin=18, pmax=45, body_height=1.62, sway=0.5):
    """Bake the video cycle into two actions (`names` = first half, second half)."""
    fps, world, image = load(path)
    s, e = find_cycle(world, pmin, pmax)
    print(f'  video cycle frames {s}-{e} ({(e - s) / fps:.2f}s)')
    sk = Skeleton(rig)
    stance_local, stance_root = stance
    # Image → metres for the root's vertical bounce and lateral sway.
    heights = [((img[L_ANK] + img[R_ANK]) * 0.5 - img[NOSE]).y for img in image[s:e + 1]]
    px_to_m = body_height / (sum(heights) / len(heights))
    hips_img = [(img[L_HIP] + img[R_HIP]) * 0.5 for img in image]
    mean_x = sum(h.x for h in hips_img[s:e + 1]) / (e - s + 1)
    mean_y = sum(h.y for h in hips_img[s:e + 1]) / (e - s + 1)
    keys = []
    for i in range(s, e + 1):
        h = hips_img[i]
        root = stance_root + Vector((-(h.x - mean_x) * px_to_m * sway, 0, -(h.y - mean_y) * px_to_m))
        keys.append((pose_frame(sk, stance_local, world[i], root), root))
    # Close the loop exactly (last key = first), settle the whole cycle on the floor, then split it.
    keys[-1] = keys[0]
    keys = settle_keys(rig, keys)
    mid = len(keys) // 2
    write_action(rig, names[0], keys[:mid + 1], settle=False)
    write_action(rig, names[1], keys[mid:], settle=False)
    return (e - s) / fps
