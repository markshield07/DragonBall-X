"""Per-character settings for the build. Everything is built at Rokan's
height (the game scales each model to its real height, see MODELS in
src/character/ModelAvatar.js), so the shared landmarks in sculpt.py,
parts.py and hair.py line up for every body.

Fields
  targets   MakeHuman/MPFB2 morph targets and weights
  muscle    multiplier for the bodybuilder sculpt (1 = Rokan)
  female    softer sculpt (no pec plates) and female eye/lash shape
  outfit    clothing pieces built by parts.py
  hair      base hairstyle in hair.py
  eyes      eye shape: height, slant, iris size, brow weight and angle
  colors    default material colors (the game recolors most of them)
"""

MALE_FACE = [
    ('head-square', 0.35), ('chin-width-incr', 0.3), ('chin-prominent-incr', 0.3),
    ('l-eye-scale-incr', 0.7), ('r-eye-scale-incr', 0.7),
    ('l-eye-height2-incr', 0.8), ('r-eye-height2-incr', 0.8),
]

def male(ethnic, muscle_min, muscle_avg, arms, vshape, extra=()):
    """Male body: ethnic mix, how much bodybuilder bulk, arm size, V-taper."""
    t = [(f'{e}-male-young', w) for e, w in ethnic]
    t += [('universal-male-young-maxmuscle-minweight', muscle_min),
          ('universal-male-young-maxmuscle-averageweight', muscle_avg),
          ('universal-male-young-averagemuscle-minweight', max(0.0, 1 - muscle_min - muscle_avg)),
          ('height', 0.15), ('proportions', 1.0),
          ('torso-vshape-incr', 0.9 * vshape), ('torso-muscle-dorsi-incr', vshape),
          ('torso-muscle-pectoral-incr', 0.9 * vshape), ('measure-shoulder-dist-incr', 0.5 * vshape),
          ('measure-waist-circ-decr', 0.6), ('stomach-tone-incr', 1.0),
          ('measure-upperarm-circ-incr', arms)]
    for s in 'lr':
        t += [(f'{s}-upperarm-scale-horiz-incr', 0.5 * arms), (f'{s}-upperarm-scale-depth-incr', 0.5 * arms),
              (f'{s}-lowerarm-scale-horiz-incr', 0.5 * arms), (f'{s}-lowerarm-scale-depth-incr', 0.5 * arms),
              (f'{s}-upperarm-muscle-incr', arms), (f'{s}-upperarm-shoulder-muscle-incr', arms),
              (f'{s}-lowerarm-muscle-incr', arms), (f'{s}-upperleg-muscle-incr', arms),
              (f'{s}-lowerleg-muscle-incr', 0.5 * arms)]
    t += [('measure-thigh-circ-incr', 0.4 * arms), ('measure-calf-circ-incr', 0.2 * arms),
          ('measure-neck-circ-incr', 0.8 * vshape)]
    return t + MALE_FACE + list(extra)

CHARACTERS = {
    'rokan': dict(
        targets=male([('caucasian', 0.4), ('asian', 0.3), ('african', 0.3)], 0.75, 0.25, 1.0, 1.0),
        muscle=1.0, female=False,
        outfit=['pants', 'sash', 'gloves', 'cuffs', 'wraps', 'shoes'],
        hair='rokan',
        eyes=dict(h=1.0, slant=1.0, iris=1.0, brow=1.0, brow_slope=1.0),
        colors=dict(Pants=0xa3161c, Sash=0x141414, Glove=0x161618, Band=0xb3202a, Wrap=0xd8c7a3, Shoe=0x121212, Iris=0x2c3b56),
    ),
    'kaizen': dict(
        targets=male([('caucasian', 0.5), ('asian', 0.5)], 0.45, 0.25, 0.55, 0.65),
        muscle=0.62, female=False,
        outfit=['undershirt', 'gi_top', 'pants', 'belt', 'wristbands', 'boots'],
        hair='wild',
        eyes=dict(h=1.15, slant=0.35, iris=1.08, brow=0.85, brow_slope=0.45),
        colors=dict(Pants=0xf2751c, Main=0xf2751c, Under=0x1b2552, Sash=0x1b2552, Cuff=0x1b2552, Shoe=0x1b2552, Iris=0x15161c),
    ),
    'vexar': dict(
        targets=male([('caucasian', 0.6), ('asian', 0.4)], 0.7, 0.3, 0.9, 0.95),
        muscle=0.9, female=False,
        outfit=['bodysuit', 'chest_armor', 'shoulder_flaps', 'gloves_full', 'boots'],
        hair='prince',
        eyes=dict(h=0.8, slant=1.35, iris=0.85, brow=1.15, brow_slope=1.5),
        colors=dict(Under=0x1b2552, Main=0xeeeef2, Trim=0xd9a92e, Glove=0xeeeef2, Shoe=0xeeeef2, Iris=0x15161c),
    ),
    'toren': dict(
        targets=male([('caucasian', 0.7), ('asian', 0.3)], 0.25, 0.15, 0.3, 0.45),
        muscle=0.42, female=False,
        outfit=['tank', 'jacket', 'slim_pants', 'belt', 'boots', 'sword'],
        hair='layered',
        eyes=dict(h=0.95, slant=0.6, iris=0.95, brow=0.7, brow_slope=0.7),
        colors=dict(Under=0x17171d, Main=0x5a2d91, Pants=0x17171d, Sash=0x6b4a2a, Shoe=0x3a3b46, Strap=0x4a3222, Blade=0x2a2a30, Hilt=0x9a7a3a, Iris=0x2f6fd6, Hair=0xb7a6d8),
    ),
    'zyra': dict(
        targets=[('african-female-young', 0.7), ('caucasian-female-young', 0.3),
                 ('universal-female-young-maxmuscle-minweight', 0.55),
                 ('universal-female-young-maxmuscle-averageweight', 0.2),
                 ('universal-female-young-averagemuscle-averageweight', 0.25),
                 ('measure-waist-circ-decr', 0.4), ('stomach-tone-incr', 0.8),
                 ('l-eye-scale-incr', 0.8), ('r-eye-scale-incr', 0.8),
                 ('l-eye-height2-incr', 0.8), ('r-eye-height2-incr', 0.8)],
        muscle=0.38, female=True,
        outfit=['crop_top', 'slim_pants', 'sash_side', 'gloves', 'armbands', 'boots'],
        hair='ponytail',
        eyes=dict(h=1.15, slant=0.8, iris=1.05, brow=0.6, brow_slope=0.9),
        colors=dict(Under=0x17171d, Pants=0x17171d, Sash=0xb81d2a, Glove=0x17171d, Cuff=0xb81d2a, Shoe=0x17171d, Iris=0x7a3fc4, Hair=0xd8dde6),
    ),
    'zeron': dict(
        targets=male([('caucasian', 0.8), ('asian', 0.2)], 0.6, 0.25, 0.75, 0.9),
        muscle=0.78, female=False,
        outfit=['bodysuit', 'chest_armor', 'armor_accents', 'shoulder_pads', 'forearm_guards', 'gloves_full', 'boots'],
        hair='long_spikes',
        eyes=dict(h=0.9, slant=1.1, iris=0.92, brow=0.8, brow_slope=1.1),
        colors=dict(Under=0x17171d, Main=0xeeeef2, Accent=0x1fb5a8, Glove=0x17171d, Shoe=0xeeeef2, Iris=0x7fd8ff, Hair=0xe8eef4),
    ),
}
