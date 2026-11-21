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


def wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def src_hip_height(b):
    """Hip height above the lowest foot joint in the source rest pose (unscaled)."""
    pos = {}
    for j in b.order:
        pos[j.name] = (pos[j.parent.name] if j.parent else Vector()) + j.offset
    hips = pos['Hips'].y
    return hips - min(p.y for n, p in pos.items() if 'Foot' in n or 'Toe' in n)


def retarget(rig, bvh_path, start, end, name, *, step=4, in_place=True, keep_yaw_drift=False):
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

    # Facing + drift correction from the hips orientation.
    yaw0 = yaw_of(worlds[0]['Hips'][1])
    raw = [yaw_of(w['Hips'][1]) for w in worlds]
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
        fix = Matrix.Rotation(-yaw0 - drift * t, 3, 'Z')
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
        desired = Vector((0 if in_place else hp.x, 0 if in_place else hp.y, z))
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
