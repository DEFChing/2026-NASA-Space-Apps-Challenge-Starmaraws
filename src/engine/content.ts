/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Loads level and card JSON. Every data file wraps its data next to a `_meta` block
// (the SI disclosure), e.g. { "_meta": {...}, "level": {...} }, so we unwrap it here
// and check the parts the engine relies on. Step 2's check-cards adds the full
// card-writing rules on top.

import { nowPowerCost } from "./rules";
import type { Card, Effect, LevelConfig, Pile, Res, Specialist, Tag } from "./types";

const RES: Res[] = ["power", "warmth", "food"];
const PILES: Pile[] = ["opener", "day", "night"];
const TAGS: Tag[] = ["crisis", "dilemma", "opportunity"];
const WHO: Specialist[] = ["engineer", "botanist", "doctor"];
const FLAGS = ["buried", "sandbagged", "cave"];

function fail(file: string, msg: string): never {
  throw new Error(`${file}: ${msg}`);
}

const isInt = (n: unknown): n is number => Number.isInteger(n);

/** Unwrap and check a level file. */
export function loadLevel(json: unknown, file = "level file"): LevelConfig {
  const level = (json as { level?: LevelConfig })?.level;
  if (!level) fail(file, `expected { "_meta": ..., "level": {...} }`);
  if (level.id !== "moon") fail(file, `id must be "moon"`);
  if (!isInt(level.turns) || level.turns < 1) fail(file, "turns must be a whole number above 0");
  if (!isInt(level.starTarget)) fail(file, "starTarget must be a whole number");
  for (const r of RES) {
    if (!isInt(level.start?.[r])) fail(file, `start is missing "${r}"`);
    if (!isInt(level.max?.[r])) fail(file, `max is missing "${r}"`);
    if (level.start[r] < 1 || level.start[r] > level.max[r]) fail(file, `start.${r} must be 1..max`);
  }
  if (!level.day || !level.night) fail(file, "needs day and night blocks");
  if (level.night.warmth > 0 || level.night.warmthInsulated > 0) fail(file, "night warmth must be 0 or below");
  if (level.night.warmthInsulated < level.night.warmth) fail(file, "insulation can't make nights colder");
  for (const e of level.upkeep ?? []) {
    if (e.res && !RES.includes(e.res)) fail(file, `upkeep uses unknown bar "${e.res}"`);
  }
  const { slots, radiation } = level;
  if (!slots?.heater || !slots.greenhouse || !slots.experiments || !slots.shelter) {
    fail(file, "slots needs heater, greenhouse, experiments and shelter");
  }
  if (!(slots.experiments.cellsPerStar >= 1)) fail(file, "experiments.cellsPerStar must be 1 or more");
  if (!radiation || !(radiation.limit > 0)) fail(file, "radiation.limit must be above 0");
  // Every turn belongs to exactly one pile; the opener is Turn 1.
  const seen = new Map<number, Pile>();
  for (const p of PILES) {
    for (const t of level.piles?.[p] ?? []) {
      if (!isInt(t) || t < 0 || t >= level.turns) fail(file, `piles.${p} has turn ${t}, outside 0..${level.turns - 1}`);
      if (seen.has(t)) fail(file, `turn ${t} is in both ${seen.get(t)} and ${p}`);
      seen.set(t, p);
    }
  }
  if (seen.size !== level.turns) fail(file, `piles must cover all ${level.turns} turns`);
  return level;
}

function checkEffects(file: string, where: string, effects: Effect[]) {
  if (!Array.isArray(effects)) fail(file, `${where}: effects must be a list`);
  for (const e of effects) {
    if (e.res !== undefined && !RES.includes(e.res)) fail(file, `${where}: unknown bar "${e.res}"`);
    if (e.badge !== undefined && e.badge < 0) fail(file, `${where}: radiation only goes up`);
    if (e.flag !== undefined && !FLAGS.includes(e.flag)) fail(file, `${where}: unknown flag "${e.flag}"`);
    if (e.repeat && (e.forTurns || e.sunlight)) fail(file, `${where}: repeat can't be combined with forTurns or sunlight`);
    if (e.res === "power" && (e.delta ?? 0) > 0) fail(file, `${where}: Power only comes from sunlight`);
    if (e.res === "warmth" && (e.delta ?? 0) > 0) fail(file, `${where}: Warmth only comes from sunlight`);
    if ((e.sunlight ?? 0) > 0) fail(file, `${where}: cards can't add sunlight`);
  }
}

/** Unwrap and check a card file: { "_meta": ..., "cards": [...] }. */
export function loadCards(json: unknown, file = "card file"): Card[] {
  const cards = (json as { cards?: Card[] })?.cards;
  if (!Array.isArray(cards)) fail(file, `expected { "_meta": ..., "cards": [...] }`);
  const ids = new Set<string>();
  for (const c of cards) {
    if (!c.id || ids.has(c.id)) fail(file, `card id "${c.id}" is missing or repeated`);
    ids.add(c.id);
    if (!PILES.includes(c.pile)) fail(file, `${c.id}: pile must be opener, day or night`);
    if (!TAGS.includes(c.tag)) fail(file, `${c.id}: tag must be crisis, dilemma or opportunity`);
    if (c.options?.length !== 2) fail(file, `${c.id}: needs exactly 2 options`);
    const all = [...c.options, ...(c.specialist ? [c.specialist] : [])];
    all.forEach((o, i) => {
      const where = `${c.id} option ${i === 2 ? "specialist" : i === 0 ? "A" : "B"}`;
      checkEffects(file, where, o.effects);
      if (o.gamble) {
        if (!(o.gamble.chance > 0 && o.gamble.chance < 1)) fail(file, `${where}: gamble chance must be between 0 and 1`);
        checkEffects(file, `${where} (gamble)`, o.gamble.onFail);
      }
    });
    if (c.specialist && !WHO.includes(c.specialist.who)) fail(file, `${c.id}: unknown specialist "${c.specialist.who}"`);
    // Card-writing rule 6: always answerable, even with an empty battery.
    if (c.pile !== "opener" && !c.options.some(o => nowPowerCost(o) === 0)) {
      fail(file, `${c.id}: needs an option with no Power cost right now (rule 6)`);
    }
    if (!Array.isArray(c.sources) || !c.sources.length) fail(file, `${c.id}: needs at least one source`);
  }
  return cards;
}
