import * as THREE from 'three';
import { toon, addOutline } from '../render/toon.js';
import { bus } from '../core/events.js';

// The Hyperbolic Time Chamber (Room of Spirit and Time), as in Dragon Ball Z:
// a square of white tiles in front of the living quarters (a white building
// with two tall pointed towers and a giant hourglass), and past the edge of
// the tiles nothing but endless white. The air swings between scorching heat
// and freezing cold. Swapped in for the training grounds (the arena is
// hidden), so it costs only a handful of draw calls.
const TILE_HALF = 18; // half size of the tiled platform (m)
const TILE_CZ = 2; // platform centre (z)
const WEATHER = 400; // heat motes / snowflakes
// The climate cycle (seconds): calm, heat, calm, cold.
const CYCLE = [['calm', 35], ['heat', 25], ['calm', 20], ['cold', 30]];
const FOG_CALM = new THREE.Color(0xfbf8f1), FOG_HEAT = new THREE.Color(0xffe0bf), FOG_COLD = new THREE.Color(0xd9ebff);
const CYCLE_LEN = CYCLE.reduce((s, c) => s + c[1], 0);

export class TimeChamber {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'timeChamber';
    this.group.visible = false;
    scene.add(this.group);
    this.time = 0;
    this.climate = 'calm';
    this.heat = 0; // -1 freezing .. 0 calm .. 1 scorching (eased)

    // Sky: blinding white with a faint warm (or icy) glow near the horizon.
    this.skyUniforms = { uHeat: { value: 0 } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uHeat; varying vec3 vP; void main(){ vec3 d = normalize(vP);
        vec3 low = mix(vec3(1.0, 0.97, 0.9), uHeat > 0.0 ? vec3(1.0, 0.86, 0.66) : vec3(0.84, 0.92, 1.0), abs(uHeat) * 0.8);
        vec3 c = mix(low, vec3(0.98, 0.98, 1.0), smoothstep(-0.05, 0.55, d.y));
        gl_FragColor = vec4(c, 1.0); }`,
    }));
    sky.renderOrder = -10;
    this.group.add(sky);

    // Floor: a square of white tiles with a crisp edge, then the endless
    // white nothingness of the room.
    this.floorUniforms = { uTime: { value: 0 }, uHeat: { value: 0 } };
    const floor = new THREE.Mesh(new THREE.CircleGeometry(300, 48), new THREE.ShaderMaterial({
      uniforms: this.floorUniforms,
      fog: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uHeat; varying vec3 vW; void main(){
        vec2 q = vec2(vW.x, vW.z - ${TILE_CZ.toFixed(1)});
        float edge = max(abs(q.x), abs(q.y));
        float onTiles = 1.0 - step(${TILE_HALF.toFixed(1)}, edge);
        vec2 g = abs(fract(vW.xz / 2.0) - 0.5);
        float line = 1.0 - smoothstep(0.46, 0.49, max(g.x, g.y));
        float rim = smoothstep(${(TILE_HALF - 0.5).toFixed(1)}, ${(TILE_HALF - 0.05).toFixed(1)}, edge) * onTiles;
        vec3 tiles = vec3(0.95, 0.94, 0.92) * (0.9 + 0.1 * line) - rim * 0.12;
        // Past the tiles: plain white, a faint shadow line right at the drop.
        float lip = (1.0 - onTiles) * (1.0 - smoothstep(${TILE_HALF.toFixed(1)}, ${(TILE_HALF + 1.2).toFixed(1)}, edge));
        float far = smoothstep(${TILE_HALF.toFixed(1)}, 90.0, edge);
        vec3 voidC = mix(vec3(0.97, 0.96, 0.94) - lip * 0.08, vec3(1.0, 0.98, 0.95), far);
        vec3 c = mix(voidC, tiles, onTiles);
        c *= mix(vec3(1.0), uHeat > 0.0 ? vec3(1.0, 0.95, 0.88) : vec3(0.93, 0.97, 1.0), abs(uHeat) * 0.7);
        gl_FragColor = vec4(c, 1.0); }`,
    }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    this.group.add(floor);

