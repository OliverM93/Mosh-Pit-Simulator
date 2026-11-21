"""
MakeHuman (CC0) base-mesh helpers for the headless Blender build.
Reads base.obj, applies morph targets, resolves skeleton joints and weights.
Coordinates: MakeHuman is Y-up, decimetres, face +Z. We convert to Blender
Z-up metres: (x, y, z)_mh -> (x, -z, y) * 0.1, so the glTF export (Y-up)
ends up face +Z again – matching the game's convention.
"""
import json
import os
from collections import defaultdict

SCALE = 0.1


def to_blender(v):
    x, y, z = v
    return (x * SCALE, -z * SCALE, y * SCALE)


class BaseMesh:
    def __init__(self, mh_data_dir):
        self.dir = mh_data_dir
        self.verts = []
        self.uvs = []
        self.faces = defaultdict(list)  # group -> [(vidx..., uvidx...)]
        group = None
        with open(os.path.join(mh_data_dir, '3dobjs', 'base.obj')) as f:
            for line in f:
                if line.startswith('v '):
                    self.verts.append(list(map(float, line.split()[1:4])))
                elif line.startswith('vt '):
                    self.uvs.append(tuple(map(float, line.split()[1:3])))
                elif line.startswith('g '):
                    group = line.split()[1]
                elif line.startswith('f '):
                    parts = [p.split('/') for p in line.split()[1:]]
                    self.faces[group].append(([int(p[0]) - 1 for p in parts], [int(p[1]) - 1 for p in parts]))
        self.base = [list(v) for v in self.verts]

    def apply_target(self, rel_path, weight):
        if weight == 0:
            return
        with open(os.path.join(self.dir, 'targets', rel_path)) as f:
            for line in f:
                if not line.strip() or line.startswith('#'):
                    continue
                i, dx, dy, dz = line.split()
                v = self.verts[int(i)]
                v[0] += float(dx) * weight
                v[1] += float(dy) * weight
                v[2] += float(dz) * weight

    def group_verts(self, group):
        return sorted({i for vs, _ in self.faces[group] for i in vs})


class Skeleton:
    """Default MakeHuman skeleton reduced to the core bones a game needs."""

    CORE = [
        'root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head',
        'clavicle.L', 'shoulder01.L', 'upperarm01.L', 'upperarm02.L', 'lowerarm01.L', 'lowerarm02.L', 'wrist.L',
        'clavicle.R', 'shoulder01.R', 'upperarm01.R', 'upperarm02.R', 'lowerarm01.R', 'lowerarm02.R', 'wrist.R',
        'pelvis.L', 'upperleg01.L', 'upperleg02.L', 'lowerleg01.L', 'lowerleg02.L', 'foot.L', 'toe1-1.L',
        'pelvis.R', 'upperleg01.R', 'upperleg02.R', 'lowerleg01.R', 'lowerleg02.R', 'foot.R', 'toe1-1.R',
    ]

    def __init__(self, mh_data_dir):
        with open(os.path.join(mh_data_dir, 'rigs', 'default.mhskel')) as f:
            d = json.load(f)
        self.bones = d['bones']
        self.joints = d['joints']
        with open(os.path.join(mh_data_dir, 'rigs', 'default_weights.mhw')) as f:
            self.weights = json.load(f)['weights']

    def joint_pos(self, mesh, name):
        ids = self.joints[name]
        n = len(ids)
        return [sum(mesh.verts[i][k] for i in ids) / n for k in range(3)]

    def core_ancestor(self, bone):
        b = bone
        while b is not None and b not in self.CORE:
            b = self.bones[b]['parent']
        return b or 'root'

    def core_parent(self, bone):
        p = self.bones[bone]['parent']
        return None if p is None else self.core_ancestor(p)

    def collapsed_weights(self):
        """Vertex weights per core bone (non-core bones fold into their nearest core ancestor), normalised."""
        per_vert = defaultdict(lambda: defaultdict(float))
        for bone, lst in self.weights.items():
            target = self.core_ancestor(bone)
            for i, w in lst:
                per_vert[i][target] += w
        out = defaultdict(list)
        for i, bw in per_vert.items():
            total = sum(bw.values()) or 1
            for b, w in bw.items():
                out[b].append((i, w / total))
        return out, per_vert

    def dominant_bone(self, per_vert, i):
        bw = per_vert.get(i)
        return max(bw.items(), key=lambda kv: kv[1])[0] if bw else 'root'
