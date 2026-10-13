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

# ---- Eyes: flat anime eyes painted on a smoothed eye area ----
# The realistic sockets are filled in with a smooth surface, then the eye is
# built as thin layers on it: white, a tall iris cut off by the upper lid,
# pupil, two highlights, and a heavy upper lash line with a wing.
def group_verts(g):
    s = set()
    for f, gg in zip(F, FG):
        if gg == g: s.update(f)
    return B[sorted(s)]
eye_white = material('EyeWhite', srgb(0xf4f1ea))
iris_m = material('Iris', srgb(0x2c3b56))
pupil_m = material('Pupil', srgb(0x05070c))
hi_m = material('Highlight', srgb(0xffffff))
lash_m = material('Lash', srgb(0x0d0b0a))
head_w = W['head']

def quad_fit(x, zz, y):
    A = np.stack([np.ones_like(x), x, zz, x * x, zz * zz, x * zz], 1)
    k = np.linalg.lstsq(A, y, rcond=None)[0]
    return lambda X, Z: k[0] + k[1] * X + k[2] * Z + k[3] * X * X + k[4] * Z * Z + k[5] * X * Z

EYE = {}
for s in 'lr':
    sgn = 1 if s == 'l' else -1
    ev = group_verts(f'helper-{s}-eye')
    c = ev.mean(axis=0)
    ex, ez = c[0] + sgn * 0.001, c[2] + 0.001
    d = np.sqrt(((BV[:, 0] - ex) / 0.028) ** 2 + ((z - ez + 0.004) / 0.023) ** 2)
    front = (BV[:, 1] < c[1] + 0.03) & (head_w > 0.5) & (np.sign(BV[:, 0]) == sgn)
    ring = front & (d > 1.0) & (d < 1.6) & (BN[:, 1] < -0.2)
    surf = quad_fit(BV[ring, 0], z[ring], BV[ring, 1])
    # Fill the socket: relax the region flat in x/z (boundary pinned, so the
    # triangles unfold instead of folding over) and lay it on the fitted surface.
    region = front & ((d < 1.0) | ((d < 1.2) & (BV[:, 1] > surf(BV[:, 0], z))))
    inner = np.where(region)[0]
    nbr = [[] for _ in range(NB)]
    for f in BF:
        for i in range(len(f)):
            a_, b_ = f[i], f[(i + 1) % len(f)]
            if region[a_] or region[b_]:
                nbr[a_].append(b_); nbr[b_].append(a_)
    xz = BV[:, [0, 2]].copy()
    for _ in range(300):
        for i in inner:
            if nbr[i]: xz[i] = xz[nbr[i]].mean(axis=0)
    BV[inner, 0] = xz[inner, 0]; BV[inner, 2] = xz[inner, 1]
    BV[inner, 1] = surf(BV[inner, 0], BV[inner, 2])
    EYE[s] = (sgn, ex, ez, surf)
for i, v in enumerate(body.data.vertices):
    v.co = BV[i]
BN = vertex_normals(BV, BF)
from mathutils.bvhtree import BVHTree
from mathutils import Vector
FACE_BVH = BVHTree.FromPolygons(BV.tolist(), BF)
def on_face(x, zz, off):
    """Point on the front of the body at (x, z), pushed out along the normal."""
    loc, n, _, _ = FACE_BVH.ray_cast(Vector((x, -1.0, zz)), Vector((0, 1, 0)))
    return np.array(loc) + np.array(n) * off

# Fierce male shape: the upper lid slants down toward the nose.
def upper(t):
    t = np.clip(t, 0, 1)
    return -0.0025 + 0.0065 * t + 0.0074 * np.sin(np.pi * t ** 0.8) ** 0.6
def lower(t):
    t = np.clip(t, 0, 1)
    return -0.0025 + 0.0035 * t - 0.0052 * np.sin(np.pi * t) ** 0.9
U0, U1 = -0.017, 0.019
def uat(t): return U0 + (U1 - U0) * t
EYE_POLY = [(uat(t), upper(t)) for t in np.linspace(0, 1, 17)] + [(uat(t), lower(t)) for t in np.linspace(1, 0, 17)[1:-1]]

def ellipse(cu, cv, ru, rv, n=24):
    return [(cu + ru * np.cos(a), cv + rv * np.sin(a)) for a in np.linspace(0, 2 * np.pi, n, endpoint=False)]

def clip(poly, clipper):
    """Sutherland-Hodgman: poly clipped to the convex, counter-clockwise clipper."""
    def inside(p, a, b): return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0
    def cross(p, q, a, b):
        x1, y1, x2, y2, x3, y3, x4, y4 = *p, *q, *a, *b
        den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
        return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
    out = poly
    for i in range(len(clipper)):
        a, b = clipper[i - 1], clipper[i]
        inp, out = out, []
        for j in range(len(inp)):
            p, q = inp[j - 1], inp[j]
            if inside(q, a, b):
                if not inside(p, a, b): out.append(cross(p, q, a, b))
                out.append(q)
            elif inside(p, a, b):
                out.append(cross(p, q, a, b))
    return out

