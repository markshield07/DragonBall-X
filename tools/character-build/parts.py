# Executed inside build_rokan.py (shares its globals): clothing, hair, eyes, brows.
import numpy as np
from sculpt import vertex_normals
import random
random.seed(7)

BV = B[:NB].copy()
BF = [f for f, g in zip(F, FG) if g == 'body']
BN = vertex_normals(BV, BF)
W = {bone: np.zeros(NB) for bone in rig}
for bone, lst in weights.items():
    for vi, w in lst:
        if vi < NB:
            W[bone][vi] = w
def wsum(*bones):
    return sum(W[b] for b in bones)

def shell(name, face_pred, offset_fn, mat, jitter_hem=None):
    """Duplicate body faces chosen by face_pred(vertex mask) and push them out
    along the normals by offset_fn(vertex index array) meters. Skinned with the
    body's weights (copied per vertex)."""
    sel = [f for f in BF if face_pred(f)]
    used = sorted({i for f in sel for i in f})
    remap = {v: k for k, v in enumerate(used)}
    idx = np.array(used)
    off = offset_fn(idx)
    P = BV[idx] + BN[idx] * off[:, None]
    faces = [[remap[i] for i in f] for f in sel]
    if jitter_hem:
        jitter_hem(P, faces, idx)
    ob = make_mesh(name, P.tolist(), faces)
    ob.data.materials.append(mat)
    bind(ob, src_index=used)
    return ob

z = BV[:, 2]
ANK = J['joint-l-ankle'][2]
KNEE = J['joint-l-knee'][2]
NAVEL = 1.105
def ss(x):
    x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)

# ---- Pants: baggy crimson martial pants, gathered above the ankle wraps ----
PANT_TOP, PANT_BOT = NAVEL - 0.065, ANK + 0.13
def pants_face(f):
    return all(PANT_BOT - 0.001 <= z[i] <= PANT_TOP for i in f) and min(abs(BV[i, 0]) for i in f) >= 0 \
        and wsum('hand_l', 'hand_r', 'lowerarm_l', 'lowerarm_r')[list(f)].max() < 0.05
def pants_off(idx):
    zz = z[idx]
    bag = 0.012 + 0.018 * ss((PANT_TOP - 0.06 - zz) / 0.25) + 0.016 * ss((KNEE + 0.05 - zz) / 0.3)
    cuff = ss((zz - PANT_BOT) / 0.07)   # gathered cuff
    return 0.012 + (bag - 0.012) * (0.45 + 0.55 * cuff)
def ragged(P, faces, idx):
    for k, i in enumerate(idx):
        if z[i] < PANT_BOT + 0.03:
            P[k, 2] -= 0.025 + 0.02 * random.random()
pants = shell('Pants', pants_face, pants_off, material('Pants', srgb(0xa3161c)), ragged)

# ---- Sash: wide black band tied at the front, two long tails ----
def sash_face(f):
    return all(NAVEL - 0.085 <= z[i] <= NAVEL - 0.02 for i in f) and wsum('hand_l', 'hand_r', 'lowerarm_l', 'lowerarm_r')[list(f)].max() < 0.05
sash_mat = material('Sash', srgb(0x141414))
sash = shell('Sash', sash_face, lambda idx: np.full(len(idx), 0.024), sash_mat)

def front_point(x, zz):
    """Frontmost body vertex near (x, z)."""
    m = (np.abs(BV[:, 0] - x) < 0.02) & (np.abs(z - zz) < 0.02)
    cand = np.where(m)[0]
    k = cand[np.argmin(BV[cand, 1])]
    return BV[k].copy(), BN[k].copy()

