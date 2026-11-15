/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Forecast odds measured from the DONKI archive (src/data/forecast-odds.json).
// scripts/build-forecast.ts writes the file; the game reads it. Until the archive has
// been downloaded, the file has no tiers and the game shows the placeholder odds.

import { hasFlares, type DonkiArchive } from "./donki";
import type { Odds } from "./types";
import { kidFraction, measureOdds, SIGN_DAYS, SIGN_RULE, TURN_DAYS } from "./weather";

export interface TierOdds { chance: number; label: string; windows: number; withStorm: number }

export interface ForecastOdds {
  _meta: { si: Record<string, unknown> };
  archive: { start: string; end: string } | null;
  rule: {
    signDays: number; turnDays: number;
    flares?: boolean;   // false: flare records weren't available, so the signs were CMEs only
    high: { flare: string; cmeSpeed: number }; medium: { flare: string; cmeSpeed: number };
  };
  tiers: Record<Odds, TierOdds> | null;
}

export const ODDS_META = {
  si: {
    generated: true,
    tool: "Claude (Anthropic)",
    how: "Numbers computed from the NASA DONKI archive by scripts/build-forecast.ts (an SI-assisted script); no number is written by hand",
    humanReviewed: false,
  },
};

/** Fewer windows than this and a tier's rate is too shaky to show as measured. */
export const MIN_WINDOWS = 60;

export function buildForecastOdds(a: DonkiArchive): ForecastOdds {
  const counts = measureOdds(a);
  const tiers = Object.fromEntries((Object.keys(counts) as Odds[]).map(k => {
    const { windows, withStorm } = counts[k];
    const chance = windows ? withStorm / windows : 0;
    return [k, { chance: Math.round(chance * 1000) / 1000, label: kidFraction(chance), windows, withStorm }];
  })) as Record<Odds, TierOdds>;
  return {
    _meta: ODDS_META,
    archive: a.range,
    rule: { signDays: SIGN_DAYS, turnDays: TURN_DAYS, flares: hasFlares(a), high: { ...SIGN_RULE.high }, medium: { ...SIGN_RULE.medium } },
    tiers,
  };
}

/** Problems a reviewer should see before trusting the odds (empty when they look sound). */
export function oddsWarnings(o: ForecastOdds): string[] {
  if (!o.tiers) return [];
  const w: string[] = [];
  const order: Odds[] = ["low", "medium", "high"];
  for (const k of order) if (o.tiers[k].windows < MIN_WINDOWS) w.push(`${k}: only ${o.tiers[k].windows} windows; the rate is shaky`);
  for (let i = 1; i < order.length; i++) {
    if (o.tiers[order[i]].label === o.tiers[order[i - 1]].label) {
      w.push(`${order[i - 1]} and ${order[i]} both say ${o.tiers[order[i]].label}, so the forecast can't tell them apart; consider changing the warning-sign rule`);
    }
    if (o.tiers[order[i]].chance < o.tiers[order[i - 1]].chance) {
      w.push(`${order[i]} (${o.tiers[order[i]].label}) is less likely than ${order[i - 1]} (${o.tiers[order[i - 1]].label}); stronger signs should mean higher odds`);
    }
  }
  return w;
}

/** Check a loaded forecast-odds.json; tiers is null until build-forecast has run. */
export function loadForecastOdds(json: unknown, file = "src/data/forecast-odds.json"): ForecastOdds {
  const o = json as ForecastOdds;
  if (!o || typeof o !== "object" || !o._meta?.si) throw new Error(`${file}: missing _meta.si`);
  if (o.tiers === null) return o;
  for (const k of ["low", "medium", "high"] as const) {
    const t = o.tiers?.[k];
    if (!t || !(t.chance >= 0 && t.chance <= 1) || !t.label || !(t.windows >= 0)) throw new Error(`${file}: bad ${k} tier`);
  }
  return o;
}
