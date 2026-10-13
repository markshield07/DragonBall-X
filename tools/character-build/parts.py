# Executed inside build_character.py (shares its globals): clothing, hair, eyes, brows.
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

def relax(P, faces, idx, off, iters):
    """Cloth drape: Laplacian smoothing that keeps every vertex at least `off`
    outside the skin, so fabric bridges the grooves between muscles. Open
    edges are smoothed along themselves, which also evens out stair-stepped hems."""
    n = len(P)
    nbr = [set() for _ in range(n)]
    edges = {}
    for f in faces:
        for i in range(len(f)):
            a, b = f[i], f[(i + 1) % len(f)]
            nbr[a].add(b); nbr[b].add(a)
            e = (min(a, b), max(a, b)); edges[e] = edges.get(e, 0) + 1
    bnbr = [set() for _ in range(n)]
    for (a, b), c in edges.items():
        if c == 1: bnbr[a].add(b); bnbr[b].add(a)
    use = [list(bnbr[k]) if bnbr[k] else list(nbr[k]) for k in range(n)]
    for _ in range(iters):
        P[:] = np.array([P[u].mean(axis=0) if u else P[k] for k, u in enumerate(use)]) * 0.6 + P * 0.4
        out = np.einsum('ij,ij->i', P - BV[idx], BN[idx])
        P += BN[idx] * np.maximum(0, off - out)[:, None]

# New characters get a little drape on every piece to even out stair-stepped edges
# (Rokan stays exactly as approved).
DRAPE_DEFAULT = 0 if CHAR == 'rokan' else 3
def shell(name, face_pred, offset_fn, mat, jitter_hem=None, drape=None):
    """Duplicate body faces chosen by face_pred(vertex mask) and push them out
    along the normals by offset_fn(vertex index array) meters. Skinned with the
    body's weights (copied per vertex). drape > 0 relaxes it like cloth."""
    sel = [f for f in BF if face_pred(f)]
    used = sorted({i for f in sel for i in f})
    remap = {v: k for k, v in enumerate(used)}
    idx = np.array(used)
    off = offset_fn(idx)
    P = BV[idx] + BN[idx] * off[:, None]
    faces = [[remap[i] for i in f] for f in sel]
    drape = DRAPE_DEFAULT if drape is None else drape
    if drape:
        relax(P, faces, idx, off, drape)
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

# ---- Clothing (per character, see characters.py) ----
exec(open(os.path.join(HERE, 'outfit.py')).read())

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
iris_m = material('Iris', col('Iris', 0x2c3b56))
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
EP = C['eyes']
def upper(t):
    t = np.clip(t, 0, 1)
    return -0.0025 * EP['slant'] + 0.0065 * EP['slant'] * t + 0.0074 * EP['h'] * np.sin(np.pi * t ** 0.8) ** 0.6
def lower(t):
    t = np.clip(t, 0, 1)
    return -0.0025 * EP['slant'] + 0.0035 * EP['slant'] * t - 0.0052 * EP['h'] * np.sin(np.pi * t) ** 0.9
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
    disc(f'Iris_{s}', s, ccw(clip(ccw(ellipse(0.0012, 0.0006, 0.0068 * EP['iris'], 0.0095 * EP['iris'])), white)), 0.0014, iris_m)
    disc(f'Pupil_{s}', s, ccw(clip(ccw(ellipse(0.0012, 0.0004, 0.0028 * EP['iris'], 0.0044 * EP['iris'])), white)), 0.0017, pupil_m)
    # Highlights: same world side on both eyes (one key light).
    hu = -0.0025 * sgn
    disc(f'Highlight_{s}', s, ccw(ellipse(0.0012 + hu, 0.0032, 0.0016, 0.0018, 12)), 0.0020, hi_m)
    disc(f'Highlight2_{s}', s, ccw(ellipse(0.0012 - hu * 1.1, -0.0022, 0.0008, 0.0008, 10)), 0.0020, hi_m)
    # Upper lash line: thin at the inner corner, heavy at the outer one, then a short wing.
    ts = np.linspace(0, 1, 18)
    top, bot = [], []
    for t in ts:
        th = (0.0011 + 0.0028 * t ** 1.2) * (1.25 if C['female'] else 1.0)
        top.append((uat(t), upper(t) + th)); bot.append((uat(t), upper(t) - 0.0005))
    for k, w in enumerate((0.0024, 0.005, 0.0078) if C['female'] else (0.0016, 0.0033, 0.005)):
        rise = 0.0009 if C['female'] else -0.0011      # female lashes flick up
        top.append((U1 + w, upper(1) + 0.0029 + rise * (k + 1)))
        bot.append((U1 + w * 0.9, upper(1) - 0.0009 + (rise + 0.0007) * k))
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
        zb = ez + 0.0055 + 0.0035 * (1 - EP['brow_slope']) + (0.019 * t - 0.005 * t * t) * EP['brow_slope']
        w = (0.0065 * (1 - t) ** 0.7 + 0.0015) * EP['brow']
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
