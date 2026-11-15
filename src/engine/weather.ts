/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Real space weather for a run. The seed picks a start day in the DONKI archive; each
// turn covers the next 14 real days. A turn is a storm turn if DONKI recorded a
// near-Earth SEP event in its 14 days (at most one storm per turn). The forecast for a
// turn looks at warning signs in the 7 days before it. scripts/build-forecast.ts uses
// the same functions to measure how often a storm followed each kind of sign, so the
// odds the game shows are always ones we measured.

import type { DonkiArchive, DonkiStorm } from "./donki";
import { mulberry32, STREAM, streamSeed } from "./rng";
import type { Odds, WeatherTurn } from "./types";

export const TURN_DAYS = 14;
export const SIGN_DAYS = 7;
/** Warning signs, strongest first. A tier needs either sign within the SIGN_DAYS before the turn. */
export const SIGN_RULE = {
  high:   { flare: "X", cmeSpeed: 1000 },
  medium: { flare: "M", cmeSpeed: 500 },
} as const;

const DAY_MS = 86_400_000;
export const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
export const dayStr = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** The archive by day number, for quick window lookups. */
export interface DayIndex {
  start: number; end: number;                   // both included
  storm: Map<number, DonkiStorm>;               // first storm of each day
  flare: Map<number, "M" | "X">;                // strongest flare of each day
  cme: Map<number, number>;                     // fastest CME of each day (km/s)
}

const cache = new WeakMap<DonkiArchive, DayIndex>();

export function indexArchive(a: DonkiArchive): DayIndex {
  const hit = cache.get(a);
  if (hit) return hit;
  if (!a.range) throw new Error("The DONKI archive is empty");
  const ix: DayIndex = { start: dayNum(a.range.start), end: dayNum(a.range.end), storm: new Map(), flare: new Map(), cme: new Map() };
  for (const s of a.storms) { const d = dayNum(s.date); if (!ix.storm.has(d)) ix.storm.set(d, s); }
  for (const f of a.flares) {
    const d = dayNum(f.date), c = f.cls[0] as "M" | "X";
    if (c === "X" || !ix.flare.has(d)) ix.flare.set(d, c);
  }
  for (const c of a.cmes) { const d = dayNum(c.date); ix.cme.set(d, Math.max(ix.cme.get(d) ?? 0, c.speed)); }
  cache.set(a, ix);
  return ix;
}

/** The forecast tier from warning signs on days [from, to). */
export function signTier(ix: DayIndex, from: number, to: number): Odds {
  let best: Odds = "low";
  for (let d = from; d < to; d++) {
    const f = ix.flare.get(d), v = ix.cme.get(d) ?? 0;
    if (f === SIGN_RULE.high.flare || v >= SIGN_RULE.high.cmeSpeed) return "high";
    if (f || v >= SIGN_RULE.medium.cmeSpeed) best = "medium";
  }
  return best;
}

/** The first storm on days [from, to), if any. */
export function stormIn(ix: DayIndex, from: number, to: number): DonkiStorm | undefined {
  for (let d = from; d < to; d++) { const s = ix.storm.get(d); if (s) return s; }
  return undefined;
}

/** First and last start day a run of this many turns can use (it needs a week of signs before it). */
export function startDays(ix: DayIndex, turns: number): { first: number; last: number; count: number } {
  const first = ix.start + SIGN_DAYS, last = ix.end - turns * TURN_DAYS + 1;
  return { first, last, count: Math.max(0, last - first + 1) };
}

export interface RunWeather { start: string; weather: WeatherTurn[] }

/** The real weather for a seed: same seed, same 16 weeks, every time. */
export function archiveWeather(a: DonkiArchive, seed: number, turns: number): RunWeather {
  const ix = indexArchive(a);
  const { first, count } = startDays(ix, turns);
  if (count <= 0) throw new Error(`The DONKI archive is too short for ${turns} turns of ${TURN_DAYS} days`);
  const s = first + Math.floor(mulberry32(streamSeed(seed, STREAM.weather))() * count);
  const weather = Array.from({ length: turns }, (_, t): WeatherTurn => {
    const from = s + t * TURN_DAYS;
    const storm = stormIn(ix, from, from + TURN_DAYS);
    return {
      forecast: signTier(ix, from - SIGN_DAYS, from),
      storm: !!storm,
      ...(storm ? { date: storm.date, link: storm.link } : {}),
    };
  });
  return { start: dayStr(s), weather };
}

export interface TierCount { windows: number; withStorm: number }

/**
 * For every day in the archive that has a full week before it and 14 days after it:
 * which tier did the signs give, and did a storm come in the next 14 days? Windows
 * overlap (one per day), so the counts aren't independent; the rates are what matter.
 */
export function measureOdds(a: DonkiArchive): Record<Odds, TierCount> {
  const ix = indexArchive(a);
  const out: Record<Odds, TierCount> = { low: { windows: 0, withStorm: 0 }, medium: { windows: 0, withStorm: 0 }, high: { windows: 0, withStorm: 0 } };
  for (let d = ix.start + SIGN_DAYS; d + TURN_DAYS - 1 <= ix.end; d++) {
    const t = out[signTier(ix, d - SIGN_DAYS, d)];
    t.windows++;
    if (stormIn(ix, d, d + TURN_DAYS)) t.withStorm++;
  }
  return out;
}

/** Kid fractions the forecast may show, smallest first. */
export const KID_FRACTIONS: { label: string; chance: number }[] = [
  { label: "1 in 20", chance: 1 / 20 }, { label: "1 in 10", chance: 1 / 10 }, { label: "1 in 5", chance: 1 / 5 },
  { label: "1 in 4", chance: 1 / 4 }, { label: "1 in 3", chance: 1 / 3 }, { label: "1 in 2", chance: 1 / 2 },
  { label: "2 in 3", chance: 2 / 3 }, { label: "3 in 4", chance: 3 / 4 }, { label: "9 in 10", chance: 9 / 10 },
];

/** The nearest kid fraction; below 1 in 30 it says "less than 1 in 20" rather than round up. */
export function kidFraction(chance: number): string {
  if (chance < 1 / 30) return "less than 1 in 20";
  let best = KID_FRACTIONS[0];
  for (const k of KID_FRACTIONS) if (Math.abs(k.chance - chance) < Math.abs(best.chance - chance)) best = k;
  return best.label;
}
