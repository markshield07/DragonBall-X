# Executed inside parts.py (shares its globals): the clothing pieces named in
# the character's `outfit` list (characters.py). Most pieces are shells: body
# faces picked by a predicate, pushed out along the normals, skinned with the
# body's own weights. Offsets are layered so outer pieces sit on inner ones:
#   bodysuit 0.0035 < tank/undershirt/crop top 0.005 < fur 0.006 < pants
#   < gi top / jacket 0.013-0.014 < chest armor 0.018 < belts and straps.
OUTFIT = set(C['outfit'])
BOOTS = 'boots' in OUTFIT

arm_w = wsum('upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r')
upper_w = wsum('upperarm_l', 'upperarm_r')
hand_w = wsum('hand_l', 'hand_r')
neckhead_w = wsum('neck_01', 'head')
leg_w = wsum('thigh_l', 'thigh_r', 'calf_l', 'calf_r')
foot_w = wsum('foot_l', 'foot_r', 'ball_l', 'ball_r')
calf_w = wsum('calf_l', 'calf_r')
fing1 = wsum(*[f'{n}_01_{s}' for n in ('index', 'middle', 'ring', 'pinky') for s in 'lr'])
thumb1 = wsum('thumb_01_l', 'thumb_01_r')
fingers_all = wsum(*[b for b in rig if any(b.startswith(n) for n in ('index', 'middle', 'ring', 'pinky', 'thumb'))])

def const(v):
    return lambda idx: np.full(len(idx), v)

def limb_t(side, a, b):
    """Position of every body vertex along joint a -> joint b (0 at a, 1 at b)."""
    pa, pb = J[f'joint-{side}-{a}'], J[f'joint-{side}-{b}']
    ax = pb - pa
    return (BV - pa) @ ax / (ax @ ax)

def band_on_limb(name, mat, lo_hi, a, b, weights, off):
    for s in 'lr':
        t = limb_t(s, a, b)
        w = sum(W[f'{bn}_{s}'] for bn in weights)
        def pred(f, t=t, w=w):
            f = list(f); return lo_hi[0] < t[f].min() and t[f].max() < lo_hi[1] and w[f].min() > 0.5
        shell(f'{name}_{s}', pred, const(off), mat)

def front_point(x, zz):
    """Frontmost body vertex near (x, z)."""
    m = (np.abs(BV[:, 0] - x) < 0.02) & (np.abs(z - zz) < 0.02)
    cand = np.where(m)[0]
    k = cand[np.argmin(BV[cand, 1])]
    return BV[k].copy(), BN[k].copy()

def back_point(x, zz):
    m = (np.abs(BV[:, 0] - x) < 0.02) & (np.abs(z - zz) < 0.02)
    cand = np.where(m)[0]
    k = cand[np.argmax(BV[cand, 1])]
    return BV[k].copy(), BN[k].copy()

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

def solid(name, prim, mat, bone, **kw):
    getattr(bpy.ops.mesh, f'primitive_{prim}_add')(**kw)
    ob = bpy.context.active_object; ob.name = name
    ob.data.materials.append(mat)
    bind_bone(ob, bone)
    return ob

# ---- Pants ----
PANT_TOP = NAVEL - 0.065
PANT_BOT = ANK + (0.12 if BOOTS else 0.13)
def pants_face(f):
    return all(PANT_BOT - 0.001 <= z[i] <= PANT_TOP for i in f) \
        and (arm_w + fingers_all)[list(f)].max() < 0.05
if 'pants' in OUTFIT:
    # Baggy martial pants, gathered at the cuff (Rokan: ragged hem; Kaizen: tucked in boots).
    def pants_off(idx):
        zz = z[idx]
        bag = 0.012 + 0.018 * ss((PANT_TOP - 0.06 - zz) / 0.25) + 0.016 * ss((KNEE + 0.05 - zz) / 0.3)
        cuff = ss((zz - PANT_BOT) / 0.07)
        return 0.012 + (bag - 0.012) * (0.45 + 0.55 * cuff)
    def ragged(P, faces, idx):
        for k, i in enumerate(idx):
            if z[i] < PANT_BOT + 0.03:
                P[k, 2] -= 0.025 + 0.02 * random.random()
    shell('Pants', pants_face, pants_off, material('Pants', col('Pants', 0xa3161c)), None if BOOTS else ragged, drape=0 if CHAR == 'rokan' else 12)
