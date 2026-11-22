"""
Minimal BVH reader with forward kinematics (uses mathutils from Blender's bpy).
Converts to Blender space (Z-up, metres): (x, y, z)_bvh -> (x, -z, y) * scale.
CMU BVH (cgspeed release) units are ~inches/0.45; `scale` is fitted later.
"""
import math

import bpy  # noqa: F401  (makes mathutils importable)
from mathutils import Matrix, Vector

AXIS = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))  # bvh -> blender
AXIS_INV = AXIS.transposed()


class Joint:
    def __init__(self, name, parent):
        self.name = name
        self.parent = parent
        self.children = []
        self.offset = Vector()
        self.channels = []
        self.end_offset = None


class BVH:
    def __init__(self, path):
        self.joints = {}
        self.order = []
        with open(path) as f:
            tokens = f.read().split()
        it = iter(range(len(tokens)))
        i = 0
        stack = []
        cur = None
        while True:
            t = tokens[i]
            if t in ('ROOT', 'JOINT'):
                j = Joint(tokens[i + 1], cur)
                if cur:
                    cur.children.append(j)
                self.joints[j.name] = j
                self.order.append(j)
                cur = j
                i += 2
            elif t == 'End':
                # End Site { OFFSET x y z }
                cur.end_offset = Vector(map(float, tokens[i + 4:i + 7]))
                i += 8
            elif t == 'OFFSET':
                cur.offset = Vector(map(float, tokens[i + 1:i + 4]))
                i += 4
            elif t == 'CHANNELS':
                n = int(tokens[i + 1])
                cur.channels = tokens[i + 2:i + 2 + n]
                i += 2 + n
            elif t == '{':
                stack.append(cur)
                i += 1
            elif t == '}':
                stack.pop()
                cur = cur.parent if cur else None
                i += 1
            elif t == 'MOTION':
                self.frames = int(tokens[i + 2])
                self.frame_time = float(tokens[i + 5])
                i += 6
                break
            else:
                i += 1
        del it
        nch = sum(len(j.channels) for j in self.order)
        vals = list(map(float, tokens[i:i + nch * self.frames]))
        self.data = [vals[k * nch:(k + 1) * nch] for k in range(self.frames)]

    def frame_local(self, f):
        """Per joint: (translation or None, local rotation matrix 3x3) in BVH space."""
        row = self.data[f]
        k = 0
        out = {}
        for j in self.order:
            loc = None
            rot = Matrix.Identity(3)
            vals = row[k:k + len(j.channels)]
            k += len(j.channels)
            pos = [0.0, 0.0, 0.0]
            for ch, v in zip(j.channels, vals):
                axis = ch[0]
                if ch.endswith('position'):
                    pos['XYZ'.index(axis)] = v
                    loc = Vector(pos)
                else:

                    rot = rot @ Matrix.Rotation(math.radians(v), 3, axis)
            out[j.name] = (loc, rot)
        return out

    def frame_world(self, f):
        """Per joint: (world head position, world rotation) in Blender space (unscaled)."""
        local = self.frame_local(f)
        res = {}
        for j in self.order:
            loc, rot = local[j.name]
            if j.parent is None:
                head = (loc if loc is not None else Vector()) + j.offset
                wr = rot
            else:
                ph, pr = res[j.parent.name]
                # Some exporters (Bandai Namco) give every joint position channels: they replace the offset.
                head = ph + pr @ (loc if loc is not None else j.offset)
                wr = pr @ rot
            res[j.name] = (head, wr)
        return {n: (AXIS @ h, AXIS @ r @ AXIS_INV) for n, (h, r) in res.items()}

    def dir_at(self, world, name):
        """Direction of a joint's bone (towards its first child with length) in a posed frame (Blender space)."""
        j = self.joints[name]
        c = j
        while c.children:
            c = c.children[0]
            d = world[c.name][0] - world[name][0]
            if d.length > 1e-6:
                return d.normalized()
        # Terminal joint (hand, toes): continue the parent's direction.
        return self.dir_at(world, j.parent.name) if j.parent else Vector((0, 0, 1))

    def rest_dir(self, name):
        """Rest direction of a joint's bone (towards its first child / end site), Blender space."""
        # CMU has zero-length links (e.g. Spine1 -> Neck): follow the first child until a real offset appears.
        j = self.joints[name]
        while j.children:
            off = j.children[0].offset
            if off.length > 1e-6:
                return (AXIS @ off).normalized()
            j = j.children[0]
        off = j.end_offset if j.end_offset is not None and j.end_offset.length > 1e-6 else Vector((0, 1, 0))
        return (AXIS @ off).normalized()
