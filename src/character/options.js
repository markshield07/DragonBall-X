// Customization options for the character creator. All names are original.
export const SKIN_TONES = [
  { name: 'Fair', color: 0xffe0c4 },
  { name: 'Light', color: 0xf6c9a0 },
  { name: 'Warm', color: 0xe3a878 },
  { name: 'Tan', color: 0xc68a5a },
  { name: 'Bronze', color: 0x9c6a42 },
  { name: 'Deep', color: 0x6e4529 },
  { name: 'Ebony', color: 0x4a2d1b },
];

export const HAIR_STYLES = [
  { id: 'spiky', name: 'Wild Spikes' }, // inspired by the classic hero silhouette
  { id: 'flame', name: 'Flame Crest' }, // tall upward "prince" silhouette
  { id: 'scholar', name: 'Scholar Spikes' }, // short spikes with a single bang
  { id: 'swordsman', name: 'Swordsman Cut' }, // straight center-parted hair
  { id: 'mane', name: 'Warrior Mane' }, // long wild hair down the back
  { id: 'ponytail', name: 'Battle Ponytail' },
];

export const HAIR_COLORS = [
  { name: 'Black', color: 0x15161c },
  { name: 'Dark Brown', color: 0x3b2618 },
  { name: 'Lavender', color: 0xb9a4e8 },
  { name: 'Crimson', color: 0x9e1f2a },
  { name: 'Silver', color: 0xcfd6e0 },
  { name: 'Forest', color: 0x1f5a3a },
  { name: 'Navy', color: 0x1d2a5e },
];

export const EYE_COLORS = [
  { name: 'Black', color: 0x15161c },
  { name: 'Brown', color: 0x6b3e1e },
  { name: 'Blue', color: 0x2f6fd6 },
  { name: 'Green', color: 0x2e9a54 },
  { name: 'Violet', color: 0x7a3fc4 },
  { name: 'Red', color: 0xc42a2a },
];

export const BODY_TYPES = [
  { id: 'male', name: 'Male' },
  { id: 'female', name: 'Female' },
];

export const OUTFITS = [
  { id: 'gi', name: 'Training Gi' },
  { id: 'armor', name: 'Saiyan Armor' },
  { id: 'jacket', name: 'Battle Jacket' },
  { id: 'tank', name: 'Sleeveless Fighter' },
];

export const OUTFIT_COLORS = [
  { name: 'Sunset Orange', primary: 0xff7a1a, secondary: 0x1f3fa8 },
  { name: 'Royal Blue', primary: 0x2546c7, secondary: 0xe9e9f2 },
  { name: 'Shadow Purple', primary: 0x5a2d91, secondary: 0x1a1a24 },
  { name: 'Crimson', primary: 0xc4202f, secondary: 0x202024 },
  { name: 'Forest', primary: 0x2c7a3c, secondary: 0xe0c060 },
  { name: 'Snow', primary: 0xf2f2f2, secondary: 0x2b4fd8 },
  { name: 'Midnight', primary: 0x1c2240, secondary: 0xff9a1a },
];

const NAME_A = ['Kar', 'Vel', 'Ra', 'Zor', 'Bry', 'Tal', 'Sei', 'Kai', 'Lum', 'Dax', 'Ori', 'Nap'];
const NAME_B = ['ot', 'ix', 'en', 'ara', 'u', 'iko', 'as', 'ion', 'ia', 'ek', 'ro', 'ina'];
export function randomName() {
  const a = NAME_A[Math.floor(Math.random() * NAME_A.length)];
  const b = NAME_B[Math.floor(Math.random() * NAME_B.length)];
  return (a + b).slice(0, 12);
}

export function defaultCharacter() {
  return {
    name: randomName(),
    body: 'male',
    skin: 1,
    hairStyle: 'spiky',
    hairColor: 0,
    eyeColor: 0,
    outfit: 'gi',
    outfitColor: 0,
  };
}
