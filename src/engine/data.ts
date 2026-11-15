/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The game's content, loaded and checked once. The store, the run checker and the
// tests import from here, so a broken card fails loudly at start-up, not mid-run.

import cardsJson from "../data/cards.json";
import levelJson from "../data/moon.level.json";
import { checkCards } from "./cardRules";
import { loadCards, loadLevel } from "./content";
import { newRun } from "./run";
import type { Card, LevelConfig, Specialist } from "./types";

export const moonLevel: LevelConfig = loadLevel(levelJson, "src/data/moon.level.json");

export const moonCards: Card[] = (() => {
  const cards = loadCards(cardsJson, "src/data/cards.json");
  const problems = checkCards(cards);
  if (problems.length) throw new Error(`src/data/cards.json:\n- ${problems.join("\n- ")}`);
  return cards;
})();

/**
 * Build a run from a seed and the picked specialist. The store and the run-checker
 * worker both start runs here, so they always agree. Step 6 adds the real DONKI
 * storm track at this one spot.
 */
export function startRun(seed: number, specialist: Specialist) {
  return newRun({ level: moonLevel, cards: moonCards, seed, specialist });
}
