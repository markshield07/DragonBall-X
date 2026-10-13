# Executed inside parts.py (shares its globals), after the eye sockets are filled.
# Anime face: the realistic nose, lips and cheek folds are replaced by a smooth
# membrane stretched across the face (boundary kept), then a small pointed
# anime nose is added back on top. anime_face_normals() (run after the bake)
# points the face normals along the smooth membrane so the toon shading stays
# clean, the way anime models do it.
def helper_center(g):
    s = set()
    for f, gg in zip(F, FG):
        if gg == g: s.update(f)
    return B[sorted(s)].mean(axis=0)

_le, _re = helper_center('helper-l-eye'), helper_center('helper-r-eye')
FACE_EZ = (_le[2] + _re[2]) / 2
FACE_MZ = (helper_center('helper-upper-teeth')[2] + helper_center('helper-lower-teeth')[2]) / 2
FACE_Y0 = (_le[1] + _re[1]) / 2
ztop, zbot = FACE_EZ + 0.014, FACE_MZ - 0.028
FACE_C = np.array([0.0, (ztop + zbot) / 2])
FACE_AX = np.array([0.042, (ztop - zbot) / 2])

def face_d(x, zz):
    return np.sqrt((x / FACE_AX[0]) ** 2 + ((zz - FACE_C[1]) / FACE_AX[1]) ** 2)

# Nose: bridge starts between the eyes, small pointed tip, sharp underside.
NOSE_H = 0.013 if C['female'] else 0.018
NOSE_TIP = FACE_EZ - 0.6 * (FACE_EZ - FACE_MZ)
def nose(x, zz):
    t = np.clip((FACE_EZ - zz) / (FACE_EZ - NOSE_TIP), 0, 1)
    h = NOSE_H * (0.15 + 0.85 * t ** 1.7)
    h = np.where(zz > FACE_EZ, h * np.exp(-((zz - FACE_EZ) / 0.008) ** 2), h)
    h = np.where(zz < NOSE_TIP, NOSE_H * np.exp(-((NOSE_TIP - zz) / 0.004) ** 2), h)
    w = 0.004 + 0.0035 * t
    return h * np.exp(-(x / w) ** 2)

def harmonic(P, free, cols, iters):
    """Laplacian fill: free vertices move to the mean of their neighbours."""
    fi = np.where(free)[0]
    nb = [[] for _ in range(NB)]
    for f in BF:
        for i in range(len(f)):
            a_, b_ = f[i], f[(i + 1) % len(f)]
            if free[a_]: nb[a_].append(b_)
            if free[b_]: nb[b_].append(a_)
    ei = np.array([(i, j) for i in fi for j in nb[i]])
    cnt = np.bincount(ei[:, 0], minlength=NB)[fi][:, None]
    for _ in range(iters):
        acc = np.zeros((NB, len(cols))); np.add.at(acc, ei[:, 0], P[ei[:, 1]][:, cols])
        P[np.ix_(fi, cols)] = acc[fi] / cnt

def smooth_y(P, free, iters):
    """Taubin smoothing of depth on the free vertices (edge fixed): removes the
    small features (lips, nostrils) but keeps the broad shape (the muzzle)."""
    fi = np.where(free)[0]
    nb = [[] for _ in range(NB)]
    for f in BF:
        for i in range(len(f)):
            a_, b_ = f[i], f[(i + 1) % len(f)]
            if free[a_]: nb[a_].append(b_)
            if free[b_]: nb[b_].append(a_)
    ei = np.array([(i, j) for i in fi for j in nb[i]])
    cnt = np.bincount(ei[:, 0], minlength=NB)[fi]
    for k in range(iters * 2):
        acc = np.zeros(NB); np.add.at(acc, ei[:, 0], P[ei[:, 1], 1])
        lam = 0.6 if k % 2 == 0 else -0.62
        P[fi, 1] += lam * (acc[fi] / cnt - P[fi, 1])

_front = (W['head'] > 0.5) & (BV[:, 1] < FACE_Y0 + 0.03)
_d = face_d(BV[:, 0], z)
# Everything inside the outline, including the nostril and mouth cavities;
# the eye fills keep their own vertices except over the nose bridge.
_region = (W['head'] > 0.5) & (BV[:, 1] < FACE_Y0 + 0.12) & (_d < 1.0) \
    & ~(EYE_REGION & (np.abs(BV[:, 0]) > 0.013) & (B[:NB, 1] < FACE_Y0 + 0.012))
_inner = np.where(_region)[0]
# Lips: the inner lip surfaces (behind the lip fronts, curling into the mouth)
# collapse onto the mouth line, which closes the mouth.
_deep = (W['head'] > 0.5) & (BV[:, 1] < FACE_Y0 + 0.06) & (np.abs(BV[:, 0]) < 0.03) \
    & (np.abs(z - FACE_MZ) < 0.016) & (BN[:, 1] > -0.2) & ~EYE_REGION
