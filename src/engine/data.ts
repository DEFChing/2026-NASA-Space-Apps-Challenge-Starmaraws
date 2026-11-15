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
import type { Card, LevelConfig } from "./types";

export const moonLevel: LevelConfig = loadLevel(levelJson, "src/data/moon.level.json");

export const moonCards: Card[] = (() => {
  const cards = loadCards(cardsJson, "src/data/cards.json");
  const problems = checkCards(cards);
  if (problems.length) throw new Error(`src/data/cards.json:\n- ${problems.join("\n- ")}`);
  return cards;
})();
