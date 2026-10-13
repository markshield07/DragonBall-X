import { SaveSystem } from '../save/SaveSystem.js';

// Graphics presets. Low targets Quest 2 at 72 Hz with headroom; High is meant
// for Quest 3 / desktop. `particles` scales every particle budget.
export const GRAPHICS_PRESETS = {
  low: {
    label: 'Low', framebufferScale: 0.8, foveation: 1, pixelRatioCap: 1, shadows: false,
    particles: 0.45, auraLayers: 1, lightning: 2, environmentDetail: 0, targetFps: 72, maxDesktopPixelRatio: 1,
  },
  medium: {
    label: 'Medium', framebufferScale: 1.0, foveation: 0.7, pixelRatioCap: 1.25, shadows: false,
    particles: 0.75, auraLayers: 2, lightning: 3, environmentDetail: 1, targetFps: 72, maxDesktopPixelRatio: 1.5,
  },
  high: {
    label: 'High', framebufferScale: 1.2, foveation: 0.5, pixelRatioCap: 2, shadows: true,
    particles: 1.0, auraLayers: 3, lightning: 5, environmentDetail: 2, targetFps: 90, maxDesktopPixelRatio: 2,
  },
};

export const VISUAL_INTENSITY = { low: 0.5, medium: 0.8, high: 1.0 };

export function detectDevice() {
  const ua = navigator.userAgent || '';
  const isQuest = /OculusBrowser|Quest/i.test(ua);
  // Quest 3 / 3S user agents contain "Quest 3"; Quest 2 contains "Quest 2" or nothing specific.
  const isQuest3 = /Quest 3/i.test(ua);
  return { isQuest, isQuest3, isQuest2: isQuest && !isQuest3 };
}

export function defaultSettings() {
  const dev = detectDevice();
  return {
    graphics: dev.isQuest2 ? 'low' : dev.isQuest3 ? 'high' : 'medium',
    autoQuality: true,
    visualIntensity: 'medium',
    turnMode: 'snap', // snap | smooth
    snapAngle: 45,
    smoothTurnSpeed: 120,
    moveMode: 'smooth', // smooth | teleport
    vignette: true,
    seated: false,
    haptics: true,
    masterVolume: 0.8,
    battleDamage: true, // blood, cuts and bruises at low health
    dominantHand: 'right',
    mouseSensitivity: 1, // desktop look speed multiplier
    cameraView: 'inside', // desktop: inside (first person) | behind (third person)
  };
}

export function loadSettings() {
  return Object.assign(defaultSettings(), SaveSystem.loadSettings() || {});
}
