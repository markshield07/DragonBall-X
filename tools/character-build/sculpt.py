"""Procedural 'sculpt' pass: pushes the MakeHuman surface into heroic
bodybuilder muscle groups (pecs, delts, biceps, abs, lats, quads ...).
Everything is in Blender space (meters, z-up, front = -y, left = +x)."""
import numpy as np

def vertex_normals(V, faces):
    N = np.zeros_like(V)
    for f in faces:
        for k in range(1, len(f) - 1):
            a, b, c = V[f[0]], V[f[k]], V[f[k + 1]]
            n = np.cross(b - a, c - a)
            N[f[0]] += n; N[f[k]] += n; N[f[k + 1]] += n
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    return N

def smooth01(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)

class Sculptor:
    def __init__(self, V, faces, J):
        self.V = V
        self.faces = faces
        self.J = {k: np.array(v) for k, v in J.items()}
        self.N = vertex_normals(V, faces)
        self.D = np.zeros_like(V)  # accumulated displacement magnitude along normal

    def j(self, name, side=1):
        p = self.J[name.replace('L', 'l') if side == 1 else name.replace('L', 'r')].copy()
        return p

    def facing(self, d, sharp=2.0):
        """Weight for vertices whose normal points along d (0..1)."""
        if d is None:
            return 1.0
        d = np.array(d, dtype=float); d /= np.linalg.norm(d)
        return smooth01((self.N @ d) * sharp)

    def blob(self, c, r, amp, face=None, power=1.5, mask=None):
        """Ellipsoid bulge centered at c with radii r (x, y, z)."""
        q = (self.V - np.array(c)) / np.array(r)
        d2 = (q * q).sum(1)
        w = np.clip(1 - d2, 0, 1) ** power * self.facing(face)
        if mask is not None:
            w = w * mask
        self.D += (amp * w)[:, None] * self.N if np.ndim(amp) == 0 else 0

    def along(self, a, b, t0, t1, radius, amp, face=None, power=1.5, peak=0.5):
        """Spindle-shaped muscle along the segment a->b between t0 and t1."""
        a = np.array(a); b = np.array(b)
        ab = b - a; L2 = ab @ ab
        t = ((self.V - a) @ ab) / L2
        proj = a + t[:, None] * ab
        rad = np.linalg.norm(self.V - proj, axis=1)
        u = np.clip((t - t0) / (t1 - t0), 0, 1)
        # asymmetric spindle with its belly at `peak`
        prof = np.where(u < peak, np.sin(np.pi / 2 * u / peak), np.sin(np.pi / 2 * (1 - u) / (1 - peak)))
        prof = np.where((t > t0) & (t < t1), prof, 0) ** power
        w = prof * smooth01(1.3 - rad / radius) * self.facing(face)
        self.D += (amp * w)[:, None] * self.N

    def apply(self):
        self.V += self.D
        return self.V