if 'slim_pants' in OUTFIT:
    def slim_off(idx):
        zz = z[idx]
        return 0.006 + 0.005 * ss((PANT_TOP - 0.05 - zz) / 0.2) * ss((zz - KNEE) / 0.15)
    shell('Pants', pants_face, slim_off, material('Pants', col('Pants', 0x17171d)), drape=6)

# ---- Tops ----
def torso_face(f, zlo, neck_max=0.3, arm_max=0.3):
    f = list(f)
    return z[f].min() >= zlo and neckhead_w[f].max() < neck_max and arm_w[f].max() < arm_max \
        and leg_w[f].max() < 0.3 and fingers_all[f].max() < 0.05
if 'bodysuit' in OUTFIT:
    # Skin-tight suit: everything but the head, hands and feet.
    def suit_face(f):
        f = list(f)
        return wsum('head')[f].max() < 0.2 and hand_w[f].max() < 0.3 and fingers_all[f].max() < 0.05 \
            and foot_w[f].max() < 0.5 and z[f].min() > ANK - 0.01
    shell('Under', suit_face, const(0.0035), material('Under', col('Under', 0x1b2552)))
if 'undershirt' in OUTFIT:
    # Short-sleeved undershirt; the gi top goes over it.
    for s in 'lr':
        pass
    t_l, t_r = limb_t('l', 'shoulder', 'elbow'), limb_t('r', 'shoulder', 'elbow')
    def under_face(f):
        f = list(f)
        if neckhead_w[f].max() > 0.35 or leg_w[f].max() > 0.3 or z[f].min() < PANT_TOP - 0.04 or fingers_all[f].max() > 0.05: return False
        if wsum('lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r')[f].max() > 0.1: return False
        t = np.where(BV[f, 0] > 0, t_l[f], t_r[f])
        return upper_w[f].max() < 0.3 or t.max() < 0.45
    shell('Under', under_face, const(0.006), material('Under', col('Under', 0x1b2552)), drape=4)
if 'tank' in OUTFIT:
    def tank_face(f):
        f = list(f)
        if not torso_face(f, PANT_TOP - 0.04, neck_max=0.2, arm_max=0.25): return False
        c = BV[f].mean(axis=0)
        return not (c[1] < 0 and c[2] > 1.47 and abs(c[0]) < 0.07)   # scoop neck
    shell('Under', tank_face, const(0.005), material('Under', col('Under', 0x17171d)))
if 'crop_top' in OUTFIT:
    def crop_face(f):
        f = list(f)
        if not torso_face(f, 1.255, neck_max=0.2, arm_max=0.3): return False
        c = BV[f].mean(axis=0)
        return not (c[1] < 0 and c[2] > 1.45 and abs(c[0]) < 0.06)
    shell('Under', crop_face, const(0.005), material('Under', col('Under', 0x17171d)), drape=8)
if 'gi_top' in OUTFIT:
    # Sleeveless gi top with a deep V neck that shows the undershirt.
    def gi_face(f):
        f = list(f)
        if not torso_face(f, NAVEL - 0.13, neck_max=0.25, arm_max=0.35): return False
        c = BV[f].mean(axis=0)
        if c[1] < 0 and c[2] > 1.2 and abs(c[0]) < 0.012 + (c[2] - 1.2) * 0.5: return False
        return True
    def gi_off(idx):
        return 0.016 + 0.01 * ss((NAVEL - z[idx]) / 0.1)    # flares a little over the pants
    shell('Main', gi_face, gi_off, material('Main', col('Main', 0xf2751c)), drape=14)
