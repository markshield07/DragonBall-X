// Optional WebXR emulation for testing VR code paths on a desktop browser
// without a headset: open the game with ?emulate=quest2 or ?emulate=quest3.
// Uses Meta's open-source Immersive Web Emulation Runtime (iwer). Loaded only
// when requested, so it never ships in the normal code path.
export async function maybeInstallEmulator() {
  const params = new URLSearchParams(location.search);
  const which = params.get('emulate');
  if (!which) return null;
  const { XRDevice, metaQuest2, metaQuest3 } = await import('iwer');
  const device = new XRDevice(which === 'quest2' ? metaQuest2 : metaQuest3);
  device.installRuntime();
  device.position.set(0, 1.6, 0);
  window.__xrDevice = device;
  console.info(`[DBX] WebXR emulator installed (${which}).`);
  return device;
}
