"""MakeHuman (CC0) base mesh + targets -> numpy arrays in Blender space (meters, z-up, feet at z=0)."""
import gzip, json, os
import numpy as np

import os
MH = os.environ.get('MH_ASSETS', 'assets/mh')  # MakeHuman/MPFB2 CC0 base.obj + rig/weights JSON
TG = os.environ.get('MH_TARGETS', 'targets')  # MPFB2 CC0 .target.gz files

def load_obj():
    verts, uvs, faces, fuv, fgroup = [], [], [], [], []
    cur = None
    for line in open(f'{MH}/base.obj'):
        if line.startswith('v '):
            verts.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            uvs.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('g '):
            cur = line.split()[1]
        elif line.startswith('f '):
            parts = [p.split('/') for p in line.split()[1:]]
            faces.append([int(p[0]) - 1 for p in parts])
            fuv.append([int(p[1]) - 1 if len(p) > 1 and p[1] else -1 for p in parts])
            fgroup.append(cur)
    return np.array(verts, dtype=np.float64), np.array(uvs), faces, fuv, fgroup

def apply_target(V, name, w):
    path = f'{TG}/{name}.target.gz'
    with gzip.open(path, 'rt') as f:
        for line in f:
            p = line.split()
            if len(p) < 4 or line.startswith('#'):
                continue
            i = int(p[0])
            V[i, 0] += w * float(p[1]); V[i, 1] += w * float(p[2]); V[i, 2] += w * float(p[3])

def to_blender(V):
    # OBJ: y-up, decimeters, faces +z  ->  Blender: z-up, meters, faces -y
    B = np.empty_like(V)
    B[:, 0] = V[:, 0] * 0.1
    B[:, 1] = -V[:, 2] * 0.1
    B[:, 2] = V[:, 1] * 0.1
    return B

def build(targets):
    V, UV, F, FUV, FG = load_obj()
    for name, w in targets:
        apply_target(V, name, w)
    B = to_blender(V)
    body_idx = [i for i, g in enumerate(FG) if g == 'body']
    zmin = B[:13380, 2].min()
    B[:, 2] -= zmin
    return B, UV, F, FUV, FG

def joint_centers(B, F, FG):
    """Mean position of each joint-* helper cube."""
    acc = {}
    for f, g in zip(F, FG):
        if g and g.startswith('joint-'):
            acc.setdefault(g, set()).update(f)
    return {g: B[list(s)].mean(axis=0) for g, s in acc.items()}