# The whole mouth bag (back to the throat) joins the region, so nothing
# stretches from the closed mouth back into the head.
_adjl = [[] for _ in range(NB)]
for f in BF:
    for i in range(len(f)):
        a_, b_ = f[i], f[(i + 1) % len(f)]
        _adjl[a_].append(b_); _adjl[b_].append(a_)
_ok = (W['head'] > 0.3) & (B[:NB, 1] > FACE_Y0 - 0.01) & (np.abs(BV[:, 0]) < 0.05) & (np.abs(z - FACE_MZ) < 0.05)
_bag = _deep.copy(); _stack = list(np.where(_deep)[0])
while _stack:
    i = _stack.pop()
    for j in _adjl[i]:
        if _ok[j] and not _bag[j] and not _region[j]:
            _bag[j] = True; _stack.append(j)
_deep |= _bag
_region |= _deep
_inner = np.where(_region)[0]
# Before collapsing, start the inner lip at the depth of the lip fronts.
_lipf = _region & ~_deep & (np.abs(z - FACE_MZ) < 0.012)
for i in np.where(_deep)[0]:
    m = _lipf & (np.abs(BV[:, 0] - BV[i, 0]) < 0.005)
    if m.any(): BV[i, 1] = BV[m, 1].min()
BV[_deep, 2] = FACE_MZ + 0.002
# Mouth and nostril cavities: fill their depth with a membrane across the opening.
_cav = _region & (_deep | (B[:NB, 1] > FACE_Y0 + 0.02))
harmonic(BV, _cav, [1], 2000)
# Unfold the nostrils and lips in x/z, then stretch the membrane in depth.
harmonic(BV, _region & ~(_deep & (os.environ.get("PIN_DEEP", "0") == "1")), [0, 2], 3000)
# Take the real nose out first (a membrane across it), then smooth the rest.
_Yh = BV.copy(); harmonic(_Yh, _region, [1], 3000)
_nz = 0.85 * np.exp(-(BV[:, 0] / 0.022) ** 2) * ss((z - (NOSE_TIP - 0.014)) / 0.008) * ss((FACE_EZ + 0.012 - z) / 0.01)
# The lips come halfway back toward the membrane too (anime mouths sit flat).
_mz = 0.35 * np.exp(-(BV[:, 0] / 0.028) ** 2 - ((z - FACE_MZ) / 0.014) ** 2)
_nz = np.maximum(_nz, _mz)
BV[_inner, 1] += (_Yh[_inner, 1] - BV[_inner, 1]) * _nz[_inner]
smooth_y(BV, _region, int(os.environ.get('FACE_SMOOTH', 150)))
# Smooth normal field over the face: start from the membrane's normals and
# relax them (degenerate triangles from the closed mouth get clean normals).
FACE_N = vertex_normals(BV, BF)
_N3 = FACE_N.copy(); harmonic(_N3, _region, [0, 1, 2], 400)
FACE_N = _N3 / np.linalg.norm(_N3, axis=1)[:, None]
BV[_inner, 1] -= nose(BV[_inner, 0], BV[_inner, 2])
BN = vertex_normals(BV, BF)
FACE_MOUTH_Z = float(np.median(BV[_deep, 2])) if _deep.any() else FACE_MZ
print('FACE mouth line', FACE_MOUTH_Z, 'cavity', _cav.sum())
print('FACE eyes z', FACE_EZ, 'mouth z', FACE_MZ, 'region verts', len(_inner), 'deep', _deep.sum())

def face_mouth():
    """Mouth: one thin dark line (corners turned down for the men)."""
    mw = 0.017 if C['female'] else 0.02
    zl = FACE_MOUTH_Z
    top, bot = [], []
    n = 11
    for i in range(n):
        u = -1 + 2 * i / (n - 1)
        droop = (0.0014 if not C['female'] else 0.0006) * u * u
        th = 0.0016 * (1 - 0.5 * u * u)
        top.append(on_face(u * mw, zl - droop + th / 2, 0.0016))
        bot.append(on_face(u * mw, zl - droop - th / 2, 0.0016))
    me = make_mesh('Mouth', [tuple(v) for v in top + bot], [(k, k + 1, n + k + 1, n + k) for k in range(n - 1)])
    if me.data.polygons[0].normal.y > 0: me.data.flip_normals()
    me.data.materials.append(lash_m)
    bind_bone(me, 'head')

