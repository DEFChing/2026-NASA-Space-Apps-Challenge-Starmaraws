/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The game's content, loaded and checked once. The store, the run checker and the
// tests import from here, so a broken card fails loudly at start-up, not mid-run.

import cardsJson from "../data/cards.json";
import creditsJson from "../data/credits.json";
import donkiJson from "../data/donki.json";
import factsJson from "../data/facts.json";
import oddsJson from "../data/forecast-odds.json";
import levelJson from "../data/moon.level.json";
import { checkCards } from "./cardRules";
import { loadCards, loadLevel } from "./content";
import { loadArchive, type DonkiArchive } from "./donki";
import { checkCredits, checkFacts, type Credit, type Fact } from "./facts";
import { loadForecastOdds } from "./forecast";
import { newRun, PLACEHOLDER_ODDS } from "./run";
import type { Card, LevelConfig, Odds, Specialist } from "./types";
import { archiveWeather } from "./weather";

export const moonLevel: LevelConfig = loadLevel(levelJson, "src/data/moon.level.json");

export const moonCards: Card[] = (() => {
  const cards = loadCards(cardsJson, "src/data/cards.json");
  const problems = checkCards(cards);
  if (problems.length) throw new Error(`src/data/cards.json:\n- ${problems.join("\n- ")}`);
  return cards;
})();

const orThrow = <T>(r: { problems: string[] } & T): T => {
  if (r.problems.length) throw new Error(r.problems.join("\n"));
  return r;
};

/** Real NASA facts for the debrief (the docs team writes them). */
export const moonFacts: Fact[] = orThrow(checkFacts(factsJson)).facts;

/** Art and sound credits, from incoming/credits.csv. */
export const moonCredits: Credit[] = orThrow(checkCredits(creditsJson)).credits;

/** NASA's DONKI records, or null until scripts/fetch-donki.ts has been run. */
export const donkiArchive: DonkiArchive | null = loadArchive(donkiJson as unknown);

/** Forecast odds measured from that archive (tiers is null until they're measured). */
export const forecastOdds = loadForecastOdds(oddsJson as unknown);

/** A run builder for one archive: real DONKI weather if there is one, practice weather if not. */
export function runMaker(archive: DonkiArchive | null) {
  return (seed: number, specialist: Specialist) => {
    const real = archive ? archiveWeather(archive, seed, moonLevel.turns) : null;
    return newRun({ level: moonLevel, cards: moonCards, seed, specialist, weather: real?.weather, weatherStart: real?.start });
  };
}

/**
 * Build a run from a seed and the picked specialist. The store and the run-checker
 * worker both start runs here, so they always agree.
 */
export const startRun = runMaker(donkiArchive);

/** What the forecast says for a tier: measured from DONKI when available, placeholder otherwise. */
export function oddsInfo(odds: Odds): { chance: number; label: string; measured: boolean } {
  const t = forecastOdds.tiers?.[odds];
  return t ? { chance: t.chance, label: t.label, measured: true } : { chance: PLACEHOLDER_ODDS[odds].chance, label: PLACEHOLDER_ODDS[odds].label, measured: false };
}
