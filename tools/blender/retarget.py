"""
Retarget CMU BVH motion capture onto the MakeHuman game skeleton.

Per mapped bone the *world* rotation change of the source joint (relative to
its T-pose rest) is applied to a reference pose of the target bone whose rest
direction has been aligned to the source rest direction (A-pose -> T-pose).
Unmapped target bones keep their rest offset to the parent. Root height is
scaled by the hip-height ratio. Clips are re-oriented to face -Y (character
front), their net yaw drift is removed so they start and end facing the same
way, and horizontal root travel can be stripped (the game moves the player).
"""
import math

import bpy
from mathutils import Matrix, Quaternion, Vector

from bvhreader import BVH

MAP = {
    'root': 'Hips',
    'spine05': 'LowerBack',
    'spine03': 'Spine',
    'spine01': 'Spine1',
    'neck01': 'Neck',
    'neck03': 'Neck1',
    'head': 'Head',
    'clavicle.L': 'LeftShoulder',
    'upperarm01.L': 'LeftArm',
    'lowerarm01.L': 'LeftForeArm',
    'wrist.L': 'LeftHand',
    'clavicle.R': 'RightShoulder',
    'upperarm01.R': 'RightArm',
    'lowerarm01.R': 'RightForeArm',
    'wrist.R': 'RightHand',
    'upperleg01.L': 'LeftUpLeg',
    'lowerleg01.L': 'LeftLeg',
    'foot.L': 'LeftFoot',
    'toe1-1.L': 'LeftToeBase',
    'upperleg01.R': 'RightUpLeg',
    'lowerleg01.R': 'RightLeg',
    'foot.R': 'RightFoot',
    'toe1-1.R': 'RightToeBase',
}


def yaw_of(rot3):
    f = rot3 @ Vector((0, -1, 0))
    return math.atan2(-f.x, -f.y)  # 0 = facing -Y


def facing_yaw(w):
    """Yaw of the body (0 = facing -Y) from joint positions: left hip/shoulder minus right, crossed with up."""
    left = (w['LeftUpLeg'][0] - w['RightUpLeg'][0]) + (w['LeftArm'][0] - w['RightArm'][0])
    f = left.cross(Vector((0, 0, 1)))
    return math.atan2(-f.x, -f.y)


def wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def src_hip_height(b):
    """Hip height above the lowest foot joint in the source rest pose (unscaled)."""
    pos = {}
    for j in b.order:
        pos[j.name] = (pos[j.parent.name] if j.parent else Vector()) + j.offset
    hips = pos['Hips'].y
    return hips - min(p.y for n, p in pos.items() if 'Foot' in n or 'Toe' in n)


MIRROR_X = Matrix(((-1, 0, 0), (0, 1, 0), (0, 0, 1)))


def _swap_side(n):
    for a, b in (('Left', 'Right'), ('LHip', 'RHip'), ('LThumb', 'RThumb')):
        if a in n:
            return n.replace(a, b)
        if b in n:
            return n.replace(b, a)
    return n


def _mirror_world(w):
    """Left/right mirror of a frame's world transforms (swap sides, reflect across X)."""
    return {n: (MIRROR_X @ w[_swap_side(n)][0], MIRROR_X @ w[_swap_side(n)][1] @ MIRROR_X) for n in w}