def ccw(poly):
    area = sum(poly[i - 1][0] * poly[i][1] - poly[i][0] * poly[i - 1][1] for i in range(len(poly)))
    return poly if area > 0 else poly[::-1]

def place(s, pts, off):
    sgn, ex, ez, surf = EYE[s]
    out = []
    for u, v in pts:
        X, Z = ex + sgn * u, ez + v
        out.append((X, float(surf(X, Z)) - off, Z))
    return out

def disc(name, s, poly, off, mat):
    """Convex polygon filled with concentric rings, laid on the eye surface."""
    cu = sum(p[0] for p in poly) / len(poly); cv = sum(p[1] for p in poly) / len(poly)
    rings = [0.34, 0.67, 1.0]
    pts = [(cu, cv)] + [(cu + (p[0] - cu) * r, cv + (p[1] - cv) * r) for r in rings for p in poly]
    n = len(poly); faces = []
    for k in range(n):
        faces.append((0, 1 + k, 1 + (k + 1) % n))
    for r in range(len(rings) - 1):
        a0, b0 = 1 + r * n, 1 + (r + 1) * n
        for k in range(n):
            faces.append((a0 + k, b0 + k, b0 + (k + 1) % n, a0 + (k + 1) % n))
    verts = place(s, pts, off)
    if s == 'r': faces = [f[::-1] for f in faces]
    ob = make_mesh(name, verts, faces)
    ob.data.materials.append(mat)
    # Face the camera side (-y); flip if the winding came out backwards.
    me = ob.data; me.calc_loop_triangles() if hasattr(me, 'calc_loop_triangles') else None
    if me.polygons[0].normal.y > 0: me.flip_normals()
    bind_bone(ob, 'head')
    return ob

def strip(name, s, top, bot, off, mat):
    verts = place(s, top + bot, off); n = len(top)
    faces = [(k, k + 1, n + k + 1, n + k) for k in range(n - 1)]
    ob = make_mesh(name, verts, faces)
    ob.data.materials.append(mat)
    if ob.data.polygons[0].normal.y > 0: ob.data.flip_normals()
    bind_bone(ob, 'head')
    return ob

for s in 'lr':
    sgn = EYE[s][0]
    white = ccw(EYE_POLY)
    disc(f'EyeWhite_{s}', s, white, 0.0010, eye_white)
    disc(f'Iris_{s}', s, ccw(clip(ccw(ellipse(0.0012, 0.0006, 0.0068, 0.0095)), white)), 0.0014, iris_m)
    disc(f'Pupil_{s}', s, ccw(clip(ccw(ellipse(0.0012, 0.0004, 0.0028, 0.0044)), white)), 0.0017, pupil_m)
    # Highlights: same world side on both eyes (one key light).
    hu = -0.0025 * sgn
    disc(f'Highlight_{s}', s, ccw(ellipse(0.0012 + hu, 0.0032, 0.0016, 0.0018, 12)), 0.0020, hi_m)
    disc(f'Highlight2_{s}', s, ccw(ellipse(0.0012 - hu * 1.1, -0.0022, 0.0008, 0.0008, 10)), 0.0020, hi_m)
    # Upper lash line: thin at the inner corner, heavy at the outer one, then a short wing.
    ts = np.linspace(0, 1, 18)
    top, bot = [], []
    for t in ts:
        th = 0.0011 + 0.0028 * t ** 1.2
        top.append((uat(t), upper(t) + th)); bot.append((uat(t), upper(t) - 0.0005))
    for k, w in enumerate((0.0016, 0.0033, 0.005)):
        top.append((U1 + w, upper(1) + 0.0029 - 0.0011 * (k + 1)))
        bot.append((U1 + w * 0.9, upper(1) - 0.0009 - 0.0004 * k))
    strip(f'Lash_{s}', s, top, bot, 0.0021, lash_m)
    # Lower lid line on the outer half.
    ts = np.linspace(0.5, 1, 9)
    strip(f'LashLow_{s}', s, [(uat(t), lower(t) + 0.0002) for t in ts],
          [(uat(t), lower(t) - 0.0005 - 0.0005 * (t - 0.5)) for t in ts], 0.0021, lash_m)
    c = np.array([EYE[s][1], 0, EYE[s][2]]); r = 0.012
    # Brow: a heavy wedge, thick by the nose and slanting down toward it.
    sgn, ex, ez, _ = EYE[s]
    top, bot = [], []
    for i in range(8):
        t = i / 7
        x = sgn * (0.009 + 0.05 * t)
        zb = ez + 0.0055 + 0.019 * t - 0.005 * t * t
        w = 0.0065 * (1 - t) ** 0.7 + 0.0015
        top.append(on_face(x, zb + w, 0.0025)); bot.append(on_face(x, zb, 0.0025))
    verts = top + bot
    faces = [(k, k + 1, 8 + k + 1, 8 + k) for k in range(7)]
    br = make_mesh(f'Brow_{s}', [tuple(v) for v in verts], faces)
    if br.data.polygons[0].normal.y > 0: br.data.flip_normals()
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
