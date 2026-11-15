/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Loads level and card JSON. Every data file wraps its data next to a `_meta` block
// (the SI disclosure), e.g. { "_meta": {...}, "level": {...} }, so we unwrap it here
// and check the parts the engine relies on. The card-writing (truth) rules are in
// cardRules.ts, which check-cards and data.ts run on top.

import type { Card, Effect, LevelConfig, Option, Pile, Res, Specialist, Tag } from "./types";

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
    if (e.flag !== undefined && !FLAGS.includes(e.flag)) fail(file, `${where}: unknown flag "${e.flag}"`);
    if (e.onTurns !== undefined && e.onTurns !== "day") fail(file, `${where}: onTurns can only be "day"`);
    if (e.onTurns && (e.forTurns || e.sunlight)) fail(file, `${where}: onTurns can't be combined with forTurns or sunlight`);
    for (const k of ["delta", "stars", "badge", "sunlight", "forTurns", "inTurns"] as const) {
      if (e[k] !== undefined && !Number.isInteger(e[k])) fail(file, `${where}: ${k} must be a whole number`);
    }
  }
}

/**
 * Unwrap a card file, { "_meta": ..., "cards": [...] }, and check its shape: ids, piles,
 * tags, two options, specialist names. The truth rules live in cardRules.ts.
 */
export function loadCards(json: unknown, file = "card file"): Card[] {
  const cards = (json as { cards?: Card[] })?.cards;
  if (!Array.isArray(cards)) fail(file, `expected { "_meta": ..., "cards": [...] }`);
  const ids = new Set<string>();
  for (const c of cards) {
    if (!c.id || ids.has(c.id)) fail(file, `card id "${c.id}" is missing or repeated`);
    ids.add(c.id);
    if (!PILES.includes(c.pile)) fail(file, `${c.id}: pile must be opener, day or night`);
    if (!TAGS.includes(c.tag)) fail(file, `${c.id}: tag must be crisis, dilemma or opportunity`);
    if (!c.title || !c.text) fail(file, `${c.id}: needs a title and text`);
    if (c.options?.length !== 2) fail(file, `${c.id}: needs exactly 2 options`);
    if (c.specialist && !WHO.includes(c.specialist.who)) fail(file, `${c.id}: unknown specialist "${c.specialist.who}"`);
    optionsOf(c).forEach(({ where, option }) => {
      if (!option.label) fail(file, `${c.id} ${where}: needs a label`);
      checkEffects(file, `${c.id} ${where}`, option.effects);
      if (option.gamble) checkEffects(file, `${c.id} ${where} (gamble)`, option.gamble.onFail);
    });
    if (!Array.isArray(c.sources)) fail(file, `${c.id}: sources must be a list`);
  }
  return cards;
}

/** Every option on a card with a readable name: "option A", "option B", "specialist option". */
export function optionsOf(c: Card): { where: string; option: Option }[] {
  return [
    { where: "option A", option: c.options[0] },
    { where: "option B", option: c.options[1] },
    ...(c.specialist ? [{ where: `${c.specialist.who} option`, option: c.specialist as Option }] : []),
  ];
}