def retarget(rig, bvh_path, start, end, name, *, step=4, in_place=True, keep_yaw_drift=False, mirror=False, max_rise=None):
    b = BVH(bvh_path)
    end = min(end, b.frames - 1)
    arm = rig.data
    bones = arm.bones
    rest = {bn.name: bn.matrix_local.to_3x3() for bn in bones}
    rest_head = {bn.name: bn.head_local.copy() for bn in bones}

    # Reference orientation per mapped bone: target rest rotated so its direction matches the source T-pose.
    ref = {}
    for tgt, src in MAP.items():
        if tgt == 'root':
            ref[tgt] = rest[tgt]
            continue
        tdir = (bones[tgt].tail_local - bones[tgt].head_local).normalized()  # armature space (Bone.vector is parent space)
        sdir = b.rest_dir(src)
        ref[tgt] = tdir.rotation_difference(sdir).to_matrix() @ rest[tgt]

    scale = rest_head['root'].z / src_hip_height(b) if 'root' in rest_head else 0.056
    frames = list(range(start, end + 1, step))
    worlds = [b.frame_world(f) for f in frames]
    if mirror:
        worlds = [_mirror_world(w) for w in worlds]

    # Facing + drift correction from the hips orientation.
    yaw0 = facing_yaw(worlds[0])
    raw = [facing_yaw(w) for w in worlds]
    unwrapped = [raw[0]]
    for y in raw[1:]:
        unwrapped.append(unwrapped[-1] + wrap(y - unwrapped[-1]))
    drift = unwrapped[-1] - unwrapped[0]
    drift -= round(drift / (2 * math.pi)) * 2 * math.pi
    if keep_yaw_drift:
        drift = 0.0
    p0 = worlds[0]['Hips'][0]

    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = action
    pbs = rig.pose.bones
    for pb in pbs:
        pb.rotation_mode = 'QUATERNION'

    order = [bn.name for bn in bones]  # parents come before children in Blender's bone list
    prev_q = {}
    for k, w in enumerate(worlds):
        t = k / max(1, len(worlds) - 1)
        fix = Matrix.Rotation(yaw0 + drift * t, 3, 'Z')  # yaw_of measures clockwise: rotate back by +yaw
        world = {}
        for bn_name in order:
            bn = bones[bn_name]
            src = MAP.get(bn_name)
            if src:
                world[bn_name] = fix @ w[src][1] @ ref[bn_name]
            else:
                parent_w = world[bn.parent.name] if bn.parent else Matrix.Identity(3)
                parent_r = rest[bn.parent.name] if bn.parent else Matrix.Identity(3)
                world[bn_name] = parent_w @ parent_r.inverted() @ rest[bn_name]
        for bn_name in order:
            bn = bones[bn_name]
            pb = pbs[bn_name]
            if bn.parent:
                local_rest = rest[bn.parent.name].inverted() @ rest[bn_name]
                local = local_rest.inverted() @ world[bn.parent.name].inverted() @ world[bn_name]
            else:
                local = rest[bn_name].inverted() @ world[bn_name]
            q = local.to_quaternion()
            pq = prev_q.get(bn_name)
            if pq is not None and pq.dot(q) < 0:
                q.negate()  # keep the shortest path between keys
            prev_q[bn_name] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=k + 1)
        # Root translation.
        hp = fix @ ((w['Hips'][0] - p0) * scale)
        z = w['Hips'][0].z * scale
        if max_rise is not None:  # flatten acrobatic leaps (e.g. a dive used as a fall)
            z = min(z, worlds[0]['Hips'][0].z * scale + max_rise)
        desired = Vector((0 if in_place else hp.x, 0 if in_place else hp.y, z))
        desired.z += _floor_lift(bones, order, rest, rest_head, world, desired)
        pbs['root'].location = rest['root'].inverted() @ (desired - rest_head['root'])
        pbs['root'].keyframe_insert('location', frame=k + 1)

    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, action)
    rig.animation_data.action = None
    for pb in pbs:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
    return action, len(worlds), b.frame_time * step


# Joints that touch the floor and their clearance (bone head height above the sole/skin in the rest pose).
FLOOR_JOINTS = {'foot.L': None, 'foot.R': None, 'lowerleg01.L': 0.06, 'lowerleg01.R': 0.06,
                'wrist.L': 0.03, 'wrist.R': 0.03, 'head': 0.1, 'spine05': 0.1}
FLOOR_TAILS = {'toe1-1.L': 0.015, 'toe1-1.R': 0.015}


def _floor_lift(bones, order, rest, rest_head, world, root_pos):
    """How far the root must rise so no limb sinks into the floor (proportions differ from the actor's)."""
    head = {}
    for n in order:
        bn = bones[n]
        if bn.parent is None:
            head[n] = root_pos.copy()
            continue
        p = bn.parent.name
        head[n] = head[p] + world[p] @ (rest[p].inverted() @ (rest_head[n] - rest_head[p]))
    lift = 0.0
    for n, clear in FLOOR_JOINTS.items():
        if n in head:
            c = rest_head[n].z * 0.9 if clear is None else clear
            lift = max(lift, c - head[n].z)
    for n, clear in FLOOR_TAILS.items():
        if n in head:
            bn = bones[n]
            tail = head[n] + world[n] @ (rest[n].inverted() @ (bn.tail_local - bn.head_local))
            lift = max(lift, clear - tail.z)
    return lift


# ---------------------------------------------------------------- hand-keyed clips (src/animation/clips.ts)

KEY_MAP = {
    'root': 'body',
    'spine03': 'spine',
    'neck01': 'neck',
    'upperarm01.L': 'shoulderL',
    'lowerarm01.L': 'elbowL',
    'upperarm01.R': 'shoulderR',
    'lowerarm01.R': 'elbowR',
    'upperleg01.L': 'hipL',
    'lowerleg01.L': 'kneeL',
    'upperleg01.R': 'hipR',
    'lowerleg01.R': 'kneeR',
}
KEY_PARENT = {'spine': 'body', 'neck': 'spine', 'shoulderL': 'spine', 'shoulderR': 'spine', 'elbowL': 'shoulderL',
              'elbowR': 'shoulderR', 'hipL': 'body', 'hipR': 'body', 'kneeL': 'hipL', 'kneeR': 'hipR'}