def sculpt_bodybuilder(V, faces, J, nb):
    """V: all vertices (only the first nb are the body)."""
    S = Sculptor(V[:nb].copy(), faces, J)
    for s in (1, -1):
        X = lambda p: np.array([p[0] * s, p[1], p[2]])
        L = lambda n: S.J[n.replace('-l-', '-l-' if s == 1 else '-r-')]
        sh, el, hd = L('joint-l-shoulder'), L('joint-l-elbow'), L('joint-l-hand')
        hip, kn, an = L('joint-l-upper-leg'), L('joint-l-knee'), L('joint-l-ankle')
        # Pectorals: big plates, fuller toward the arm, a hard lower edge.
        S.blob(X([0.095, -0.12, 1.38]), (0.11, 0.09, 0.075), 0.022, face=(0.2 * s, -1, 0.1), power=1.2)
        S.blob(X([0.13, -0.10, 1.40]), (0.07, 0.07, 0.06), 0.010, face=(0.5 * s, -1, 0), power=1.5)
        # Deltoids: three heads capping the shoulder.
        S.blob(sh + np.array([0.035 * s, -0.035, 0.0]), (0.08, 0.07, 0.09), 0.027, face=(0.3 * s, -1, 0.2))
        S.blob(sh + np.array([0.05 * s, 0.0, -0.01]), (0.08, 0.08, 0.10), 0.032, face=(1 * s, 0, 0.3))
        S.blob(sh + np.array([0.03 * s, 0.04, 0.0]), (0.08, 0.07, 0.09), 0.024, face=(0.3 * s, 1, 0.2))
        # Biceps (front) and triceps (back) of the upper arm.
        S.along(sh, el, 0.25, 1.0, 0.08, 0.036, face=(0, -1, 0.4), peak=0.6)
        S.along(sh, el, 0.15, 0.9, 0.085, 0.03, face=(0.3 * s, 1, 0.3), peak=0.4)
        # Forearm: brachioradialis and flexors, thick near the elbow.
        S.along(el, hd, -0.05, 0.75, 0.065, 0.019, face=None, peak=0.25)
        # Trapezius: slope from neck to shoulder, and the upper back.
        S.blob(X([0.08, 0.02, 1.56]), (0.08, 0.06, 0.06), 0.018, face=(0.2 * s, 0.3, 1), power=1.2)
        S.blob(X([0.06, 0.08, 1.46]), (0.08, 0.06, 0.12), 0.012, face=(0, 1, 0))
        # Lats: the V-taper flare under the armpit.
        S.blob(X([0.15, 0.05, 1.30]), (0.07, 0.09, 0.14), 0.02, face=(1 * s, 0.6, 0), power=1.3)
        # Serratus: fingers on the ribs below the pecs.
        for k in range(3):
            S.blob(X([0.135, -0.07, 1.31 - 0.035 * k]), (0.03, 0.04, 0.016), 0.005, face=(0.7 * s, -1, 0))
        # Obliques
        S.blob(X([0.12, -0.04, 1.14]), (0.05, 0.06, 0.07), 0.008, face=(1 * s, -0.6, 0))
        # Abs: six blocks plus the lower belly; grooves fall between them.
        for row, z in enumerate((1.275, 1.215, 1.155)):
            S.blob(X([0.04, -0.12, z]), (0.035, 0.05, 0.026), 0.009, face=(0, -1, 0), power=1.0)
        S.blob(X([0.035, -0.11, 1.09]), (0.035, 0.05, 0.035), 0.006, face=(0, -1, 0))
        # Glutes
        S.blob(X([0.08, 0.10, 0.95]), (0.08, 0.06, 0.08), 0.01, face=(0, 1, 0))
        # Quads: vastus lateralis (outer sweep), rectus femoris, teardrop VMO.
        S.along(hip, kn, 0.1, 0.95, 0.09, 0.02, face=(1 * s, -0.4, 0), peak=0.5)
        S.along(hip, kn, 0.05, 0.85, 0.08, 0.016, face=(0, -1, 0), peak=0.45)
        S.blob(kn + np.array([-0.035 * s, -0.04, 0.10]), (0.04, 0.04, 0.06), 0.014, face=(-0.5 * s, -1, 0))
        # Hamstrings
        S.along(hip, kn, 0.15, 0.95, 0.08, 0.012, face=(0, 1, 0), peak=0.55)
        # Calves: twin gastrocnemius heads on the back of the lower leg.
        S.along(kn, an, 0.08, 0.6, 0.06, 0.016, face=(0.4 * s, 1, 0), peak=0.4)
        S.along(kn, an, 0.08, 0.55, 0.06, 0.014, face=(-0.4 * s, 1, 0), peak=0.35)
    # Neck: thick sternocleidomastoid and a heavy nape.
    S.blob([0, -0.03, 1.57], (0.07, 0.07, 0.07), 0.006)
    out = V.copy()
    out[:nb] = S.apply()
    return out
