// Customization options for the character creator. All names are original.
//
// Six starting characters (CHARACTER_TEMPLATES). Each has its own rigged 3D
// model (src/character/ModelAvatar.js); the creator recolors it. Changing the
// body type or outfit style switches to the procedural avatar, which the
// creator can reshape freely.
export const SKIN_TONES = [
  { name: 'Porcelain', color: 0xffe3cc },
  { name: 'Fair', color: 0xf8d0aa },
  { name: 'Light', color: 0xeebc8e },
  { name: 'Warm', color: 0xdba273 },
  { name: 'Olive', color: 0xc08d5c },
  { name: 'Tan', color: 0xa87348 },
  { name: 'Bronze', color: 0x8c5a36 },
  { name: 'Umber', color: 0x6f4428 },
  { name: 'Deep', color: 0x56331e },
  { name: 'Ebony', color: 0x3e2416 },
];

export const HAIR_STYLES = [
  { id: 'rokan', name: 'Titan Mane' }, // Rokan default: thick, wild, swept-back spikes
  { id: 'wild', name: 'Wild Spikes' }, // classic hero burst in every direction
  { id: 'upright', name: 'Upright Spikes' }, // tall spikes standing straight up
  { id: 'short', name: 'Short Spikes' }, // cropped spikes with a single bang
  { id: 'layered', name: 'Layered Mane' }, // long layered hair down the back
  { id: 'prince', name: 'Prince Crest' }, // widow's peak, tall flame-like crest
  { id: 'swordsman', name: 'Swordsman Cut' },
  { id: 'ponytail', name: 'Battle Ponytail' },
];

export const HAIR_COLORS = [
  { name: 'Black', color: 0x16171d },
  { name: 'Brown', color: 0x4a2c18 },
  { name: 'Blonde', color: 0xf0cf6a },
  { name: 'White', color: 0xf4f4f8 },
  { name: 'Red', color: 0xb3232e },
  { name: 'Blue', color: 0x2650c8 },
  { name: 'Silver', color: 0xb8c2d0 },
  { name: 'Lavender', color: 0xb7a6d8 },
];

export const EYE_COLORS = [
  { name: 'Black', color: 0x15161c },
  { name: 'Brown', color: 0x6b3e1e },
  { name: 'Amber', color: 0xd08a1a },
  { name: 'Blue', color: 0x2f6fd6 },
  { name: 'Green', color: 0x2e9a54 },
  { name: 'Violet', color: 0x7a3fc4 },
  { name: 'Red', color: 0xc42a2a },
  { name: 'Steel', color: 0x5f7390 },
  { name: 'Ice', color: 0x7fd8ff },
];

// Body presets scale the one shared rig. Rokan's default is Muscular.
// width: shoulders/chest, limb: arm & leg thickness, height: overall scale.
export const BUILDS = [
  { id: 'lean', name: 'Lean', width: 0.86, limb: 0.82, chestDepth: 0.9, height: 0.98 },
  { id: 'athletic', name: 'Athletic', width: 0.94, limb: 0.92, chestDepth: 0.95, height: 1.0 },
  { id: 'muscular', name: 'Muscular', width: 1.0, limb: 1.0, chestDepth: 1.0, height: 1.0 },
  { id: 'heavy', name: 'Heavy Muscular', width: 1.12, limb: 1.16, chestDepth: 1.1, height: 1.02 },
  { id: 'compact', name: 'Compact Fighter', width: 1.1, limb: 1.04, chestDepth: 1.04, height: 0.93 },
  { id: 'towering', name: 'Towering Titan', width: 1.13, limb: 1.14, chestDepth: 1.1, height: 1.1 },
];

// Frame: kept from Phase 1 so existing female warriors still load.
export const BODY_TYPES = [
  { id: 'male', name: 'Masculine' },
  { id: 'female', name: 'Feminine' },
];

export const BROWS = [
  { id: 'fierce', name: 'Fierce' }, // angled, thick (Rokan)
  { id: 'heavy', name: 'Heavy' },
  { id: 'sharp', name: 'Sharp' },
  { id: 'calm', name: 'Calm' },
];

export const SCARS = [
  { id: 'none', name: 'None' },
  { id: 'eye', name: 'Eye Scar' },
  { id: 'cheek', name: 'Cheek Scar' },
  { id: 'cross', name: 'Cross Scar' },
];