import bmesh
def add_box_chain(name, pts, widths, thick, mat, bone):
    """A flat cloth strip through pts (list of 3D), facing -y."""
    verts, faces = [], []
    for i, (p, w) in enumerate(zip(pts, widths)):
        for sx in (-1, 1):
            for sy in (-1, 1):
                verts.append((p[0] + sx * w / 2, p[1] + sy * thick / 2, p[2]))
        if i:
            a = (i - 1) * 4; b = i * 4
            for (u, v) in ((0, 1), (1, 3), (3, 2), (2, 0)):
                faces.append((a + u, a + v, b + v, b + u))
    faces.append((0, 2, 3, 1))
    n = len(pts) - 1
    faces.append((n * 4, n * 4 + 1, n * 4 + 3, n * 4 + 2))
    ob = make_mesh(name, verts, faces)
    ob.data.materials.append(mat)
    for p in ob.data.polygons: p.use_smooth = False
    bind_bone(ob, bone)
    return ob

knot_c, knot_n = front_point(0.0, NAVEL - 0.05)
knot_c[1] -= 0.035
bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.045, location=tuple(knot_c))
knot = bpy.context.active_object; knot.name = 'SashKnot'; knot.scale = (1.0, 0.6, 0.75)
knot.data.materials.append(sash_mat)
bpy.ops.object.transform_apply(scale=True)
bind_bone(knot, 'pelvis')
for k, (dx, ang) in enumerate(((-0.025, -0.06), (0.03, 0.08))):
    pts = []
    for i in range(7):
        t = i / 6
        pts.append((knot_c[0] + dx + ang * t, knot_c[1] - 0.005 - 0.03 * t * t, knot_c[2] - 0.02 - 0.42 * t))
    add_box_chain(f'SashTail{k}', pts, [0.075 - 0.01 * (i / 6) for i in range(7)], 0.012, sash_mat, 'pelvis')

# ---- Fingerless gloves and red wrist cuffs ----
hand_w = wsum('hand_l', 'hand_r')
fing1 = wsum(*[f'{n}_01_{s}' for n in ('index', 'middle', 'ring', 'pinky') for s in 'lr'])
thumb1 = wsum('thumb_01_l', 'thumb_01_r')
def glove_face(f):
    f = list(f)
    return (hand_w[f] + 0.6 * fing1[f] + 0.5 * thumb1[f]).min() > 0.45
shell('Glove', glove_face, lambda idx: np.full(len(idx), 0.0035), material('Glove', srgb(0x161618)))
for s in 'lr':
    hj = J[f'joint-{s}-hand']; ej = J[f'joint-{s}-elbow']
    axis = (hj - ej) / np.linalg.norm(hj - ej)
    t = (BV - ej) @ axis / np.linalg.norm(hj - ej)
    lw = W[f'lowerarm_{s}'] + W[f'hand_{s}']
    def cuff_face(f, t=t, lw=lw):
        f = list(f); return (t[f].min() > 0.8) and (t[f].max() < 1.0) and lw[f].min() > 0.5
    shell(f'Cuff_{s}', cuff_face, lambda idx: np.full(len(idx), 0.009), material('Band', srgb(0xb3202a)))

# ---- Ankle wraps and black sandals ----
foot_w = wsum('foot_l', 'foot_r', 'ball_l', 'ball_r')
calf_w = wsum('calf_l', 'calf_r')
def wrap_face(f):
    f = list(f); return z[f].min() > ANK - 0.03 and z[f].max() < PANT_BOT + 0.02 and (calf_w[f] + foot_w[f]).min() > 0.5
shell('Wrap', wrap_face, lambda idx: np.full(len(idx), 0.008), material('Wrap', srgb(0xd8c7a3)))
ball_y = {s: J[f'joint-{s}-toe-3-1'][1] if f'joint-{s}-toe-3-1' in J else -0.1 for s in 'lr'}
def sandal_face(f):
    f = list(f)
    if foot_w[f].min() < 0.5: return False
    if z[f].max() < 0.022: return True           # sole
    yb = ball_y['l' if BV[f[0], 0] > 0 else 'r']
    y = BV[f, 1].mean()
    return z[f].max() < ANK - 0.01 and (y > yb + 0.03)  # heel cup and strap area behind the toes
