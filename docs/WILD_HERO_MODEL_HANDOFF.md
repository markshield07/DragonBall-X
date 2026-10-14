# Wild Hero hairstyle — finalized v1 model handoff

## Status
The user approved moving forward with the existing **Wild_Hero_Hair_v1.glb** without Claude remodeling or redesigning it. This is an existing real 3D mesh created outside the repo; the binary **is not committed to this branch**, because the GitHub connection does not permit binary file uploads. The user will provide that GLB directly to Claude in the conversation as an attachment. **Do not pretend the mesh is in GitHub.**

## Exact target
- Destination: `public/models/hair/wild-hero.glb`
- Input file: `Wild_Hero_Hair_v1.glb`, to be supplied by the user.
- Original coordinates: meters, +Y up, face +Z, origin at scalp center.
- Mesh has ~50 named meshes, no skeleton, intended as a rigid attachment to head bone.
- Prototype size: roughly 0.93m wide, 0.58m tall, 0.74m deep; expect to scale and offset for the actual head.
- Preferred character: Rokan; preserve all six character templates.
- Keep the original hair meshes hidden only after new hair successfully loads; fallback on failure.

## Claude's task — integration ONLY
1. Copy the **exact provided binary** to the destination above, without replacing geometry, adding spikes, or generating new hair.
2. Update the rigged GLB avatar's hair loading as necessary to attach this model to `this.bones.head`. Use transforms to fit it to Rokan, not mesh edits.
3. Preserve existing skin, face, body, controls, save data, and game systems. Treat new hair as cosmetic asset.
4. Tint materials for base and current transformation colors; leave original geometry untouched.
5. Screenshot on Rokan: front, three-quarter, side and rear in the actual game. Show at least one golden and blue form if feasible.
6. Test the desktop build and report Quest-specific testing as unverified unless physically checked.
7. Do not model, sculpt, regenerate, optimize shape, or redesign this asset. Ask the user for the GLB attachment if unavailable.
8. Keep integration on a review branch; do not merge until the user approves screenshots.

## Existing implementation context
`src/character/ModelAvatar.js` has `this.bones.head`, uses existing built-in hair parts named `Hair`, `HairSSJ`, `HairSSJ3`, `HairSSJ4`. `src/character/options.js` defines styles. Prior `chatgpt/anime-hairstyle-asset-integration` is specification-only and contains no mesh.