def anime_face_normals(ob):
    """Face normals follow the smooth membrane plus a softened nose, blended
    back to the real normals past the edge of the face."""
    me = ob.data
    N = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', N); N = N.reshape(-1, 3)
    P = BV
    d = face_d(P[:, 0], P[:, 2])
    w = np.where(_region, 1.0, (1 - ss((d - 1.0) / 0.35)) * _front)
    e = 1e-4
    gx = (nose(P[:, 0] + e, P[:, 2]) - nose(P[:, 0] - e, P[:, 2])) / (2 * e)
    gz = (nose(P[:, 0], P[:, 2] + e) - nose(P[:, 0], P[:, 2] - e)) / (2 * e)
    S = FACE_N - 0.6 * np.stack([gx, np.zeros_like(gx), gz], 1) * np.abs(FACE_N[:, 1:2])
    S /= np.linalg.norm(S, axis=1)[:, None]
    out = N * (1 - w[:, None]) + S * w[:, None]
    out /= np.linalg.norm(out, axis=1)[:, None]
    if hasattr(me, 'use_auto_smooth'): me.use_auto_smooth = True
    me.normals_split_custom_set_from_vertices(out.tolist())
    return w

def flatten_face_normal_map(img, ob, w):
    """Flat (no detail) normal map under the face, so the bake's realistic
    nose and lip shading doesn't come back."""
    sz = img.size[0]
    px = np.array(img.pixels[:]).reshape(sz, sz, 4)
    mask = np.zeros((sz, sz))
    uv = ob.data.uv_layers.active.data
    for p in ob.data.polygons:
        ws = w[list(p.vertices)]
        if ws.max() <= 0: continue
        pts = np.array([uv[li].uv[:] for li in p.loop_indices]) * sz
        x0, y0 = np.floor(pts.min(0)).astype(int); x1, y1 = np.ceil(pts.max(0)).astype(int)
        for k in range(1, len(pts) - 1):
            a, b, c = pts[0], pts[k], pts[k + 1]
            ys, xs = np.mgrid[max(0, y0 - 2):min(sz, y1 + 3), max(0, x0 - 2):min(sz, x1 + 3)]
            q = np.stack([xs + 0.5, ys + 0.5], -1)
            den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(den) < 1e-12: continue
            l1 = ((b[1] - c[1]) * (q[..., 0] - c[0]) + (c[0] - b[0]) * (q[..., 1] - c[1])) / den
            l2 = ((c[1] - a[1]) * (q[..., 0] - c[0]) + (a[0] - c[0]) * (q[..., 1] - c[1])) / den
            l3 = 1 - l1 - l2
            ins = (l1 > -0.02) & (l2 > -0.02) & (l3 > -0.02)
            val = l1 * ws[0] + l2 * ws[k] + l3 * ws[k + 1]
            sl = mask[ys[0, 0]:ys[-1, 0] + 1, xs[0, 0]:xs[0, -1] + 1]
            sl[ins] = np.maximum(sl[ins], np.clip(val[ins], 0, 1))
    m = np.clip(mask * 1.5, 0, 1)[..., None]
    flat = np.array([0.5, 0.5, 1.0])
    px[..., :3] = px[..., :3] * (1 - m) + flat * m
    img.pixels[:] = px.reshape(-1)
if os.environ.get('FACE_DEBUG'):
    _B0 = B[:NB]
    _n0 = 0
    for f in BF:
        f = list(f)
        if not _region[f].any(): continue
        p = _B0[f]; n = np.cross(p[1] - p[0], p[2] - p[0])
        if n[1] > 0 and _front[f].all() and (p[:, 1].mean() < FACE_Y0 - 0.0): _n0 += 1
    print('DBG orig flips (front-most)', _n0)
    for f in BF:
        f = list(f)
        if not _region[f].any(): continue
        p = BV[f]; n = np.cross(p[1] - p[0], p[2] - p[0])
        if n[1] > 0 and np.linalg.norm(n) > 1e-9:
            c = p.mean(0)
            print('DBG flip x %.4f z %.4f y %.4f inreg %s deep %s front %s' % (c[0], c[2], c[1], _region[f].tolist(), _deep[f].tolist(), _front[f].tolist()))
if os.environ.get('FACE_DEBUG'):
    _ec = {}
    for f in BF:
        for i in range(len(f)):
            e = tuple(sorted((f[i], f[(i + 1) % len(f)]))); _ec[e] = _ec.get(e, 0) + 1
    _bd = [e for e, c in _ec.items() if c == 1 and (_region[e[0]] or _region[e[1]])]
    print('DBG open edges touching region', len(_bd))
    _adj = set()
    for f in BF:
        if any(_region[v] for v in f): _adj.update(v for v in f if not _region[v])
    _adj = np.array(sorted(_adj))
    _ins = _adj[face_d(BV[_adj, 0], BV[_adj, 2]) < 0.9]
    print('DBG pinned neighbours inside ellipse', len(_ins), [(round(BV[i,0],3), round(BV[i,2],3), round(B[i,1],3), bool(EYE_REGION[i])) for i in _ins[:15]])