if 'jacket' in OUTFIT:
    # Cropped jacket: ends under the chest, open front, sleeves to mid-forearm, standing collar.
    tl = {s: limb_t(s, 'elbow', 'hand') for s in 'lr'}
    def jacket_face(f):
        f = list(f)
        c = BV[f].mean(axis=0)
        if wsum('head')[f].max() > 0.1 or leg_w[f].max() > 0.2 or hand_w[f].max() > 0.2: return False
        if c[2] < 1.27 and arm_w[f].max() < 0.5: return False         # cropped
        if wsum('lowerarm_l', 'lowerarm_r')[f].max() > 0.5:
            t = tl['l' if c[0] > 0 else 'r'][f]
            if t.max() > 0.55: return False
        if neckhead_w[f].max() > 0.5 and c[2] > 1.62: return False
        if c[1] < -0.02 and abs(c[0]) < 0.04 and c[2] < 1.55: return False   # open front
        return True
    def jacket_off(idx):
        return 0.014 + 0.006 * (neckhead_w[idx] > 0.3)
    shell('Main', jacket_face, jacket_off, material('Main', col('Main', 0x5a2d91)), drape=10)

# ---- Armor ----
TRIM = 'Trim' if 'Trim' in C['colors'] else 'Accent'
if 'chest_armor' in OUTFIT:
    def plate_face(f):
        f = list(f)
        return torso_face(f, NAVEL - 0.03, neck_max=0.25, arm_max=0.3)
    def plate_off(idx):
        return 0.018 + 0.006 * ss((z[idx] - 1.3) / 0.12)    # fuller over the chest
    shell('Main', plate_face, plate_off, material('Main', col('Main', 0xeeeef2)), drape=8)
    def trim_face(f):
        f = list(f); return torso_face(f, NAVEL - 0.035, neck_max=0.25, arm_max=0.3) and z[f].max() < NAVEL + 0.0
    shell(TRIM, trim_face, const(0.024), material(TRIM, col(TRIM, 0xd9a92e)))
if 'armor_accents' in OUTFIT:
    # Center chest panel and collar ring in the accent color.
    def panel_face(f):
        f = list(f); c = BV[f].mean(axis=0)
        return c[1] < 0 and abs(c[0]) < 0.035 and 1.17 < c[2] < 1.44 and arm_w[f].max() < 0.2
    shell('Accent', panel_face, const(0.028), material('Accent', col('Accent', 0x1fb5a8)))
    def collar_face(f):
        f = list(f); return neckhead_w[f].min() > 0.4 and wsum('head')[f].max() < 0.15
    shell('Accent', collar_face, const(0.012), material('Accent', col('Accent', 0x1fb5a8)))
for piece, radius, off in (('shoulder_flaps', 0.085, 0.03), ('shoulder_pads', 0.11, 0.036)):
    if piece not in OUTFIT: continue
    for s in 'lr':
        sh = J[f'joint-{s}-shoulder'] + np.array([0.02 * (1 if s == 'l' else -1), 0, 0.03])
        def pad_face(f, sh=sh):
            f = list(f)
            return np.linalg.norm(BV[f] - sh, axis=1).max() < radius and BN[f, 2].mean() > -0.15 \
                and neckhead_w[f].max() < 0.2
        def pad_off(idx, sh=sh):
            return off * (1 - 0.5 * ss(np.linalg.norm(BV[idx] - sh, axis=1) / radius - 0.5))
        shell(f'Main_pad_{s}', pad_face, pad_off, material('Main', col('Main', 0xeeeef2)))
        def edge_face(f, sh=sh):
            f = list(f); d = np.linalg.norm(BV[f] - sh, axis=1)
            return radius * 0.82 < d.min() and d.max() < radius * 1.02 and BN[f, 2].mean() > -0.15 \
                and neckhead_w[f].max() < 0.2
        shell(f'Trim_pad_{s}', edge_face, const(off * 0.62 + 0.004), material(TRIM, col(TRIM, 0xd9a92e)))
