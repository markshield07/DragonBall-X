import * as THREE from 'three';
import { toon } from '../render/toon.js';
import { createAvatar } from '../character/createAvatar.js';
import { Aura } from '../fx/Aura.js';
import { BattleDamage } from '../fx/BattleDamage.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

// Training-room mirror. Instead of re-rendering the whole scene (too costly on
// Quest), a copy of the player's avatar is placed inside a closed "mirror
// room" behind the glass, under a reflection transform (scale.x = -1) that
// copies the player's head and hand movement. Looking into the frame shows
// your transformed character, aura and hair.
export class Mirror {
  constructor(game, { planeX = -3.2, z = 0 } = {}) {
    this.game = game;
    this.planeX = planeX;
    this.z = z;
    this.group = new THREE.Group();
    this.group.name = 'mirror';
    game.renderer.scene.add(this.group);
    this.buildRoom();

    // Reflection root: reflects world-space content across the plane x = planeX.
    this.reflect = new THREE.Group();
    this.reflect.position.x = 2 * planeX;
    this.reflect.scale.x = -1;
    game.renderer.scene.add(this.reflect);
    this.avatar = null;
    this.aura = new Aura({ radius: 0.7, height: 2.3 });
    this.reflect.add(this.aura.group);
  }

  buildRoom() {
    const W = 1.7; // mirror opening width (along z)
    const H = 2.5;
    const depth = 9;
    const roomW = 7;
    const roomH = 3.6;
    const x0 = this.planeX;
    const wallMat = toon(0xe9e2d6);
    const trim = toon(0xc08a3a);
    const g = this.group;
    // Front wall with an opening for the mirror
    const sideW = (roomW - W) / 2;
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.2, roomH, sideW), wallMat);
      w.position.set(x0 - 0.1, roomH / 2, this.z + s * (W / 2 + sideW / 2));
      g.add(w);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.2, roomH - H, W), wallMat);
    top.position.set(x0 - 0.1, H + (roomH - H) / 2, this.z);
    g.add(top);
    // Golden frame
    const fTop = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, W + 0.24), trim);
    fTop.position.set(x0 + 0.02, H + 0.06, this.z);
    g.add(fTop);
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.14, H + 0.12, 0.12), trim);
      f.position.set(x0 + 0.02, H / 2, this.z + s * (W / 2 + 0.06));
      g.add(f);
    }
    // Closed room behind the glass (hides the mirror avatar from every other angle)
    const inner = new THREE.MeshBasicMaterial({ color: 0x1c2346, side: THREE.BackSide });
    const room = new THREE.Mesh(new THREE.BoxGeometry(depth, roomH, roomW), inner);
    room.position.set(x0 - depth / 2 - 0.2, roomH / 2, this.z);
    g.add(room);
    // Outer skin (front face left open so the mirror opening shows the room).
    const hiddenFace = new THREE.MeshBasicMaterial({ visible: false });
    const outer = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.1, roomH + 0.05, roomW + 0.1), [hiddenFace, wallMat, wallMat, wallMat, wallMat, wallMat]);
    outer.position.copy(room.position);
    g.add(outer);
    // Reflected floor inside
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(depth, roomW), toon(0x8f8a9e));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.position.x, 0.035, this.z); // covers the platform edge inside the room
    g.add(floor);
    // Subtle glass sheen
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.07, depthWrite: false }));
    glass.rotation.y = Math.PI / 2;
    glass.position.set(x0 + 0.005, H / 2, this.z);
    g.add(glass);
    // Roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 1.6, 4), toon(0xa3412e, { flat: true }));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(room.position.x, roomH + 0.8, this.z);
    roof.scale.set(1, 1, 0.9);
    g.add(roof);
    this.roomBounds = { xMin: x0 - depth - 0.3, xMax: x0, zMin: this.z - roomW / 2, zMax: this.z + roomW / 2 };
  }

  setCharacter(character) {
    if (this.avatar) {
      this.reflect.remove(this.avatar.root);
      this.avatar.dispose();
    }
    this.avatar = createAvatar(character);
    this.reflect.add(this.avatar.root);
    this.avatar.setForm(this.game.player?.form || 'base');
    // Your own battle damage shows in the mirror.
    this.wounds = new BattleDamage(this.avatar.root, this.game, { scale: 0.8 });
  }

  setForm(id) {
    this.avatar?.setForm(id);
  }

  update(dt) {
    if (!this.avatar) return;
    const g = this.game;
    const head = g.player.headWorld;
    const b = this.roomBounds;
    const inFront = head.x > this.planeX + 0.2 || head.z < b.zMin || head.z > b.zMax;
    this.avatar.root.visible = inFront && g.state !== 'menu';
    if (!this.avatar.root.visible) { this.aura.group.visible = false; return; }
    // Body follows the head (feet on the floor), yaw follows head yaw.
    _e.setFromQuaternion(g.renderer.camera.getWorldQuaternion(_q), 'YXZ');
    const yaw = _e.y;
    const root = this.avatar.root;
    const eye = Math.max(0.9, head.y - g.player.groundY());
    const scale = THREE.MathUtils.clamp(eye / 1.66, 0.8, 1.15);
    root.scale.setScalar(scale);
    const floor = g.player.groundY();
    root.position.set(head.x, floor, head.z).sub(_v.set(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(-0.06));
    root.rotation.set(0, yaw + Math.PI, 0); // avatar faces +Z, camera looks down -Z
    root.updateMatrixWorld();
    // Hands to avatar-local space
    // root.matrix is the un-reflected transform (the reflection lives on the parent).
    root.updateMatrix();
    const inv = new THREE.Matrix4().copy(root.matrix).invert();
    const toLocal = (wp) => wp.clone().applyMatrix4(inv);
    const L = g.hands.hands.left;
    const R = g.hands.hands.right;
    const camQ = g.renderer.camera.getWorldQuaternion(new THREE.Quaternion());
    const headLocal = root.quaternion.clone().invert().multiply(camQ);
    // camera looks -Z; avatar head looks +Z -> rotate 180 about Y
    headLocal.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    // Player's left hand -> avatar's left arm (avatar left is +X in its local space)
    // Powering up or transforming: the reflection strikes the Dragon Ball power-up stance.
    const tr = g.transformation;
    if (tr && (tr.state === 'charging' || tr.state === 'transforming')) {
      this.powerTime = (this.powerTime || 0) + dt;
      this.avatar.powerUpPose(this.powerTime, tr.state === 'transforming' ? 1 : 0.55 + 0.45 * tr.charge);
    } else {
      this.avatar.setPose(L.group.visible ? toLocal(L.worldPos) : null, R.group.visible ? toLocal(R.worldPos) : null, headLocal);
    }
    // Aura mirrors the player's aura
    const pa = g.playerAura;
    this.aura.target = pa.target;
    this.aura.intensity = pa.intensity;
    this.aura.color.copy(pa.color);
    this.aura.core.copy(pa.core);
    this.aura.scale = pa.scale;
    this.aura.group.position.set(root.position.x, floor, root.position.z);
    this.wounds.update(dt, g.player.health / g.progress.maxHealth());
    this.aura.update(dt, g.renderer.camera, g.visualIntensity * 0.9);
  }
}
