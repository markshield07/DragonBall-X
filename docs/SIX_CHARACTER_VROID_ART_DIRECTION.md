# Dragon Ball X — Approved Six Character Art Direction

**Status: Concept images approved; actual 3D models are not yet created.**

## Target
Use polished VRoid Studio / VRoid Hub-inspired anime designs, with custom bodybuilder anatomy sculpted in Blender or an equivalent tool. Do NOT use the existing primitive-generated characters as finished art. The six reference PNGs are visual targets, not importable 3D models.

## Roster
1. **Rokan — Primal Titan**: Dark-brown skin, massive bodybuilder, pronounced traps/delts/lats/pecs/abs/obliques/biceps/triceps/forearms/glutes/quads/hamstrings/calves, wild black hair, crimson martial pants, black sash, wrapped hands.
2. **Kaizen — Rising Warrior**: Athletic muscular, tan skin, wild black spikes, original orange-and-navy training gi. Optimistic shonen hero.
3. **Vexar — Elite Prince**: Shorter compact bodybuilder, upright black widow's-peak hair, severe expression, white/navy/gold science-fiction battle armor.
4. **Toren — Time Wanderer**: Lean muscular, layered lavender-silver hair, purple cropped jacket, black tactical pants, sword harness.
5. **Zyra — Lightning Warrior**: Dark-skinned athletic muscular woman, long high silver ponytail, intense violet eyes, black and crimson battle attire.
6. **Zeron — Cosmic Warrior**: Tall muscular, silver-white spiky long hair, icy blue eyes, white/black/teal futuristic armor.

All are original game archetypes, not exact reproductions of protected anime characters.

## Directions to Claude
- Inspect latest game code before changing anything. Keep working VR/desktop controls, combat, stats, progression, saves, transformations, and mirror.
- Replace primitive avatar visual pipeline with genuine modeled, rigged, animation-ready VRM or GLB assets. VRoid Studio exports may require additional Blender sculpting for bodybuilder anatomy.
- DO NOT call 2D PNG concept art a rigged model. If model assets aren't ready, implement asset manifest, loader, customization interfaces and precise modeling specs, and report the missing assets.
- Character creator: select any of six templates; then customize skin tone, hairstyles and colors, facial features and outfits where technically available. Avoid losing existing save data.
- Maintain Avatar methods: apply, setForm, setPose, restPose, dispose. Preserve caller contracts.
- Transformation visuals must be compatible with each model: SSJ1–3 golden, SSJ4 primal black mane with red fur/tail, SSJ5 bright blue.
- Build a rotatable character preview and capture desktop screenshots showing each of the six models in front/side/back views.
- Quest 2 standalone performance baseline, Quest 3 optional quality upgrade. Measure triangle/draw-call/material/texture/animation performance before claiming targets.
- Keep game arena unchanged in this stage.
- Use only original assets or appropriately licensed reusable assets.

## Acceptance criteria
- All six templates look meaningfully distinct in face, hairstyle, costume and silhouette (not simple recolors).
- Rokan has clear heroic bodybuilder musculature; no broken seams at joints.
- Working rig, animation, character preview, mirror, VR posing, ki charging and transformation without gameplay regressions.
- Request screenshots and actual headset checks before merging.

## Reference assets
Accompanying approved PNG concept-art package contains: 01-rokan.png, 02-kaizen.png, 03-vexar.png, 04-toren.png, 05-zyra.png and 06-zeron.png. These must be uploaded to the repo under art/concepts/ or made available to Claude separately; they are NOT 3D assets.

Proposed game model destinations: public/models/characters/{character}.glb.
