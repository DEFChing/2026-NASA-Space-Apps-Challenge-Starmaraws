/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Which pictures were made with SI, read from credits.json (its "si" column), so every
// SI image in the game can carry a visible "SI-generated" label (AI_USAGE.md). A new
// asset row marked "yes" gets its label without anyone editing a screen.

import { moonCredits } from "../engine/data";
import type { Credit } from "../engine/facts";

export const isSiCredit = (c: Credit) => /^yes/i.test(c.si?.trim() ?? "");

/** "art/portrait_kai.webp" for each SI image in the credits. */
export function siArtFiles(credits: Credit[] = moonCredits): Set<string> {
  return new Set(credits.filter(isSiCredit).map(c => c.file.replace(/\\/g, "/")).filter(f => f.startsWith("art/")));
}

const SI_ART = siArtFiles();

/** Was this picture (by key) made with SI? */
export const isSiArt = (key: string, ext = "webp", files: Set<string> = SI_ART) => files.has(`art/${key}.${ext}`);
