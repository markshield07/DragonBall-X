# Wild anime spikes rooted on the MakeHuman hair-cap helper (shared globals).
hair_mat = material('Hair', col('Hair', 0x0e0d12))
HC = np.array([0.0, -0.02, 1.755])  # head center
EYE_Z = J['joint-l-eye'][2]
headw = W['head']
rel_all = BV - HC
def scalp_vert(i):
    r = rel_all[i]
    if headw[i] < 0.9: return False
    if r[2] < -0.005: return False                       # above the ears
    if r[1] < -0.035 and BV[i, 2] < EYE_Z + 0.06: return False  # forehead stays clear
    return True
scalp_mask = np.array([scalp_vert(i) for i in range(NB)])
cap_f = [f for f in BF if scalp_mask[list(f)].all()]
cap_idx = sorted({i for f in cap_f for i in f})
cap_P = BV[cap_idx].copy()
cap_N = BN[cap_idx]
remap = {v: k for k, v in enumerate(cap_idx)}
cap = make_mesh('HairCap', (cap_P + cap_N * 0.008).tolist(), [[remap[i] for i in f] for f in cap_f])
cap.data.materials.append(hair_mat)
bind_bone(cap, 'head')

def spike_mesh(root, d, L, r0, flat, bend, sides=6, segs=6):
    d = d / np.linalg.norm(d)
    # frame
    a = np.cross(d, [0, 0, 1.0]);
    if np.linalg.norm(a) < 1e-3: a = np.cross(d, [1.0, 0, 0])
    a /= np.linalg.norm(a); b = np.cross(d, a)
    verts, faces = [], []
    for i in range(segs):
        t = i / segs
        c = root + d * L * t + bend * (t * t) * L
        r = r0 * (1 - t) ** 0.85
        for k in range(sides):
            ang = 2 * math.pi * k / sides
            verts.append(tuple(c + a * math.cos(ang) * r * flat + b * math.sin(ang) * r))
    tip = root + d * L + bend * L
    verts.append(tuple(tip))
    for i in range(segs - 1):
        for k in range(sides):
            p0 = i * sides + k; p1 = i * sides + (k + 1) % sides
            faces.append((p0, p1, p1 + sides, p0 + sides))
    base = (segs - 1) * sides; T = len(verts) - 1
    for k in range(sides):
        faces.append((base + k, base + (k + 1) % sides, T))
    faces.append(tuple(reversed(range(sides))))
    return verts, faces

all_v, all_f = [], []
def add_spike(*args, **kw):
    v, f = spike_mesh(*args, **kw)
    o = len(all_v); all_v.extend(v); all_f.extend([tuple(i + o for i in ff) for ff in f])

# ---- Base hairstyles, one per character ----
BASE_SPACING = {'rokan': 0.03, 'wild': 0.036, 'prince': 0.028, 'layered': 0.026, 'ponytail': 0.03, 'long_spikes': 0.03}
# Hand-placed bangs: x positions, extra length below the brows, root width.
BANGS = {
    'rokan': ((-0.055, -0.03, -0.008, 0.015, 0.038, 0.06), 0.0, 0.024),
    'wild': ((-0.05, -0.012, 0.03, 0.062), 0.006, 0.03),
    'prince': ((0.0,), -0.03, 0.03),   # widow's peak
    'layered': ((-0.062, -0.042, -0.022, 0.022, 0.042, 0.062), 0.004, 0.022),
    'ponytail': ((-0.068, -0.03, 0.03, 0.068), 0.03, 0.02),
    'long_spikes': ((-0.05, -0.02, 0.012, 0.045), 0.012, 0.026),
}

