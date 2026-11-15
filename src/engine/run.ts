/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Starting a run: deal the opener and the Day and Night piles from the seed, set the
// storm turns, make the gamble rolls and fill the bars.

import { makeRolls, mulberry32, shuffle, STREAM, streamSeed } from "./rng";
import type { Card, Ctx, GameState, LevelConfig, Odds, Specialist, WeatherTurn } from "./types";

/**
 * Placeholder forecast odds, used until the DONKI archive has been downloaded and
 * scripts/build-forecast.ts has measured real ones (src/data/forecast-odds.json).
 * `chance` is the chance of a storm; `label` is what the briefing says.
 */
export const PLACEHOLDER_ODDS: Record<Odds, { chance: number; label: string; share: number }> = {
  low:    { chance: 0.1, label: "1 in 10", share: 0.55 },
  medium: { chance: 1 / 3, label: "1 in 3", share: 0.3 },
  high:   { chance: 2 / 3, label: "2 in 3", share: 0.15 },
};

/**
 * Practice weather, used until the DONKI archive has been downloaded: each turn gets a
 * forecast tier, then a storm with that tier's chance. Real runs use weather.ts.
 */
export function placeholderWeather(seed: number, turns: number): WeatherTurn[] {
  const rand = mulberry32(streamSeed(seed, STREAM.weather));
  return Array.from({ length: turns }, () => {
    const a = rand();
    const forecast: Odds = a < PLACEHOLDER_ODDS.low.share ? "low"
      : a < PLACEHOLDER_ODDS.low.share + PLACEHOLDER_ODDS.medium.share ? "medium" : "high";
    return { forecast, storm: rand() < PLACEHOLDER_ODDS[forecast].chance };
  });
}

/** Shuffle each pile from the seed and deal it onto its turns. */
export function dealDeck(pool: Card[], level: LevelConfig, seed: number) {
  const rand = mulberry32(streamSeed(seed, STREAM.deal));
  const deck: string[] = Array(level.turns).fill("");
  const reserve: GameState["reserve"] = { day: [], night: [] };
  for (const pile of ["opener", "day", "night"] as const) {
    const turns = level.piles[pile];
    const cards = pool.filter(c => c.pile === pile);
    if (cards.length < turns.length) {
      throw new Error(`The ${pile} pile needs at least ${turns.length} cards, found ${cards.length}`);
    }
    // The opener is fixed (B0 on Turn 1); Day and Night piles are shuffled.
    const order = pile === "opener" ? cards : shuffle(cards, rand);
    turns.forEach((t, i) => { deck[t] = order[i].id; });
    if (pile !== "opener") reserve[pile] = order.slice(turns.length).map(c => c.id);
  }
  return { deck, reserve };
}

export interface RunInput {
  level: LevelConfig;
  cards: Card[];
  seed: number;
  specialist: Specialist;
  weather?: WeatherTurn[];          // real DONKI track; default: seeded placeholder
  weatherStart?: string;            // first day of that DONKI window
}

export function newRun(input: RunInput): { state: GameState; ctx: Ctx } {
  const { level, seed, specialist } = input;
  if (!Number.isInteger(seed) || seed < 0) throw new Error(`Seed must be a whole number ≥ 0, got ${seed}`);
  const weather = input.weather ?? placeholderWeather(seed, level.turns);
  if (weather.length !== level.turns) {
    throw new Error(`Weather track has ${weather.length} turns, the mission has ${level.turns}`);
  }
  const { deck, reserve } = dealDeck(input.cards, level, seed);
  const state: GameState = {
    turn: 0, seed, specialist,
    res: { ...level.start },
    badge: 0, stars: 0,
    pending: [], mods: [], flags: [],
    emergencies: [], usedEmergency: [],
    deck, reserve,
    rolls: makeRolls(streamSeed(seed, STREAM.rolls), level.turns),
    status: "playing",
  };
  const cards = Object.fromEntries(input.cards.map(c => [c.id, c]));
  return { state, ctx: { level, cards, weather, ...(input.weatherStart ? { weatherStart: input.weatherStart } : {}) } };
}
