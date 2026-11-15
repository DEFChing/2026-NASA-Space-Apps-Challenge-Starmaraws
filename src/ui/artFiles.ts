/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// React screens (story panels, portraits, the mentor) use delivered art the same way
// the Phaser scene does: by key, if the file is in public/art, or a placeholder if not.

import files from "virtual:asset-files";

const have = new Set(files.art);

/** "art/story_intro_1.webp" if that file was delivered, otherwise null (draw a placeholder). */
export function artUrl(key: string, ext = "webp"): string | null {
  return have.has(`${key}.${ext}`) ? `art/${key}.${ext}` : null;
}
