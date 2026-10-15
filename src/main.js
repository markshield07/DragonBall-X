import { Game } from './core/Game.js';
import { maybeInstallEmulator } from './dev/emulator.js';

// Entry point: detect WebXR support at runtime, then let the player choose
// VR or desktop. The same Game (same systems) runs in both modes.
async function boot() {
  await maybeInstallEmulator();
  const game = new Game(document.getElementById('app'));
  window.__dbx = game; // handy for debugging from the console

  const landing = document.getElementById('landing');
  const vrBtn = document.getElementById('btn-enter-vr');
  const deskBtn = document.getElementById('btn-desktop');
  const status = document.getElementById('vr-status');
  const corner = document.getElementById('btn-enter-vr-corner');

  let xrSupported = false;
  if (navigator.xr && window.isSecureContext) {
    try { xrSupported = await navigator.xr.isSessionSupported('immersive-vr'); } catch { xrSupported = false; }
  }
  game.xrSupported = xrSupported;
  if (xrSupported) {
    vrBtn.disabled = false;
    vrBtn.textContent = 'Enter VR';
    status.textContent = 'VR headset detected. Put it on and press Enter VR.';
  } else {
    vrBtn.textContent = 'VR not available';
    status.textContent = !window.isSecureContext
      ? 'VR needs HTTPS (or localhost). See the README for how to host it securely.'
      : 'No WebXR VR support in this browser: desktop controls are ready.';
  }

  const enterVR = async () => {
    try {
      landing.classList.add('hidden');
      await game.start('xr');
    } catch (err) {
      console.error(err);
      status.textContent = `Could not start VR: ${err.message}`;
      landing.classList.remove('hidden');
    }
  };
  vrBtn.addEventListener('click', enterVR);
  corner.addEventListener('click', enterVR);
  deskBtn.addEventListener('click', async () => {
    landing.classList.add('hidden');
    await game.start('desktop');
  });

  // Render the arena behind the landing screen.
  game.renderer.render();
}

boot();
