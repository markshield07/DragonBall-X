// Approved anime-inspired hairstyle art direction.
// This is an asset manifest, not 3D geometry: source GLB/VRM hair meshes must be
// authored/exported and reviewed in-game before being marked available.
// Never create strands from individual cone primitives as a substitute.
export const HAIRSTYLE_CATALOG = Object.freeze([
  { id: 'wild-hero', name: 'Wild Hero', inspiration: 'Goku-like layered radial spikes', glb: 'models/hair/wild-hero.glb', color: 'black', status: 'awaiting-mesh' },
  { id: 'royal-crest', name: 'Royal Crest', inspiration: 'Vegeta-like widow peak and tall swept crest', glb: 'models/hair/royal-crest.glb', color: 'black', status: 'awaiting-mesh' },
  { id: 'young-warrior', name: 'Young Warrior', inspiration: 'Gohan-like asymmetrical short spikes', glb: 'models/hair/young-warrior.glb', color: 'black', status: 'awaiting-mesh' },
  { id: 'layered-lavender', name: 'Layered Lavender', inspiration: 'Trunks-like center-parted bob', glb: 'models/hair/layered-lavender.glb', color: 'lavender', status: 'awaiting-mesh' },
  { id: 'primal-mane', name: 'Primal Mane', inspiration: 'Long, wild bodybuilder-warrior mane', glb: 'models/hair/primal-mane.glb', color: 'black', status: 'awaiting-mesh' },
  { id: 'warrior-headband', name: 'Warrior Headband', inspiration: 'Swept spiky hair with cloth band', glb: 'models/hair/warrior-headband.glb', color: 'black', status: 'awaiting-mesh' },
]);
export const hairstyleById = (id) => HAIRSTYLE_CATALOG.find((entry) => entry.id === id);
