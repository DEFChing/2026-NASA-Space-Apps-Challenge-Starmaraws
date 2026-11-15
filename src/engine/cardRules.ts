/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The card-writing (truth) rules from the Game Design Spec v2, as code. check-cards
// (CI), data.ts (when the game loads) and the tests all run these same checks.

import { optionsOf } from "./content";
import { nowPowerCost } from "./rules";
import type { Card, Effect, Option, Pile } from "./types";

/** Gamble odds a kid can read: 1 in 2, 1 in 3, 1 in 4, 1 in 5, 1 in 10. */
const KID_DENOMINATORS = [2, 3, 4, 5, 10];

/** "1 in 3" for a chance of about 0.333, or null if it isn't a kid fraction. */
export function kidOdds(chance: number): string | null {
  const n = KID_DENOMINATORS.find(d => Math.abs(chance - 1 / d) < 0.001);
  return n ? `1 in ${n}` : null;
}

/** Does this effect cost the player something? */
function costs(e: Effect): boolean {
  return (e.delta ?? 0) < 0 || (e.stars ?? 0) < 0 || (e.badge ?? 0) > 0 || (e.sunlight ?? 0) < 0;
}

/** Rule 2: a resource, a Star, a pip, a cost later, a gamble that can go wrong, or a reward given up. */
export function hasCost(o: Option): boolean {
  return o.effects.some(costs) || (o.gamble?.onFail.some(costs) ?? false) || o.forgoesReward === true;
}

/** Net change per thing an option touches, over all the turns it lasts. */
function netOf(o: Option): Map<string, number> {
  const net = new Map<string, number>();
  const add = (k: string, v: number) => net.set(k, (net.get(k) ?? 0) + v);
  for (const e of o.effects) {
    const times = e.forTurns && !e.sunlight ? e.forTurns : 1;
    if (e.res && e.delta) add(e.res, e.delta * times);
    if (e.stars) add("stars", e.stars * times);
    if (e.badge) add("badge", e.badge * times);
    if (e.sunlight) add("sunlight", e.sunlight);
  }
  for (const [k, v] of net) if (v === 0) net.delete(k);
  return net;
}

/** Rule 3: "−Power +X vs. +Power −X" — same things, every sign flipped. */
export function isMirror(a: Option, b: Option): boolean {
  const na = netOf(a), nb = netOf(b);
  if (na.size < 2 || na.size !== nb.size || a.gamble || b.gamble) return false;
  return [...na].every(([k, v]) => nb.get(k) === -v);
}

export interface CheckOptions {
  /** Expected cards per pile; null skips the count check (for small test sets). */
  piles?: Record<Pile, number> | null;
}

/** Check cards against the truth rules. Returns one line per problem; empty means OK. */
export function checkCards(cards: Card[], opts: CheckOptions = {}): string[] {
  const problems: string[] = [];
  const say = (msg: string) => problems.push(msg);

  for (const c of cards) {
    for (const { where, option: o } of optionsOf(c)) {
      const at = `${c.id} ${where}`;
      // Rule 1: nothing from nothing.
      for (const e of [...o.effects, ...(o.gamble?.onFail ?? [])]) {
        if (e.res === "power" && (e.delta ?? 0) > 0) say(`${at}: adds Power, but Power only comes from sunlight`);
        if (e.res === "warmth" && (e.delta ?? 0) > 0) say(`${at}: adds Warmth, but Warmth only comes from sunlight`);
        if ((e.sunlight ?? 0) > 0) say(`${at}: adds sunlight, but cards can't make the Sun brighter`);
        if (e.res === "food" && (e.delta ?? 0) > 0 && !e.grows && !e.delivers) {
          say(`${at}: adds Food without "grows" or "delivers" (Food only comes from growing it or a delivery)`);
        }
        if ((e.badge ?? 0) < 0) say(`${at}: removes pips, but radiation only goes up`);
      }
      // Rule 2: no free option.
      if (!hasCost(o)) say(`${at}: costs nothing (add a cost, or mark it forgoesReward)`);
      if (o.forgoesReward && (o.effects.length || o.gamble)) {
        say(`${at}: forgoesReward means its only cost is the reward given up, so it can't have effects`);
      }
      // Rule 5: honest odds.
      if (o.gamble) {
        const { chance, onFail } = o.gamble;
        if (!(chance > 0 && chance < 1)) say(`${at}: gamble chance must be between 0 and 1`);
        else if (!kidOdds(chance)) say(`${at}: gamble chance ${chance} isn't a kid fraction (1 in 2, 1 in 3, 1 in 4…)`);
        if (!onFail.length) say(`${at}: a gamble needs something to go wrong`);
      }
    }
    // Rule 3: no mirror options.
    if (isMirror(c.options[0], c.options[1])) say(`${c.id}: options A and B are mirror images`);
    if (JSON.stringify(c.options[0]) === JSON.stringify({ ...c.options[1], label: c.options[0].label })) {
      say(`${c.id}: options A and B are the same`);
    }
    // Rule 6: always answerable, even with an empty battery.
    if (c.pile !== "opener" && !c.options.some(o => nowPowerCost(o) === 0)) {
      say(`${c.id}: needs an option with no Power cost right now (rule 6)`);
    }
    // Rule 4: grounded.
    if (!c.realBasis?.trim()) say(`${c.id}: needs a one-line realBasis for the debrief`);
    if (!c.sources?.length) say(`${c.id}: needs at least one source`);
    for (const src of c.sources ?? []) {
      if (!src.label || !/^https:\/\/\S+$/.test(src.url ?? "")) say(`${c.id}: source "${src.label}" needs a label and an https:// link`);
    }
  }

  // Deck shape.
  const piles = opts.piles === undefined ? { opener: 1, day: 8, night: 9 } : opts.piles;
  if (piles) {
    for (const p of Object.keys(piles) as Pile[]) {
      const n = cards.filter(c => c.pile === p).length;
      if (n !== piles[p]) say(`the ${p} pile has ${n} cards, expected ${piles[p]}`);
    }
  }
  return problems;
}
