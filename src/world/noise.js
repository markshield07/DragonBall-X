// Small deterministic noise helpers shared by the terrain and props.

export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise (0..1) for terrain and color variation.
export function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise2(x, z) {
  const ix = Math.floor(x); const iz = Math.floor(z);
  const fx = x - ix; const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx); const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz); const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1); const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Ridged multi-octave noise (0..1): sharp crests where value noise crosses 0.5.
export function ridged(x, z, oct = 4) {
  let sum = 0, amp = 0.5, f = 1, w = 1;
  for (let o = 0; o < oct; o++) {
    let n = 1 - Math.abs(noise2(x * f, z * f) * 2 - 1);
    n = n * n * w;
    w = Math.min(1, n * 2);
    sum += n * amp;
    amp *= 0.5; f *= 2.03;
  }
  return sum;
}

// Fractal value noise (0..1).
export function fbm(x, z, oct = 3) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += noise2(x * f + o * 17.3, z * f - o * 9.1) * amp;
    norm += amp; amp *= 0.5; f *= 2.1;
  }
  return sum / norm;
}