if 'forearm_guards' in OUTFIT:
    band_on_limb('Accent_guard', material('Accent', col('Accent', 0x1fb5a8)), (0.3, 0.8), 'elbow', 'hand', ('lowerarm',), 0.012)

# ---- Belts ----
BELT_LO, BELT_HI = NAVEL - 0.085, NAVEL - 0.02
def belt_face(f):
    return all(BELT_LO <= z[i] <= BELT_HI for i in f) and (arm_w + fingers_all)[list(f)].max() < 0.05
def belt_knot(x, tail_len, mat, width=0.075, size=0.045):
    knot_c, _ = front_point(x, NAVEL - 0.05)
    knot_c[1] -= 0.035 * size / 0.045
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=size, location=tuple(knot_c))
    knot = bpy.context.active_object; knot.name = 'SashKnot'; knot.scale = (1.0, 0.6, 0.75)
    knot.data.materials.append(mat)
    bpy.ops.object.transform_apply(scale=True)
    bind_bone(knot, 'pelvis')
    for k, (dx, ang) in enumerate(((-0.025, -0.06), (0.03, 0.08))):
        pts = []
        for i in range(7):
            t = i / 6
            pts.append((knot_c[0] + dx + ang * t, knot_c[1] - 0.005 - 0.03 * t * t, knot_c[2] - 0.02 - tail_len * t))
        add_box_chain(f'SashTail{k}', pts, [width - 0.01 * (i / 6) for i in range(7)], 0.012, mat, 'pelvis')
if 'sash' in OUTFIT:
    # Rokan: wide sash tied at the front, two long tails.
    sash_mat = material('Sash', col('Sash', 0x141414))
    shell('Sash', belt_face, const(0.024), sash_mat)
    belt_knot(0.0, 0.42, sash_mat)
if 'belt' in OUTFIT:
    # Kaizen: cloth belt over the gi, knotted at the front, short tails.
    sash_mat = material('Sash', col('Sash', 0x1b2552))
    shell('Sash', belt_face, const(0.03), sash_mat)
    belt_knot(0.0, 0.2, sash_mat, width=0.05, size=0.035)
if 'sash_side' in OUTFIT:
    # Zyra: sash knotted on the left hip, long tails.
    sash_mat = material('Sash', col('Sash', 0xb81d2a))
    shell('Sash', belt_face, const(0.012), sash_mat, drape=6)
    belt_knot(0.12, 0.38, sash_mat, width=0.055, size=0.032)
if 'belt_buckle' in OUTFIT:
    # Toren: narrow leather belt with a square buckle.
    sash_mat = material('Sash', col('Sash', 0x6b4a2a))
    def thin_belt(f):
        return all(NAVEL - 0.075 <= z[i] <= NAVEL - 0.04 for i in f) and (arm_w + fingers_all)[list(f)].max() < 0.05
    shell('Sash', thin_belt, const(0.011), sash_mat)
    bc, bn = front_point(0.0, NAVEL - 0.058)
    solid('Buckle', 'cube', material('Hilt', col('Hilt', 0x9a7a3a)), 'pelvis', size=1, location=tuple(bc - np.array([0, 0.014, 0])))
    bpy.context.active_object.scale = (0.022, 0.006, 0.02)
    bpy.ops.object.transform_apply(scale=True)

# ---- Hands ----
glove_mat = material('Glove', col('Glove', 0x161618))
if 'gloves' in OUTFIT:
    # Fingerless gloves.
    def glove_face(f):
        f = list(f)
        return (hand_w[f] + 0.6 * fing1[f] + 0.5 * thumb1[f]).min() > 0.45
    shell('Glove', glove_face, const(0.0035), glove_mat)
if 'gloves_full' in OUTFIT:
    def gloveful_face(f):
        f = list(f); return (hand_w[f] + fingers_all[f]).min() > 0.5
    shell('Glove', gloveful_face, const(0.0035), glove_mat)
    band_on_limb('Glove_cuff', glove_mat, (0.8, 1.02), 'elbow', 'hand', ('lowerarm', 'hand'), 0.011)