export const EXPRESSIONS = [
  { id: 'fierce', name: 'Fierce' }, // narrowed, intense eyes (Rokan)
  { id: 'focused', name: 'Focused' },
  { id: 'bright', name: 'Bright' }, // large, open anime eyes
];

// Outfit style decides which pieces exist; the five color slots below
// recolor them. 'primal' is Rokan's default: shirtless, baggy gi pants with
// a ragged waist flap, a tied sash, fingerless gloves, ankle wraps, sandals.
export const OUTFITS = [
  { id: 'primal', name: 'Primal Gi' },
  { id: 'rokan', name: 'Titan Armor' },
  { id: 'gi', name: 'Training Gi' },
  { id: 'jacket', name: 'Battle Jacket' },
  { id: 'tank', name: 'Sleeveless Fighter' },
];

// One palette shared by every outfit section.
export const OUTFIT_PALETTE = [
  { name: 'Crimson', color: 0xb81d2a },
  { name: 'Black', color: 0x17171d },
  { name: 'Charcoal', color: 0x3a3b46 },
  { name: 'White', color: 0xeeeef2 },
  { name: 'Gold', color: 0xd9a92e },
  { name: 'Orange', color: 0xff7a1a },
  { name: 'Royal Blue', color: 0x2546c7 },
  { name: 'Navy', color: 0x1b2552 },
  { name: 'Purple', color: 0x5a2d91 },
  { name: 'Forest', color: 0x2c7a3c },
  { name: 'Bandage', color: 0xd8c3a0 },
];

// Recolorable outfit sections, in creator order.
export const OUTFIT_SECTIONS = [
  { key: 'armorColor', name: 'Main / pants' },
  { key: 'suitColor', name: 'Under / wraps' },
  { key: 'gloveColor', name: 'Gloves' },
  { key: 'bootColor', name: 'Footwear' },
  { key: 'beltColor', name: 'Belt / sash' },
];

export const paletteColor = (i) => OUTFIT_PALETTE[((i % OUTFIT_PALETTE.length) + OUTFIT_PALETTE.length) % OUTFIT_PALETTE.length].color;
export const buildOf = (c) => BUILDS.find((b) => b.id === c.build) || BUILDS[2];

const NAME_A = ['Kar', 'Vel', 'Ra', 'Zor', 'Bry', 'Tal', 'Sei', 'Kai', 'Lum', 'Dax', 'Ori', 'Nap', 'Ro'];
const NAME_B = ['ot', 'ix', 'en', 'ara', 'u', 'iko', 'as', 'ion', 'ia', 'ek', 'ro', 'ina', 'kan'];
export function randomName() {
  const a = NAME_A[Math.floor(Math.random() * NAME_A.length)];
  const b = NAME_B[Math.floor(Math.random() * NAME_B.length)];
  return (a + b).slice(0, 12);
}

