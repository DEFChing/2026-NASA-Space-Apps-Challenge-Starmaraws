/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// A new word, explained in plain words the first time it appears (Build Guide, Step 8).
// "Regolith" is already explained by the card that introduces it (B0: "moon dirt,
// called regolith"); these are the words the game uses without a card to explain them.

import { useEffect, useState } from "react";
import { markWordSeen, readProgress } from "./progress";

export const WORDS = {
  "lunar day": "On the Moon, daytime lasts about 14 Earth days. The solar panels make Power the whole time.",
  "lunar night": "The Moon's night also lasts about 14 Earth days. No sunlight reaches the solar panels and it gets bitterly cold, so Power saved by day keeps the crew warm.",
  "radiation dose": "How much space radiation your body has soaked up. Each pip on the Radiation Badge is a little more dose. Real astronauts stop flying when they reach their limit.",
} as const;
export type Word = keyof typeof WORDS;

/** Shows the word's explanation once, ever (remembered between visits). */
export function NewWord({ word }: { word: Word }) {
  const [show] = useState(() => !readProgress().seenWords.includes(word));
  useEffect(() => { if (show) markWordSeen(word); }, [show, word]);
  if (!show) return null;
  return (
    <aside className="new-word" data-testid="new-word" data-word={word}>
      <span aria-hidden="true" className="icon">{"✦"}</span> <strong>New word: {word}.</strong> {WORDS[word]}
    </aside>
  );
}