if 'cuffs' in OUTFIT:      # Rokan's red wrist cuffs
    band_on_limb('Cuff', material('Band', col('Band', 0xb3202a)), (0.8, 1.0), 'elbow', 'hand', ('lowerarm', 'hand'), 0.009)
if 'wristbands' in OUTFIT:
    band_on_limb('Cuff', material('Cuff', col('Cuff', 0x1b2552)), (0.74, 1.0), 'elbow', 'hand', ('lowerarm', 'hand'), 0.01)
if 'armbands' in OUTFIT:
    cuff_mat = material('Cuff', col('Cuff', 0xb81d2a))
    band_on_limb('Cuff_upper', cuff_mat, (0.5, 0.62), 'shoulder', 'elbow', ('upperarm',), 0.006)
    band_on_limb('Cuff', cuff_mat, (0.8, 1.0), 'elbow', 'hand', ('lowerarm', 'hand'), 0.008)

# ---- Feet ----
if 'wraps' in OUTFIT:
    def wrap_face(f):
        f = list(f); return z[f].min() > ANK - 0.015 and z[f].max() < PANT_BOT + 0.02 and (calf_w[f] + foot_w[f]).min() > 0.5
    shell('Wrap', wrap_face, const(0.008), material('Wrap', col('Wrap', 0xd8c7a3)))
if 'shoes' in OUTFIT or BOOTS:
    # Shoes are lofted around each foot rather than shrink-wrapped, so the toes
    # disappear into one rounded toe box with a flat sole.
    SHOE_OFF = 0.007
    shoe_m = material('Shoe', col('Shoe', 0x121212))
    for s_ in 'lr':
        sg = 1 if s_ == 'l' else -1
        fi = np.where((foot_w > 0.5) & (z < ANK + 0.03) & (np.sign(BV[:, 0]) == sg))[0]
        FP = BV[fi]
        y0, y1 = FP[:, 1].min(), FP[:, 1].max()      # toe tip (front is -y) .. heel
        NS, NA = 22, 16
        ys = np.linspace(y0 - 0.016, y1 + 0.006, NS)
        prof = []
        for y in ys:
            m = np.abs(FP[:, 1] - y) < 0.012
            if not m.any(): m = np.argsort(np.abs(FP[:, 1] - y))[:8]
            Q = FP[m]
            prof.append((Q[:, 0].min(), Q[:, 0].max(), Q[:, 2].max()))
        prof = np.array(prof)
        for _ in range(3):   # smooth the profile along the foot
            prof[1:-1] = (prof[:-2] + 2 * prof[1:-1] + prof[2:]) / 4
        verts, src = [], []
        for k, (y, (xa, xb, zt)) in enumerate(zip(ys, prof)):
            u = k / (NS - 1)
            end = min(u / 0.1, (1 - u) / 0.06, 1.0)
            shrink = np.sqrt(max(0.0, 1 - (1 - end) ** 2))
            cx, hw = (xa + xb) / 2, (xb - xa) / 2 + SHOE_OFF
            ht = zt + SHOE_OFF
            for j in range(NA):
                t = 2 * np.pi * j / NA
                c, sn = np.cos(t), np.sin(t)
                ex = np.sign(c) * abs(c) ** 0.6 * hw * max(shrink, 0.5)
                if sn >= 0:
                    ez = abs(sn) ** 0.7 * ht * max(shrink, 0.55)
                else:
                    ez = -abs(sn) ** 3 * 0.003
                p = np.array([cx + ex, y, max(0.0, ez + 0.003)])
                verts.append(p)
                src.append(fi[np.argmin(((FP - p) ** 2).sum(1))])
        faces = []
        for k in range(NS - 1):
            for j in range(NA):
                a0, a1 = k * NA + j, k * NA + (j + 1) % NA
                faces.append((a0, a1, a1 + NA, a0 + NA))
        for k, sgn_ in ((0, 1), (NS - 1, -1)):   # end caps
            ci = len(verts); verts.append(np.mean(verts[k * NA:(k + 1) * NA], axis=0))
            src.append(src[k * NA])
            for j in range(NA):
                f = (ci, k * NA + j, k * NA + (j + 1) % NA)
                faces.append(f if sgn_ > 0 else f[::-1])
        ob = make_mesh(f'Shoe_{s_}', [tuple(v) for v in verts], faces)
        me = ob.data
        # Outward normals: most faces must point away from the shoe's center.
        ctr = np.mean([v.co[:] for v in me.vertices], axis=0)
        outward = sum(np.dot(np.array(p.normal), np.array(p.center) - ctr) for p in me.polygons)
        if outward < 0: me.flip_normals()
        for poly in me.polygons: poly.use_smooth = True
        ob.data.materials.append(shoe_m)
        bind(ob, src_index=src)
    if BOOTS:
        # Boot shafts up the shin; the pants tuck in under them.
        BOOT_TOP = ANK + 0.2
        def shaft_face(f):
            f = list(f); return z[f].min() > ANK - 0.02 and z[f].max() < BOOT_TOP and (calf_w[f] + foot_w[f]).min() > 0.5
        def shaft_off(idx):
            return 0.01 + 0.02 * ss((z[idx] - ANK) / 0.17)
        shell('Shoe', shaft_face, shaft_off, shoe_m)