def base_spike(style, r, n, front, side, up, jitter, rng):
    """Direction, length, bend and root radius of one spike rooted at scalp point r (head-relative).
    An optional 5th value is the cross-section flatness."""
    if style == 'rokan':
        if up:
            return n + np.array([0, 0.45, 0.75]) + jitter, rng.uniform(0.13, 0.21), np.array([0, 0.3, -0.1]), 0.042
        if side:
            return n * 1.2 + np.array([0, 0.35, -0.1]) + jitter, rng.uniform(0.1, 0.16), np.array([0, 0.12, -0.22]), 0.038
        return n + np.array([0, 0.5, -0.45]) + jitter, rng.uniform(0.14, 0.21), np.array([0, 0.1, -0.3]), 0.04
    if style == 'wild':
        # Big hero spikes bursting every way: tall on top, fanned out at the sides and back.
        if up:
            return n * 0.8 + np.array([0, 0.1, 0.9]) + jitter * 0.9, rng.uniform(0.16, 0.25), np.array([0, 0.12, 0.05]), 0.048
        if side:
            return n * 1.4 + np.array([0, 0.1, 0.25]) + jitter * 0.6, rng.uniform(0.13, 0.2), np.array([0, 0.05, 0.08]), 0.045
        return n + np.array([0, 0.4, 0.05]) + jitter * 0.7, rng.uniform(0.14, 0.22), np.array([0, 0.08, -0.05]), 0.046
    if style == 'prince':
        # Tall upright flame: everything stands straight up, sides sweep up too.
        # Flame silhouette: tallest in the middle, fanning out to the sides.
        k = 1.0 if up else 0.7
        return (n * 0.6 + np.array([0, 0.1, 0.85]) + jitter * 0.3, rng.uniform(0.2, 0.3) * k * (1.15 - 2 * abs(r[0])),
                np.array([n[0] * 0.1, 0.04, 0.06]), 0.042)
    if style == 'layered':
        # Straight layered strands falling to the jaw; a center part on top.
        if abs(r[0]) < 0.012 and up: return None
        drop = max(0.06, r[2] + 0.13)      # reach about jaw level
        d = np.array([n[0] * 0.35, n[1] * 0.35, -1.0]) + jitter * 0.15
        if front:
            d = np.array([n[0] * 0.5, -0.25, -1.0]) + jitter * 0.1
            drop = max(0.05, r[2] - 0.035)
        return d, drop * rng.uniform(0.9, 1.1) + 0.03, np.array([n[0] * 0.04, n[1] * 0.04 - 0.01, 0.0]), 0.036, 2.4
    if style == 'ponytail':
        # Hair pulled back tight toward the tie on the crown.
        tie = np.array([0.0, 0.06, 0.1])
        d = tie - r + np.array([0, 0, 0.02]) + jitter * 0.08
        return d, min(np.linalg.norm(tie - r) * 0.95, 0.17), np.array([n[0] * 0.02, 0.02, 0.02]), 0.038, 2.2
    if style == 'long_spikes':
        # Long silver spikes swept back past the shoulders, a few standing up on top.
        if up and r[1] < 0.02:
            return n + np.array([0, 0.7, 0.55]) + jitter * 0.6, rng.uniform(0.17, 0.25), np.array([0, 0.2, -0.05]), 0.044
        if side:
            return n * 1.0 + np.array([0, 0.55, -0.7]) + jitter * 0.4, rng.uniform(0.2, 0.3), np.array([n[0] * 0.1, 0.1, -0.15]), 0.04
        return n * 0.6 + np.array([0, 0.75, -0.95]) + jitter * 0.4, rng.uniform(0.32, 0.46), np.array([0, 0.1, -0.12]), 0.045
    raise ValueError(style)

def ponytail(rng):
    """High ponytail: a tie on the crown and a fan of long spikes down the back."""
    tie = HC + np.array([0.0, 0.065, 0.1])
    bpy.ops.mesh.primitive_torus_add(major_radius=0.026, minor_radius=0.009, location=tuple(tie),
                                     rotation=(math.radians(-60), 0, 0))
    band = bpy.context.active_object; band.name = 'HairTie'
    band.data.materials.append(hair_mat)
    bind_bone(band, 'head')
    for k in range(14):
        a = 2 * math.pi * k / 14
        root = tie + np.array([math.cos(a) * 0.016, 0.01, math.sin(a) * 0.012])
        d = np.array([math.cos(a) * 0.12 + rng.normal(0, 0.06), 0.42, -1.0 + 0.2 * math.sin(a)])
        add_spike(root, d, rng.uniform(0.5, 0.66), 0.03, 1.5, np.array([math.cos(a) * 0.03, 0.22, 0.04]))
    # A short upward plume where the hair leaves the tie.
    for k in range(5):
        a = math.pi * (0.2 + 0.6 * k / 4)
        add_spike(tie, np.array([math.cos(a) * 0.5, 0.5, 0.6]), rng.uniform(0.08, 0.12), 0.025, 1.4, np.array([0, 0.1, -0.05]))

