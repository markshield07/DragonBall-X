import * as THREE from 'three';

// Owns the WebGLRenderer, scene, camera and the player "rig" (the group that
// smooth locomotion / teleport / snap turn move around; the XR headset moves
// the camera inside it).
export class Renderer {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 600);
    this.rig = new THREE.Group();
    this.rig.name = 'playerRig';
    this.scene.add(this.rig);
    this.rig.add(this.camera);
    this.camera.position.set(0, 1.65, 0);

    window.addEventListener('resize', () => this.onResize());
  }

  get canvas() { return this.renderer.domElement; }
  get xr() { return this.renderer.xr; }
  get isPresenting() { return this.renderer.xr.isPresenting; }

  onResize() {
    if (this.isPresenting) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  applyGraphics(preset, isXR) {
    const r = this.renderer;
    r.shadowMap.enabled = !!preset.shadows;
    r.shadowMap.needsUpdate = true;
    if (!isXR) r.setPixelRatio(Math.min(window.devicePixelRatio, preset.maxDesktopPixelRatio));
    // Framebuffer scale can only change while not presenting.
    if (!r.xr.isPresenting) r.xr.setFramebufferScaleFactor(preset.framebufferScale);
    r.xr.setFoveation(preset.foveation);
    this.scene.traverse((o) => {
      if (o.material && o.material.needsUpdate !== undefined && o.isMesh) o.material.needsUpdate = true;
    });
  }

  // Ask the headset for a higher refresh rate where the preset wants one and
  // the device supports it (Quest 3: 90/120 Hz, Quest 2: 72/80/90 Hz).
  async applyFrameRate(targetFps) {
    const session = this.renderer.xr.getSession();
    if (!session || !session.supportedFrameRates || !session.updateTargetFrameRate) return null;
    const rates = [...session.supportedFrameRates].sort((a, b) => a - b);
    let best = rates[0];
    for (const r of rates) if (r <= targetFps) best = r;
    try {
      await session.updateTargetFrameRate(best);
      return best;
    } catch {
      return null;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