shell('Sandal', sandal_face, lambda idx: np.full(len(idx), 0.005), material('Sandal', srgb(0x121212)))

# ---- Eyes: big anime irises in the MakeHuman eye sockets ----
def group_verts(g):
    s = set()
    for f, gg in zip(F, FG):
        if gg == g: s.update(f)
    return B[sorted(s)]
eye_white = material('EyeWhite', srgb(0xf4f1ea))
iris_m = material('Iris', srgb(0x2c3b56))
pupil_m = material('Pupil', srgb(0x05070c))
hi_m = material('Highlight', srgb(0xffffff))
for s in 'lr':
    ev = group_verts(f'helper-{s}-eye')
    c = ev.mean(axis=0); r = (ev.max(axis=0) - ev.min(axis=0)).max() / 2
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=r * 0.98, location=tuple(c))
    eb = bpy.context.active_object; eb.name = f'Eye_{s}'; eb.data.materials.append(eye_white)
    bind_bone(eb, 'head')
    for nm, rr, dd, m in (('Iris', 0.72, 0.0, iris_m), ('Pupil', 0.34, 0.0015, pupil_m)):
        bpy.ops.mesh.primitive_circle_add(vertices=20, radius=r * rr, fill_type='TRIFAN', location=(c[0], c[1] - r * 0.9 - dd, c[2]), rotation=(math.pi / 2, 0, 0))
        d = bpy.context.active_object; d.name = f'{nm}_{s}'; d.data.materials.append(m)
        d.scale = (0.85, 1, 1.1)
        bpy.ops.object.transform_apply(scale=True)
        bind_bone(d, 'head')
    bpy.ops.mesh.primitive_circle_add(vertices=10, radius=r * 0.14, fill_type='TRIFAN', location=(c[0] + 0.25 * r * (1 if s == 'l' else -1), c[1] - r * 0.92 - 0.003, c[2] + 0.3 * r), rotation=(math.pi / 2, 0, 0))
    h = bpy.context.active_object; h.name = f'Highlight_{s}'; h.data.materials.append(hi_m); bind_bone(h, 'head')
    # Brow: thick, angled down toward the nose (fierce), on the face surface.
    pts = []
    sgn = 1 if s == 'l' else -1
    for i in range(6):
        t = i / 5
        x = sgn * (0.012 + 0.048 * t)
        zz = c[2] + r * 1.15 + 0.004 + 0.012 * t - 0.006 * t * t
        p, n = front_point(x, zz)
        pts.append(p + n * 0.003)
    verts, faces = [], []
    for i, p in enumerate(pts):
        w = 0.010 * (1.0 - 0.45 * (i / 5)) if i else 0.008
        verts.append((p[0], p[1] - 0.001, p[2] + w / 2)); verts.append((p[0], p[1] - 0.001, p[2] - w / 2))
        if i: faces.append((2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
    br = make_mesh(f'Brow_{s}', verts, faces)
    br.data.materials.append(material('Brow', srgb(0x0d0b0a)))
    bind_bone(br, 'head')

# ---- Super Saiyan 4 fur: red fur over shoulders, arms, back and sides; chest and abs stay bare ----
fur_w = 1 - wsum('head', 'neck_01', 'hand_l', 'hand_r')
def fur_face(f):
    f = list(f)
    if fur_w[f].min() < 0.6 or z[f].min() < NAVEL - 0.02: return False
    c = BV[f].mean(axis=0)
    if c[1] < -0.02 and abs(c[0]) < 0.17 and c[2] < 1.47: return False   # bare chest and abs
    lw = (W['lowerarm_l'] + W['lowerarm_r'])[f].max()
    return True
shell('Fur', fur_face, lambda idx: np.full(len(idx), 0.006), material('Fur', srgb(0xb3202a)))

# ---- Hair: wild black anime spikes on the MakeHuman scalp cap ----
exec(open(os.path.join(HERE, 'hair.py')).read())
