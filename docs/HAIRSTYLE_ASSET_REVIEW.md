# Dragon Ball X — Approved Hair Concept Integration

## Status
Concept designs approved for exploration; **not yet usable GLB hair meshes**. The prior image-generation renders are visual reference sheets, not geometry. This branch intentionally does not replace existing working hair with missing assets.

## Art direction
Apply the approved styles to the existing six rigged characters. Preserve Rokan's heavyweight bodybuilder form and each template's head and face. Aim for **solid, layered, sculpted anime hair masses** with clean silhouette, not cones or individual procedural spikes.

Styles:
1. **Wild Hero:** broad, radial swept-back black spikes, uneven bangs, readable from every direction.
2. **Royal Crest:** high flame-like swept crest, central widow's peak and tight sides.
3. **Young Warrior:** short, asymmetrical upward spikes, controlled compact silhouette.
4. **Layered Lavender:** center-part bob, long overlapping curved locks and rounded rear volume.
5. **Primal Mane:** massive coarse layered spikes behind head, compatible with Rokan.
6. **Warrior Headband:** layered, wind-swept wild hair with a headband.

These are original hairstyles *inspired by* shonen silhouettes; avoid licensed 3D models or rip files.

## Required asset format
One **complete modeled hairstyle** per .glb at `public/models/hair/<id>.glb`. Do not create the hairstyle by manually laying out a list of runtime primitives.
- Rigging/attachment: head bone (not a free-floating world-space object).
- Uniform units, Y up, +Z forward, matching `ModelAvatar.js` coordinate convention.
- Separate hair material for tinting, with optional accessory material.
- Scalp mesh/cap integrated; no bald patches from front, side, or back.
- Do not merge the hairstyle with the face or body geometry.
- Stylized normals, cel-shaded material, manageable triangle count for standalone Quest 2.
- Hair fits the six templates without colliding with facial features; per-model fit offsets may be necessary.
- Ensure base black/lavender, SSJ1/2 gold, SSJ3 long variant, SSJ4 black mane, SSJ5 electric blue; form variants may need separate GLBs or morph targets.
- Verify ownership/license/redistribution permissions for any external asset, including VRoid Hub downloads.

## Claude review and screenshots
1. Fetch the latest game and this branch; use `src/character/hairstyleCatalog.js` as the list of asset IDs.
2. Produce/import actual 3D hair assets before enabling the new options in the game.
3. Add an asynchronous loader/cache using existing GLTFLoader; attach loaded hair to the rigged character's head bone.
4. Hide only the old hair meshes/outline **after** new mesh loading succeeds; leave legacy meshes as fallback on load failure.
5. Maintain tint and transformation state across customization, preview, and reloads. Keep the same hair when switching forms unless an explicit form variation applies.
6. Create screenshots of Rokan wearing all six styles, from **front, 3/4, side and back**, plus one Super Saiyan preview. Also preview Royal Crest on Vexar and Layered Lavender on Toren.
7. Verify no clipping during head turning, punches, VR hand movement and mirror rendering. Test desktop build before physical Quest 2/3 validation.
8. Do not merge until the actual meshes (not only concept art) are approved.

## Existing code considerations
- `src/character/ModelAvatar.js` currently uses a GLB with named hair parts (`Hair`, `HairSSJ`, `HairSSJ3`, `HairSSJ4`) and a head bone at `this.bones.head`.
- `src/character/createAvatar.js` chooses rigged models or procedural fallback.
- `src/character/options.js` lists existing hair choices; avoid exposing missing models as selectable.
- `src/character/hair.js` is the legacy procedural fallback; don't delete until the new asset workflow is stable.

## Do not change
Story mode, bosses, maps, combat, progression, controller inputs, or save data outside the minimal hair customization integration.