def make_hair(style, matname, seed=11):
    all_v.clear(); all_f.clear()
    rng = np.random.default_rng(seed)
    order = rng.permutation(len(cap_P))
    spacing = {'ssj': 0.032, 'ssj3': 0.03, 'ssj4': 0.027}.get(style, BASE_SPACING.get(style, 0.03))
    picked = []
    for k in order:
        p = cap_P[k]
        if all(np.linalg.norm(p - q) > spacing for q in picked):
            picked.append(p)
    for p in picked:
        r = p - HC; n = r / np.linalg.norm(r)
        front = r[1] < -0.03
        side = abs(r[0]) > 0.055
        up = r[2] > 0.05
        jitter = rng.normal(0, 0.18, 3)
        if front and r[2] < 0.085 and style not in ('layered',):
            continue  # bangs are placed by hand below
        if style == 'ssj':
            # Super Saiyan: everything stands up and flares out, sharper and longer.
            d = n * 0.55 + np.array([0, 0.15, 1.25]) + jitter * 0.6
            L = rng.uniform(0.17, 0.27) * (0.8 if side and not up else 1)
            bend = np.array([0, 0.12, 0.05]); r0 = 0.04
        elif style == 'ssj3':
            if up and not (r[1] > 0.03):
                d = n * 0.6 + np.array([0, 0.6, 0.9]) + jitter * 0.5
                L = rng.uniform(0.15, 0.22); bend = np.array([0, 0.25, 0.0]); r0 = 0.045
            else:
                # waist-long mane down the back
                d = np.array([n[0] * 0.5, 0.35 + 0.2 * max(n[1], 0), -1.0]) + jitter * 0.25
                L = rng.uniform(0.55, 0.85); bend = np.array([n[0] * 0.08, 0.12, -0.05]); r0 = 0.05
        elif style == 'ssj4':
            if up:
                d = n + np.array([0, 0.45, 0.75]) + jitter
                L = rng.uniform(0.13, 0.21) * 1.55; bend = np.array([0, 0.3, -0.1]); r0 = 0.042
            elif side:
                d = n * 1.2 + np.array([0, 0.35, -0.1]) + jitter
                L = rng.uniform(0.1, 0.16) * 1.55; bend = np.array([0, 0.12, -0.22]); r0 = 0.038
            else:
                d = n + np.array([0, 0.5, -0.85]) + jitter
                L = rng.uniform(0.14, 0.21) * 1.55 * 1.3; bend = np.array([0, 0.1, -0.3]); r0 = 0.04
        else:
            spec = base_spike(style, r, n, front, side, up, jitter, rng)
            if spec is None: continue
            d, L, bend, r0 = spec[:4]
            if len(spec) > 4:
                add_spike(p - n * 0.012, d, L, r0, spec[4], bend)
                continue
        add_spike(p - n * 0.012, d, L, r0, 1.6, bend)
    # Bangs
    fr = [p for p in cap_P if (p - HC)[1] < -0.045]
    hl = min(fr, key=lambda p: p[2]) if fr else HC + np.array([0, -0.09, 0.07])
    xs, blen, bw = BANGS.get(style, ((-0.02, 0.025), 0.0, 0.024))
    if style == 'ssj': xs = (0.01,)
    if style == 'ssj4': xs, blen, bw = BANGS['rokan']
    for k, xo in enumerate(xs):
        root = np.array([xo, hl[1] + 0.012, hl[2] + 0.035 + 0.01 * (k % 2)])
        tipz = EYE_Z + 0.012 + 0.012 * (k % 2) - blen
        d = np.array([xo * 0.8 + rng.normal(0, 0.01), -0.035, tipz - root[2]])
        add_spike(root, d, np.linalg.norm(d), bw, 1.8, np.array([0, -0.06, 0.0]))
    if style == 'ponytail':
        ponytail(rng)
    ob = make_mesh(matname, list(all_v), list(all_f))
    ob.data.materials.append(material(matname, col('Hair', 0x0e0d12) if matname == 'Hair' else srgb(0x0e0d12)))
    for poly in ob.data.polygons: poly.use_smooth = False
    bind_bone(ob, 'head')
    print('HAIR', style, len(picked))
    return ob

for style, nm in ((C['hair'], 'Hair'), ('ssj', 'HairSSJ'), ('ssj3', 'HairSSJ3'), ('ssj4', 'HairSSJ4')):
    make_hair(style, nm)