// The six approved starter characters (docs/SIX_CHARACTER_VROID_ART_DIRECTION.md).
// No licensed character models or costumes are used.
export const CHARACTER_TEMPLATES = [
  { id: 'rokan', name: 'Rokan - Primal Titan', description: 'Massive primal brawler', appearance: { body: 'male', build: 'heavy', skin: 7, hairStyle: 'rokan', hairColor: 0, eyeColor: 7, brows: 'fierce', expression: 'fierce', scar: 'none', outfit: 'primal', armorColor: 0, suitColor: 10, gloveColor: 1, bootColor: 1, beltColor: 1 } },
  { id: 'kaizen', name: 'Kaizen - Rising Warrior', description: 'Optimistic hero in an orange-and-navy gi', appearance: { body: 'male', build: 'athletic', skin: 3, hairStyle: 'wild', hairColor: 0, eyeColor: 0, brows: 'focused', expression: 'bright', scar: 'none', outfit: 'gi', armorColor: 5, suitColor: 7, gloveColor: 7, bootColor: 7, beltColor: 7 } },
  { id: 'vexar', name: 'Vexar - Elite Prince', description: 'Compact bodybuilder in battle armor', appearance: { body: 'male', build: 'compact', skin: 2, hairStyle: 'prince', hairColor: 0, eyeColor: 0, brows: 'fierce', expression: 'fierce', scar: 'none', outfit: 'rokan', armorColor: 3, suitColor: 7, gloveColor: 3, bootColor: 3, beltColor: 4 } },
  { id: 'toren', name: 'Toren - Time Wanderer', description: 'Lean swordsman in a cropped jacket', appearance: { body: 'male', build: 'lean', skin: 1, hairStyle: 'swordsman', hairColor: 7, eyeColor: 3, brows: 'sharp', expression: 'focused', scar: 'none', outfit: 'jacket', armorColor: 8, suitColor: 1, gloveColor: 1, bootColor: 2, beltColor: 1 } },
  { id: 'zyra', name: 'Zyra - Lightning Warrior', description: 'Athletic fighter with a silver ponytail', appearance: { body: 'female', build: 'athletic', skin: 8, hairStyle: 'ponytail', hairColor: 6, eyeColor: 5, brows: 'sharp', expression: 'focused', scar: 'none', outfit: 'tank', armorColor: 1, suitColor: 1, gloveColor: 1, bootColor: 1, beltColor: 0 } },
  { id: 'zeron', name: 'Zeron - Cosmic Warrior', description: 'Towering warrior in white-and-teal armor', appearance: { body: 'male', build: 'towering', skin: 2, hairStyle: 'layered', hairColor: 3, eyeColor: 8, brows: 'sharp', expression: 'fierce', scar: 'none', outfit: 'rokan', armorColor: 3, suitColor: 1, gloveColor: 1, bootColor: 3, beltColor: 4 } },
];
export function applyCharacterTemplate(character, id) {
  const template = CHARACTER_TEMPLATES.find(t => t.id === id) || CHARACTER_TEMPLATES[0];
  Object.assign(character, template.appearance, { templateId: template.id });
  return character;
}

// The Rokan default look (matches the reference concept art).
export function defaultCharacter() {
  return {
    version: 2,
    templateId: 'rokan',
    name: randomName(),
    body: 'male',
    build: 'heavy',
    skin: 7, // Umber
    hairStyle: 'rokan',
    hairColor: 0, // Black
    eyeColor: 7, // Steel blue-grey
    brows: 'fierce',
    scar: 'none',
    expression: 'fierce',
    outfit: 'primal',
    armorColor: 0, // Crimson pants, waist flap and wrist cuffs
    suitColor: 10, // Bandage ankle wraps
    gloveColor: 1, // Black fingerless gloves
    bootColor: 1, // Black sandals
    beltColor: 1, // Black sash
  };
}

// Phase 1 saves stored outfitColor (a primary/secondary pair) and older
// hairstyle ids. Map them onto the new sections so nobody loses their look.
const OLD_HAIR = { spiky: 'wild', flame: 'prince', scholar: 'short', mane: 'layered' };
const OLD_OUTFIT_COLORS = [[5, 6], [6, 3], [8, 1], [0, 1], [9, 4], [3, 6], [7, 5]];
const OLD_HAIR_COLORS = [0, 1, 6, 4, 6, 1, 5]; // Black, Brown, Lavender→Silver, Crimson→Red, Silver, Forest→Brown, Navy→Blue
const OLD_SKIN = [0, 2, 3, 5, 6, 8, 9];
export function migrateCharacter(saved) {
  const c = { ...defaultCharacter(), ...(saved || {}) };
  if (!saved || saved.version >= 2) return c;
  c.version = 2;
  c.hairStyle = OLD_HAIR[saved.hairStyle] || (HAIR_STYLES.some((h) => h.id === saved.hairStyle) ? saved.hairStyle : 'rokan');
  c.hairColor = OLD_HAIR_COLORS[saved.hairColor] ?? 0;
  c.skin = OLD_SKIN[saved.skin] ?? 8;
  c.eyeColor = [0, 1, 3, 4, 5, 6][saved.eyeColor] ?? 0;
  c.outfit = saved.outfit === 'armor' ? 'rokan' : saved.outfit || 'rokan';
  const [p, s] = OLD_OUTFIT_COLORS[saved.outfitColor] || [0, 1];
  Object.assign(c, { armorColor: p, suitColor: s, gloveColor: s, bootColor: 1, beltColor: s });
  c.build = 'muscular';
  delete c.outfitColor;
  return c;
}