# Rest directions of the old box rig (Y-up space): torso up, limbs hanging down.
KEY_REST_DIR = {'spine': (0, 1, 0), 'neck': (0, 1, 0), 'shoulderL': (0, -1, 0), 'shoulderR': (0, -1, 0),
                'elbowL': (0, -1, 0), 'elbowR': (0, -1, 0), 'hipL': (0, -1, 0), 'hipR': (0, -1, 0),
                'kneeL': (0, -1, 0), 'kneeR': (0, -1, 0)}
OLD_HIP_HEIGHT = 0.98


def _euler3(x, y, z, order):
    rx, ry, rz = Matrix.Rotation(x, 3, 'X'), Matrix.Rotation(y, 3, 'Y'), Matrix.Rotation(z, 3, 'Z')
    return rx @ ry @ rz if order == 'XYZ' else ry @ rx @ rz  # three.js convention


def retarget_keyframes(rig, data, clip_id, name, *, mirror=False):
    """Retarget one sampled clip of the old box rig (three.js Euler conventions, Y-up) onto the skeleton."""
    from bvhreader import AXIS, AXIS_INV
    root_names = data['root']
    joints = data['joints']
    frames = data['clips'][clip_id]['frames']
    if mirror:
        frames = [_mirror_pose(f, root_names, joints) for f in frames]
    arm = rig.data
    bones = arm.bones
    rest = {bn.name: bn.matrix_local.to_3x3() for bn in bones}
    rest_head = {bn.name: bn.head_local.copy() for bn in bones}
    ref = {}
    for tgt, src in KEY_MAP.items():
        if tgt == 'root':
            ref[tgt] = rest[tgt]
            continue
        tdir = (bones[tgt].tail_local - bones[tgt].head_local).normalized()
        sdir = (AXIS @ Vector(KEY_REST_DIR[src])).normalized()
        ref[tgt] = tdir.rotation_difference(sdir).to_matrix() @ rest[tgt]
    scale = rest_head['root'].z / OLD_HIP_HEIGHT

    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = action
    pbs = rig.pose.bones
    for pb in pbs:
        pb.rotation_mode = 'QUATERNION'
    order = [bn.name for bn in bones]
    prev_q = {}
    for k, f in enumerate(frames):
        rootv = dict(zip(root_names, f[:len(root_names)]))
        local = {}
        for i, j in enumerate(joints):
            o = len(root_names) + i * 3
            local[j] = _euler3(f[o], f[o + 1], f[o + 2], 'XYZ')
        src_world = {'body': _euler3(rootv['pitch'], rootv['yaw'], rootv['roll'], 'YXZ')}
        for j in joints:
            src_world[j] = src_world[KEY_PARENT[j]] @ local[j]
        src_world = {n: AXIS @ m @ AXIS_INV for n, m in src_world.items()}
        world = {}
        for bn_name in order:
            bn = bones[bn_name]
            src = KEY_MAP.get(bn_name)
            if src:
                world[bn_name] = src_world[src] @ ref[bn_name]
            else:
                parent_w = world[bn.parent.name] if bn.parent else Matrix.Identity(3)
                parent_r = rest[bn.parent.name] if bn.parent else Matrix.Identity(3)
                world[bn_name] = parent_w @ parent_r.inverted() @ rest[bn_name]
        for bn_name in order:
            bn = bones[bn_name]
            pb = pbs[bn_name]
            if bn.parent:
                loc_rest = rest[bn.parent.name].inverted() @ rest[bn_name]
                m = loc_rest.inverted() @ world[bn.parent.name].inverted() @ world[bn_name]
            else:
                m = rest[bn_name].inverted() @ world[bn_name]
            q = m.to_quaternion()
            pq = prev_q.get(bn_name)
            if pq is not None and pq.dot(q) < 0:
                q.negate()
            prev_q[bn_name] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=k + 1)
        off = AXIS @ Vector((rootv['x'], rootv['y'], rootv['z'])) * scale
        pbs['root'].location = rest['root'].inverted() @ off
        pbs['root'].keyframe_insert('location', frame=k + 1)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, action)
    rig.animation_data.action = None
    for pb in pbs:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
    return action, len(frames)


def _mirror_pose(f, root_names, joints):
    """Same as mirrorPose() in src/animation/pose.ts."""
    f = list(f)
    n = len(root_names)
    idx = {j: n + i * 3 for i, j in enumerate(joints)}
    for a, b in (('shoulderL', 'shoulderR'), ('elbowL', 'elbowR'), ('hipL', 'hipR'), ('kneeL', 'kneeR')):
        ia, ib = idx[a], idx[b]
        f[ia:ia + 3], f[ib:ib + 3] = f[ib:ib + 3], f[ia:ia + 3]
    for j in joints:
        i = idx[j]
        f[i + 1] = -f[i + 1]
        f[i + 2] = -f[i + 2]
    for c in ('x', 'yaw', 'roll'):
        k = root_names.index(c)
        f[k] = -f[k]
    return f
