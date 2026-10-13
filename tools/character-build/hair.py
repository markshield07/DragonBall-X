# Wild anime spikes rooted on the MakeHuman hair-cap helper (shared globals).
hair_mat = material('Hair', srgb(0x0e0d12))
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

def make_hair(style, matname, seed=11):
    all_v.clear(); all_f.clear()
    rng = np.random.default_rng(seed)
    order = rng.permutation(len(cap_P))
    spacing = {'base': 0.03, 'ssj': 0.032, 'ssj3': 0.03, 'ssj4': 0.027}[style]
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
        if front and r[2] < 0.085:
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
        else:
            k_len = 1.55 if style == 'ssj4' else 1.0
            if up:
                d = n + np.array([0, 0.45, 0.75]) + jitter
                L = rng.uniform(0.13, 0.21) * k_len; bend = np.array([0, 0.3, -0.1]); r0 = 0.042
            elif side:
                d = n * 1.2 + np.array([0, 0.35, -0.1]) + jitter
                L = rng.uniform(0.1, 0.16) * k_len; bend = np.array([0, 0.12, -0.22]); r0 = 0.038
            else:  # back
                d = n + np.array([0, 0.5, -0.45 - (0.4 if style == 'ssj4' else 0)]) + jitter
                L = rng.uniform(0.14, 0.21) * k_len * (1.3 if style == 'ssj4' else 1); bend = np.array([0, 0.1, -0.3]); r0 = 0.04
        add_spike(p - n * 0.012, d, L, r0, 1.6, bend)
    # Bangs
    fr = [p for p in cap_P if (p - HC)[1] < -0.045]
    hl = min(fr, key=lambda p: p[2]) if fr else HC + np.array([0, -0.09, 0.07])
    xs = (-0.055, -0.03, -0.008, 0.015, 0.038, 0.06) if style in ('base', 'ssj4') else ((0.01,) if style == 'ssj' else (-0.02, 0.025))
    for k, xo in enumerate(xs):
        root = np.array([xo, hl[1] + 0.012, hl[2] + 0.035 + 0.01 * (k % 2)])
        tipz = EYE_Z + 0.012 + 0.012 * (k % 2) + (0.0 if style != 'ssj' else 0.0)
        d = np.array([xo * 0.8 + rng.normal(0, 0.01), -0.035, tipz - root[2]])
        add_spike(root, d, np.linalg.norm(d), 0.024, 1.8, np.array([0, -0.06, 0.0]))
    ob = make_mesh(matname, list(all_v), list(all_f))
    ob.data.materials.append(material(matname, srgb(0x0e0d12)))
    for poly in ob.data.polygons: poly.use_smooth = False
    bind_bone(ob, 'head')
    print('HAIR', style, len(picked))
    return ob

for style, nm in (('base', 'Hair'), ('ssj', 'HairSSJ'), ('ssj3', 'HairSSJ3'), ('ssj4', 'HairSSJ4')):
    make_hair(style, nm)