# ---- Sword and harness (Toren) ----
if 'sword' in OUTFIT:
    strap_m = material('Strap', col('Strap', 0x4a3222))
    a2 = np.array([-0.17, 1.5]); b2 = np.array([0.16, 1.08])     # right shoulder -> left hip (x, z)
    d2 = (b2 - a2) / np.linalg.norm(b2 - a2)
    def strap_face(f):
        f = list(f); c = BV[f].mean(axis=0)
        rel = np.array([c[0], c[2]]) - a2
        along = rel @ d2
        dist = abs(rel[0] * d2[1] - rel[1] * d2[0])
        return dist < 0.02 and -0.04 < along < np.linalg.norm(b2 - a2) + 0.03 and arm_w[f].max() < 0.3 \
            and neckhead_w[f].max() < 0.3
    shell('Strap', strap_face, const(0.024), strap_m, drape=8)
    # Sword across the back: hilt over the right shoulder, tip at the left hip.
    top, _ = back_point(-0.12, 1.42)
    bot, _ = back_point(0.12, 1.12)
    top = top + np.array([0, 0.045, 0]); bot = bot + np.array([0, 0.045, 0])
    axis = (top - bot) / np.linalg.norm(top - bot)
    from mathutils import Vector as _V
    rot = _V((0, 0, 1)).rotation_difference(_V(tuple(axis))).to_euler()
    blade_len = 0.78
    mid = top - axis * (blade_len / 2 - 0.02)
    sc = solid('Scabbard', 'cylinder', material('Blade', col('Blade', 0x2a2a30)), 'spine_03',
               vertices=8, radius=1, depth=1, location=tuple(mid), rotation=tuple(rot))
    sc.scale = (0.022, 0.012, blade_len)
    guard = solid('Guard', 'cube', material('Hilt', col('Hilt', 0x9a7a3a)), 'spine_03',
                  size=1, location=tuple(top + axis * 0.02), rotation=tuple(rot))
    guard.scale = (0.075, 0.02, 0.016)
    grip = solid('Grip', 'cylinder', material('Strap', col('Strap', 0x4a3222)), 'spine_03',
                 vertices=8, radius=1, depth=1, location=tuple(top + axis * 0.11), rotation=tuple(rot))
    grip.scale = (0.012, 0.012, 0.16)
    pommel = solid('Pommel', 'uv_sphere', material('Hilt', col('Hilt', 0x9a7a3a)), 'spine_03',
                   segments=8, ring_count=6, radius=0.017, location=tuple(top + axis * 0.2))
    for ob in (sc, guard, grip):
        bpy.context.view_layer.objects.active = ob
        for o in bpy.data.objects: o.select_set(False)
        ob.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
