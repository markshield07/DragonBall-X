"""High-resolution muscle detail (grooves and sharp separations) for the
normal-map bake. Same space as sculpt.py (meters, z-up, front = -y, left = +x)."""
import numpy as np

def surf_point(V, N, x, z, side='front', tol=0.012):
    m = (np.abs(V[:, 0] - x) < tol) & (np.abs(V[:, 2] - z) < tol)
    c = np.where(m)[0]
    if len(c) == 0:
        return None
    k = c[np.argmin(V[c, 1])] if side == 'front' else c[np.argmax(V[c, 1])]
    return V[k]

def seg_dist(P, a, b):
    ab = b - a
    t = np.clip(((P - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)

class Detailer:
    def __init__(self, V, N, k=1.0):
        self.k = k
        self.V, self.N = V, N
        self.D = np.zeros(len(V))

    def groove(self, pts, width, depth, taper=True):
        pts = [p for p in pts if p is not None]
        if len(pts) < 2: return
        lo = np.min(pts, axis=0) - width * 2; hi = np.max(pts, axis=0) + width * 2
        m = np.all((self.V > lo) & (self.V < hi), axis=1)
        idx = np.where(m)[0]
        if not len(idx): return
        P = self.V[idx]
        d = np.full(len(idx), 1e9); tt = np.zeros(len(idx))
        n = len(pts) - 1
        for i in range(n):
            di = seg_dist(P, np.array(pts[i]), np.array(pts[i + 1]))
            better = di < d
            d = np.where(better, di, d); tt = np.where(better, (i + 0.5) / n, tt)
        prof = np.clip(1 - (d / width) ** 2, 0, 1) ** 2
        if taper:
            prof *= np.clip(np.sin(np.pi * np.clip(tt, 0, 1)) * 1.6, 0, 1)
        self.D[idx] -= depth * self.k * prof

    def bump(self, c, r, amp, power=0.7):
        if c is None: return
        q = (self.V - c) / np.array(r)
        d2 = (q * q).sum(1)
        self.D += amp * self.k * np.clip(1 - d2, 0, 1) ** power

def detail_bodybuilder(V, N, J, k=1.0, female=False):
    Dt = Detailer(V, N, k)
    F = lambda x, z: surf_point(V, N, x, z, 'front')
    Bk = lambda x, z: surf_point(V, N, x, z, 'back')
    line = lambda f, xs, zs: [f(x, z) for x, z in zip(xs, zs)]
    # Abs: linea alba and three tendinous intersections, semilunar lines.
    Dt.groove(line(F, [0] * 9, np.linspace(1.06, 1.335, 9)), 0.009, 0.0045, taper=False)
    for zc in (1.302, 1.245, 1.185, 1.128):
        xs = np.linspace(-0.075, 0.075, 9)
        Dt.groove(line(F, xs, zc - 0.004 * np.cos(xs / 0.075 * np.pi / 2) * 0), 0.0075, 0.0035)
    for s in (1, -1):
        X = lambda xs: [s * x for x in xs]
        Dt.groove(line(F, X([0.085, 0.088, 0.083, 0.072, 0.05]), [1.31, 1.25, 1.18, 1.11, 1.05]), 0.009, 0.0035)
        # Pectoral lower edge and the cleavage between pec and delt.
        if not female:
            Dt.groove(line(F, X([0.01, 0.05, 0.10, 0.145, 0.175]), [1.33, 1.315, 1.315, 1.335, 1.38]), 0.012, 0.006)
        Dt.groove(line(F, X([0.14, 0.165, 0.185, 0.2]), [1.49, 1.45, 1.41, 1.37]), 0.01, 0.004)
        if not female:
            Dt.groove(line(F, X([0.03, 0.025, 0.02]), [1.48, 1.42, 1.36]), 0.008, 0.0025)
        # Serratus fingers
        for k in range(4):
            z0 = 1.33 - 0.03 * k
            Dt.groove(line(F, X([0.11, 0.135, 0.155]), [z0 - 0.005, z0 + 0.008, z0 + 0.02]), 0.006, 0.0028)
        # Obliques / inguinal V-line
        Dt.groove(line(F, X([0.11, 0.095, 0.07, 0.04]), [1.09, 1.05, 1.0, 0.97]), 0.01, 0.004)
        # Back: spine channel, lat edges, teres, lower trap
        Dt.groove(line(Bk, X([0.14, 0.13, 0.11, 0.08]), [1.40, 1.30, 1.20, 1.12]), 0.012, 0.004)
        Dt.groove(line(Bk, X([0.06, 0.1, 0.15]), [1.30, 1.38, 1.44]), 0.01, 0.003)
        # Arms: delt-biceps and biceps-triceps separations along the upper arm.
        sh, el, hd = (np.array(J[f'joint-{"l" if s == 1 else "r"}-{n}']) for n in ('shoulder', 'elbow', 'hand'))
        for frac_side, depth in ((-1, 0.004), (1, 0.004)):
            pts = []
            for t in np.linspace(0.15, 0.9, 7):
                c = sh + (el - sh) * t
                # outer side line of the upper arm: farthest vertex from the body midline near c
                m = np.linalg.norm(V - c, axis=1) < 0.075
                idx = np.where(m)[0]
                if not len(idx): continue
                # pick lateral-front (biceps/triceps split) or lateral-back
                score = V[idx, 0] * s * 1.0 + frac_side * V[idx, 1] * 0.6
                pts.append(V[idx[np.argmax(score)]])
            Dt.groove(pts, 0.009, depth)
        # Deltoid insertion
        Dt.bump(sh + (el - sh) * 0.1 + np.array([0.03 * s, 0, 0]), (0.05, 0.05, 0.05), 0.002)
        # Forearm: a groove between flexors and extensors
        pts = []
        for t in np.linspace(0.05, 0.7, 6):
            c = el + (hd - el) * t
            idx = np.where(np.linalg.norm(V - c, axis=1) < 0.06)[0]
            if len(idx): pts.append(V[idx[np.argmax(V[idx, 2] - V[idx, 1] * 0.3)]])
        Dt.groove(pts, 0.008, 0.003)
        # Legs: quad separations and calf split
        hip, kn, an = (np.array(J[f'joint-{"l" if s == 1 else "r"}-{n}']) for n in ('upper-leg', 'knee', 'ankle'))
        for off in (0.04, -0.03):
            pts = []
            for t in np.linspace(0.2, 0.95, 7):
                c = hip + (kn - hip) * t
                idx = np.where(np.linalg.norm(V - c, axis=1) < 0.11)[0]
                if len(idx): pts.append(V[idx[np.argmax(-V[idx, 1] + s * off * 8 * V[idx, 0])]])
            Dt.groove(pts, 0.012, 0.0035)
        pts = []
        for t in np.linspace(0.1, 0.55, 6):
            c = kn + (an - kn) * t
            idx = np.where(np.linalg.norm(V - c, axis=1) < 0.08)[0]
            if len(idx): pts.append(V[idx[np.argmax(V[idx, 1])]])
        Dt.groove(pts, 0.01, 0.0035)
    return V + N * Dt.D[:, None]
