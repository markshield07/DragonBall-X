import * as THREE from 'three';

// Cartoon "seeing stars": little stars circling over a stunned fighter's head.
let starTex = null;
function texture() {
  if (starTex) return starTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 12 : 28;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#ffe04a';
  g.strokeStyle = '#7a4a00';
  g.lineWidth = 4;
  g.fill();
  g.stroke();
  starTex = new THREE.CanvasTexture(c);
  starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}

export class Dizzy {
  constructor(parent, count = 4) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.stars = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture(), transparent: true, depthWrite: false }));
      s.renderOrder = 18;
      this.group.add(s);
      this.stars.push(s);
    }
    parent.add(this.group);
    this.t = 0;
    this.k = 0;
  }

  // on: stunned now; height: local y above the parent origin; radius: orbit size.
  update(dt, on, height, radius = 0.25) {
    this.k = Math.max(0, Math.min(1, this.k + (on ? dt * 5 : -dt * 4)));
    this.group.visible = this.k > 0.01;
    if (!this.group.visible) return;
    this.t += dt;
    this.group.position.set(0, height, 0);
    this.stars.forEach((s, i) => {
      const a = this.t * 4 + (i / this.stars.length) * Math.PI * 2;
      s.position.set(Math.cos(a) * radius, Math.sin(a * 2) * 0.03, Math.sin(a) * radius);
      s.scale.setScalar(0.11 * this.k * radius / 0.25);
      s.material.rotation = this.t * 3 + i;
    });
  }
}