    this.buildQuarters();
    this.buildHourglass();
    this.buildWeather();
  }

  // The living quarters behind you: a white hall on a raised base, a dark
  // doorway (the way back out), round windows and the two tall pointed towers.
  buildQuarters() {
    const white = toon(0xf4f1ea);
    const trim = toon(0xc9b48a);
    const dark = toon(0x3c3833);
    const q = new THREE.Group();
    q.position.set(0, 0, 9);
    const base = new THREE.Mesh(new THREE.BoxGeometry(13, 0.8, 6), white);
    base.position.y = 0.4;
    const hall = new THREE.Mesh(new THREE.BoxGeometry(7, 3.6, 4), white);
    hall.position.set(0, 2.6, 0.4);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), white);
    dome.scale.set(1.25, 0.6, 0.75);
    dome.position.set(0, 4.4, 0.4);
    const band = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.3, 4.2), trim);
    band.position.set(0, 4.35, 0.4);
    q.add(base, hall, dome, band);
    // Arched doorway.
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.2, 0.1), dark);
    door.position.set(0, 1.9, -1.62);
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.1, 20, 1, false, 0, Math.PI), dark);
    arch.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    arch.position.set(0, 3.0, -1.62);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.1, 6, 20, Math.PI), trim);
    frame.position.set(0, 3.0, -1.64);
    q.add(door, arch, frame);
    // Round windows.
    for (const s of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), dark);
      win.position.set(s * 2.3, 2.9, -1.61);
      win.rotation.y = Math.PI;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.07, 6, 20), trim);
      ring.position.set(s * 2.3, 2.9, -1.63);
      q.add(win, ring);
    }
    // Two tall slender towers with pointed caps, the chamber's landmark.
    for (const s of [-1, 1]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, 11, 16), white);
      tower.position.set(s * 5.2, 6.3, 0.8);
      const ring1 = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.3, 16), trim);
      ring1.position.set(s * 5.2, 9.2, 0.8);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 10), white);
      bulb.scale.set(1, 1.2, 1);
      bulb.position.set(s * 5.2, 12.2, 0.8);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.75, 3.4, 16), trim);
      cap.position.set(s * 5.2, 14.6, 0.8);
      for (const m of [tower, bulb, cap]) addOutline(m, 0.03);
      q.add(tower, ring1, bulb, cap);
    }
    for (let i = 0; i < 4; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.2, 0.5), white);
      step.position.set(0, 0.1 + i * 0.2, -3.25 - (3 - i) * 0.5 + 1.5);
      q.add(step);
    }
    addOutline(base, 0.02);
    addOutline(hall, 0.02);
    addOutline(dome, 0.02);
    this.group.add(q);
  }

  // The giant hourglass beside the doorway. Its sand runs out once every
  // chamber day (24 s), then it turns over.
  buildHourglass() {
    const gold = toon(0xd9b25a);
    const hg = new THREE.Group();
    hg.position.set(-8.6, 0, 6.5);
    for (const y of [0.25, 6.35]) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.5, 24), gold);
      plate.position.y = y;
      addOutline(plate, 0.02);
      hg.add(plate);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.9, 8), gold);
      post.position.set(Math.cos(a) * 1.45, 3.3, Math.sin(a) * 1.45);
      hg.add(post);
    }
    // Glass: two bulbs meeting at a narrow neck.
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, y = 0.5 + t * 5.6;
      const r = 0.12 + 1.15 * Math.pow(Math.abs(Math.sin(t * Math.PI)), 0.7);
      pts.push(new THREE.Vector2(r, y));
    }
    const glass = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.28, depthWrite: false }));
    hg.add(glass);
    const sandMat = toon(0xe8c477);
    this.sandTop = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.6, 20), sandMat);
    this.sandTop.rotation.x = Math.PI; // point down into the neck
    this.sandTop.position.y = 3.3 + 0.8;
    this.sandBottom = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.4, 20), sandMat);
    this.sandBottom.position.y = 0.5 + 0.7;
    this.sandStream = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), sandMat);
    this.sandStream.position.y = 2.1;
    hg.add(this.sandTop, this.sandBottom, this.sandStream);
    this.hourglass = hg;
    this.group.add(hg);
  }

  // Heat motes drifting up, or snow blowing sideways, around the player.
  buildWeather() {
    const geo = new THREE.BufferGeometry();
    this.wPos = new Float32Array(WEATHER * 3);
    for (let i = 0; i < WEATHER; i++) this.respawn(i, true);
    geo.setAttribute('position', new THREE.BufferAttribute(this.wPos, 3));
    // Soft round dots instead of square points.
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const cx = cv.getContext('2d'); const grd = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = grd; cx.fillRect(0, 0, 32, 32);
    this.weatherMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0, depthWrite: false });
    this.weather = new THREE.Points(geo, this.weatherMat);
    this.weather.frustumCulled = false;
    this.group.add(this.weather);
  }

  respawn(i, anywhere) {
    const p = this.wPos;
    p[i * 3] = (Math.random() - 0.5) * 30;
    p[i * 3 + 1] = anywhere ? Math.random() * 9 : (this.climate === 'heat' ? 0 : 9);
    p[i * 3 + 2] = (Math.random() - 0.5) * 30;
  }

  setActive(v, arena) {
    this.group.visible = v;
    arena.group.visible = !v;
    if (!this.savedFog) this.savedFog = { color: this.scene.fog.color.clone(), near: this.scene.fog.near, far: this.scene.fog.far };
    if (v) {
      this.scene.fog.color.setHex(0xfbf8f1);
      this.scene.fog.near = 30;
      this.scene.fog.far = 220;
    } else {
      this.scene.fog.color.copy(this.savedFog.color);
      this.scene.fog.near = this.savedFog.near;
      this.scene.fog.far = this.savedFog.far;
    }
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    this.floorUniforms.uTime.value = this.time;

    // Climate cycle.
    let t = this.time % CYCLE_LEN, climate = 'calm';
    for (const [c, len] of CYCLE) { if (t < len) { climate = c; break; } t -= len; }
    if (climate !== this.climate) {
      this.climate = climate;
      if (climate === 'heat') bus.emit('hud:message', { text: 'The chamber is getting scorching hot!', color: '#ffb066', duration: 3 });
      if (climate === 'cold') bus.emit('hud:message', { text: 'Brrr! The chamber is freezing cold!', color: '#a8d8ff', duration: 3 });
    }
    const target = climate === 'heat' ? 1 : climate === 'cold' ? -1 : 0;
    this.heat += (target - this.heat) * Math.min(1, dt * 0.6);
    const h = this.heat;
    this.skyUniforms.uHeat.value = h;
    this.floorUniforms.uHeat.value = h;
    this.scene.fog.color.copy(FOG_CALM).lerp(h > 0 ? FOG_HEAT : FOG_COLD, Math.abs(h));
    this.scene.fog.far = 220 - Math.abs(h) * 120;

    // Weather particles.
    this.weatherMat.opacity = Math.min(1, Math.abs(h) * 1.2);
    this.weatherMat.color.setHex(h > 0 ? 0xffa64d : 0xffffff);
    this.weatherMat.size = h > 0 ? 0.12 : 0.17;
    if (Math.abs(h) > 0.02) {
      const p = this.wPos;
      for (let i = 0; i < WEATHER; i++) {
        if (h > 0) {
          p[i * 3 + 1] += dt * (0.6 + (i % 5) * 0.15);
          p[i * 3] += Math.sin(this.time * 2 + i) * dt * 0.3;
          if (p[i * 3 + 1] > 9) this.respawn(i, false);
        } else {
          p[i * 3 + 1] -= dt * (1.6 + (i % 4) * 0.3);
          p[i * 3] += dt * 3.5;
          if (p[i * 3 + 1] < 0 || p[i * 3] > 15) { this.respawn(i, false); if (p[i * 3] > 0) p[i * 3] -= 15; }
        }
      }
      this.weather.geometry.attributes.position.needsUpdate = true;
    }

    // Hourglass: one chamber day (24 s) per turn.
    const day = (this.time % 24) / 24;
    this.sandTop.scale.setScalar(Math.max(0.05, Math.pow(1 - day, 0.5)));
    this.sandTop.position.y = 3.3 + 0.8 * this.sandTop.scale.y;
    this.sandBottom.scale.setScalar(Math.max(0.05, Math.pow(day, 0.5)));
    this.sandBottom.position.y = 0.5 + 0.7 * this.sandBottom.scale.y;
    this.sandStream.visible = day < 0.98;
  }
}
