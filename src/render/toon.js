import * as THREE from 'three';

// Low-cost anime cel shading: MeshToonMaterial with a 3-step gradient ramp
// (one texture shared by everything) plus optional inverted-hull outlines.
let gradientMap = null;
function getGradient() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([90, 170, 255]);
  gradientMap = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const cache = new Map();

export function toon(color, opts = {}) {
  const key = opts.shared === false ? null : `${color}|${opts.emissive || 0}|${opts.side || 0}|${opts.flat || 0}|${opts.vertexColors ? 1 : 0}`;
  if (key && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: getGradient(),
    emissive: opts.emissive || 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: !!opts.vertexColors,
  });
  if (key) cache.set(key, m);
  return m;
}

// Unique (not cached) toon material, for things whose color changes at runtime.
export function toonUnique(color, opts = {}) {
  return toon(color, { ...opts, shared: false });
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x14100c, side: THREE.BackSide });

// Inverted-hull outline: a slightly scaled back-face copy. Cheap (one extra
// draw per mesh), so only used on characters and key props.
export function addOutline(mesh, thickness = 0.04) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat);
  o.scale.setScalar(1 + thickness);
  o.userData.isOutline = true;
  o.castShadow = false;
  o.raycast = () => {};
  mesh.add(o);
  return o;
}

export function glowMaterial(color, opacity = 0.8) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// Soft round sprite texture used by particles, aura sparks, glows.
let softTex = null;
export function softCircleTexture() {
  if (softTex) return softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(c);
  softTex.colorSpace = THREE.SRGBColorSpace;
  return softTex;
}

// Outline for merged meshes: back faces pushed out along the vertex normal
// (works for any geometry, unlike scaling a copy about its origin).
const extrudeCache = new Map();
export function outlineExtrudeMaterial(thickness = 0.012) {
  const key = thickness.toFixed(4);
  if (extrudeCache.has(key)) return extrudeCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color: 0x14100c, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed += normalize(normal) * ${key};`);
  };
  m.customProgramCacheKey = () => `outline-extrude-${key}`;
  extrudeCache.set(key, m);
  return m;
}
