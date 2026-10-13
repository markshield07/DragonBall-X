import { Avatar } from './Avatar.js';
import { ModelAvatar, modelFor } from './ModelAvatar.js';

// Modeled (GLB) character when one exists for this look, else the procedural rig.
export function createAvatar(character) {
  return modelFor(character) ? new ModelAvatar(character) : new Avatar(character);
}

// True when an existing avatar can't show this look and must be rebuilt.
export function needsNewAvatar(avatar, character) {
  const want = modelFor(character);
  return avatar instanceof ModelAvatar ? avatar.modelId !== want : !!want;
}
