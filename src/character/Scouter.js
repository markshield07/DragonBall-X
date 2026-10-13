import * as THREE from 'three';
import { toon } from '../render/toon.js';
import { addOutline } from '../render/toon.js';

// Scouter: a face accessory. An ear pod over the left ear with a little
// antenna, an arm curving forward along the temple, and a tinted glass lens
// over the left eye with a faint readout grid.
//
// Built in "head space": +Z forward, +Y up, +X the wearer's left.
// eye: centre of the left eye; ear: centre of the left ear (both in the
// parent's space); k: head size relative to an average head.
export function buildScouter(lensColor, eye, ear, k = 1) {
  const g = new THREE.Group();
  g.name = 'scouter';
  const shell = toon(0xd9dde3);
  const dark = toon(0x2a2d35);
  const part = (geo, mat, pos, rot = [0, 0, 0], outline = 0.06) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.rotation.set(rot[0], rot[1], rot[2]);
    g.add(m);
    if (outline) addOutline(m, outline);
    return m;
  };
  // Ear pod: a short, wide cylinder over the ear, its face pointing out.
  const pod = ear.clone().add(new THREE.Vector3(0.012 * k, 0.004 * k, 0));
  part(new THREE.CylinderGeometry(0.03 * k, 0.034 * k, 0.026 * k, 18), shell, pod, [0, 0, Math.PI / 2]);
  part(new THREE.CylinderGeometry(0.019 * k, 0.019 * k, 0.03 * k, 14), dark, pod.clone().add(new THREE.Vector3(0.004 * k, 0, 0)), [0, 0, Math.PI / 2], 0);
  // Small button and antenna on top.
  part(new THREE.BoxGeometry(0.012 * k, 0.01 * k, 0.018 * k), dark, pod.clone().add(new THREE.Vector3(0.008 * k, 0.032 * k, -0.004 * k)));
  part(new THREE.CylinderGeometry(0.002 * k, 0.003 * k, 0.05 * k, 6), dark, pod.clone().add(new THREE.Vector3(0.006 * k, 0.05 * k, -0.012 * k)), [-0.35, 0, -0.12], 0);
  // Arm: from the pod forward along the temple to the lens frame.
  const lens = eye.clone().add(new THREE.Vector3(0.006 * k, 0.004 * k, 0.034 * k));
  const from = pod.clone().add(new THREE.Vector3(0.002 * k, 0.012 * k, 0.02 * k));
  const to = lens.clone().add(new THREE.Vector3(0.03 * k, 0.012 * k, -0.004 * k));
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0.008 * k, 0.004 * k, 0));
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.0065 * k, 6, false), shell);
  g.add(arm);
  addOutline(arm, 0.04);
  // Lens frame and tinted glass, tilted to wrap a little around the face.
  const frame = new THREE.Shape();
  const w = 0.036 * k, h = 0.027 * k, r = 0.008 * k;
  frame.moveTo(-w + r, -h); frame.lineTo(w - r, -h); frame.quadraticCurveTo(w, -h, w, -h + r);
  frame.lineTo(w, h - r); frame.quadraticCurveTo(w, h, w - r, h); frame.lineTo(-w + r, h);
  frame.quadraticCurveTo(-w, h, -w, h - r); frame.lineTo(-w, -h + r); frame.quadraticCurveTo(-w, -h, -w + r, -h);
  const tilt = [0.05, 0.28, 0];
  const rim = new THREE.Mesh(new THREE.ShapeGeometry(frame).scale(1.12, 1.16, 1), dark);
  rim.position.copy(lens).add(new THREE.Vector3(0, 0, -0.002 * k));
  rim.rotation.set(...tilt);
  g.add(rim);
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(frame), new THREE.MeshBasicMaterial({ map: lensTexture(lensColor), transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }));
  glass.position.copy(lens);
  glass.rotation.set(...tilt);
  glass.renderOrder = 3;
  // ShapeGeometry UVs are in shape units: remap to 0..1 across the lens.
  const uv = glass.geometry.attributes.uv;
  const pos = glass.geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w) / (2 * w), (pos.getY(i) + h) / (2 * h));
  g.add(glass);
  return g;
}

const lensCache = new Map();
function lensTexture(color) {
  if (lensCache.has(color)) return lensCache.get(color);
  const c = document.createElement('canvas');
  c.width = 64; c.height = 48;
  const x = c.getContext('2d');
  const col = new THREE.Color(color);
  x.fillStyle = `#${col.getHexString()}`;
  x.fillRect(0, 0, 64, 48);
  // Readout: a faint grid, a target bracket and a few digits.
  x.strokeStyle = 'rgba(255,255,255,0.25)';
  x.lineWidth = 1;
  for (let i = 8; i < 64; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 48); x.stroke(); }
  for (let i = 8; i < 48; i += 8) { x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); }
  x.strokeStyle = 'rgba(255,255,255,0.7)';
  x.lineWidth = 2;
  x.strokeRect(22, 14, 18, 18);
  x.fillStyle = 'rgba(255,255,255,0.8)';
  x.font = 'bold 9px monospace';
  x.fillText('8 2 1', 4, 44);
  // Bright sheen across the top.
  const grd = x.createLinearGradient(0, 0, 64, 48);
  grd.addColorStop(0, 'rgba(255,255,255,0.45)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0)');
  x.fillStyle = grd;
  x.fillRect(0, 0, 64, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  lensCache.set(color, t);
  return t;
}
