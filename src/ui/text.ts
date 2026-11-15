/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Every piece of gameplay text comes from here: card costs, the turn report and the
// debrief. Buttons, reports and the debrief all describe the same effect objects the
// engine applies, so what a kid reads always matches what happens.

import { kidOdds } from "../engine/cardRules";
import { oddsInfo } from "../engine/data";
import { badgeColour, isDayTurn } from "../engine/rules";
import type {
  Card, Choice, Ctx, DailyPlan, Effect, Flag, GameEvent, GameState, LostBy, Odds, Option, Res, Specialist,
} from "../engine/types";

export const RES_LABEL: Record<Res, string> = { power: "Power", warmth: "Warmth", food: "Food" };

export const CREW: Record<Specialist, { name: string; role: string; helps: string }> = {
  engineer: { name: "Kai", role: "Engineer", helps: "Fixes hardware from inside, so fewer trips outside" },
  botanist: { name: "Mei", role: "Botanist", helps: "Gets more food out of the greenhouse" },
  doctor:   { name: "Sol", role: "Doctor", helps: "Keeps the crew healthy, rested and safe on moonwalks" },
};
export const COMMANDER = "Commander Ana";

const FLAG_TEXT: Record<Flag, string> = {
  buried: "habitat buried: radiation only at night, and nights lose 1 less Warmth",
  sandbagged: "sleeping area sandbagged: nights lose 1 less Warmth",
  cave: "cave found: sheltering from storms costs no Power",
};

const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
const plural = (n: number, one: string, many = `${one}s`) => (Math.abs(n) === 1 ? one : many);

/** When an effect lands, in words: "", " next turn", " in 2 turns", " every Day left"… */
function when(e: Effect): string {
  if (e.onTurns === "day") return " every Day left";
  const delay = e.inTurns ?? 0;
  const start = delay === 1 ? " next turn" : delay > 1 ? ` in ${delay} turns` : "";
  if (e.forTurns && e.forTurns > 1 && !e.sunlight) {
    return delay === 0 && e.forTurns === 2 ? " this turn and next" : `${start} for ${e.forTurns} turns`;
  }
  return start;
}

/** { res: "food", delta: 2, inTurns: 2 } → "Food +2 in 2 turns". */
export function describeEffect(e: Effect): string {
  const parts: string[] = [];
  if (e.res && e.delta) parts.push(`${RES_LABEL[e.res]} ${signed(e.delta)}`);
  if (e.stars) parts.push(`${signed(e.stars)} ${plural(e.stars, "Star")}`);
  if (e.badge) parts.push(`+${e.badge} ${plural(e.badge, "pip")}`);
  if (e.sunlight) parts.push(`sunlight ${signed(e.sunlight)} every Day${e.forTurns ? ` for ${e.forTurns} turns` : ""}`);
  if (e.flag) parts.push(FLAG_TEXT[e.flag]);
  return parts.join(", ") + (e.sunlight ? "" : when(e));
}

/** A whole option as one line: "Power −2, +1 Star · 1 in 3 chance: Food −2 next turn". */
export function describeOption(o: Option): string {
  if (o.forgoesReward && !o.effects.length) return "No cost, but no reward";
  const main = o.effects.map(describeEffect).filter(Boolean).join(", ");
  const risk = o.gamble
    ? `${kidOdds(o.gamble.chance) ?? `${Math.round(o.gamble.chance * 100)}%`} chance: ${o.gamble.onFail.map(describeEffect).join(", ")}`
    : "";
  return [main || (o.gamble ? "Nothing now" : ""), risk].filter(Boolean).join(" · ");
}

/** "1 in 3 chance of a radiation storm next turn" (measured from DONKI once the archive is in). */
export function forecastText(odds: Odds): string {
  return `${oddsInfo(odds).label} chance of a radiation storm next turn`;
}

/** The Spec's storm nudge shows when the forecast says 1 in 3 or higher. */
export const worthSheltering = (odds: Odds | null) => odds !== null && oddsInfo(odds).chance >= 1 / 3 - 1e-9;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-01-18" → "18 January 2026" (no locale needed, so it reads the same everywhere). */
export function formatDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "This storm really happened on 18 January 2026." */
export const realStormLine = (day: string) => `This storm really happened on ${formatDate(day)}.`;

/** The forecast shown in the briefing on turn t is for turn t + 1. */
export function nextForecast(ctx: Ctx, t: number): Odds | null {
  return t + 1 < ctx.level.turns ? ctx.weather[t + 1].forecast : null;
}

export const turnLabel = (ctx: Ctx, t: number) => `Turn ${t + 1}: Lunar ${isDayTurn(ctx.level, t) ? "Day" : "Night"}`;

export function badgeText(pips: number): string {
  const c = badgeColour(pips);
  return c === "green" ? "Safe" : c === "yellow" ? "Limit outside work" : "Danger: almost full";
}

/** Who or what caused a change, in words. */
export function causeLabel(cause: string, ctx: Ctx): string {
  const card = ctx.cards[cause];
  if (card) return card.title;
  return ({
    split: "your power split", greenhouse: "the greenhouse", experiments: "experiments",
    sunlight: "sunlight", upkeep: "the crew eating", sunWarmth: "the Sun", nightCold: "the cold night",
    drip: "everyday cosmic rays", storm: "a solar storm",
  } as Record<string, string>)[cause] ?? cause;
}

// -----------------------------------------------------------------------------------
// The turn report
// -----------------------------------------------------------------------------------

export interface TurnRecord {
  turn: number;
  cardId: string;
  plan: DailyPlan;
  choice: Choice;
  events: GameEvent[];
  after: GameState;
  /** Options that were greyed out after the split, and why. */
  locked: { choice: Choice; label: string; cost: number; spare: number }[];
}

/** Short lines describing what happened this turn, in the order it happened. */
export function reportLines(rec: TurnRecord, ctx: Ctx): string[] {
  const lines: string[] = [];
  const delayed = new Map<string, number>();       // cause → turn it came from
  const card = ctx.cards[rec.cardId];
  const cardBits: string[] = [];
  const flushCard = () => {
    if (cardBits.length) lines.push(`${card.title}: ${cardBits.join(", ")}.`);
    cardBits.length = 0;
  };
  let heaterWorked = !isDayTurn(ctx.level, rec.turn) && rec.plan.heater > 0;

  for (const e of rec.events) {
    const fromCard = "cause" in e && e.cause === rec.cardId && !delayed.has(e.cause);
    if (fromCard) {
      if (e.type === "res") cardBits.push(`${RES_LABEL[e.res]} ${signed(e.to - e.from)}`);
      else if (e.type === "stars") cardBits.push(`${signed(e.amount)} ${plural(e.amount, "Star")}`);
      else if (e.type === "badge") cardBits.push(`+${e.amount} ${plural(e.amount, "pip")}`);
      else if (e.type === "flag") cardBits.push(FLAG_TEXT[e.flag]);
      else if (e.type === "sunMod") cardBits.push(`sunlight ${signed(e.delta)} every Day from now on`);
      continue;
    }
    flushCard();
    switch (e.type) {
      case "gamble":
        lines.push(e.failed ? `Bad luck: the risk on "${card.title}" came true.` : `Lucky! The risk on "${card.title}" didn't happen.`);
        break;
      case "delayed":
        delayed.set(e.cause, e.fromTurn);
        break;
      case "starsBlocked":
        lines.push(e.why === "shelter"
          ? "No Stars from experiments: the crew was in the storm shelter."
          : "No Stars from experiments: the crew is strained because a bar was low.");
        break;
      case "storm":
        lines.push((e.sheltered
          ? `A solar storm hit! The crew sheltered: +${e.pips} ${plural(e.pips, "pip")}.`
          : `A solar storm hit while the crew kept working: +${e.pips} pips.`) + (e.date ? ` ${realStormLine(e.date)}` : ""));
        break;
      case "warning":
        lines.push(`${RES_LABEL[e.res]} is low (${rec.after.res[e.res]}). Experiments won't earn Stars while a bar is at 2 or below.`);
        break;
      case "emergency":
        lines.push(`Emergency! ${RES_LABEL[e.res]} hit 0. Get it above 0 by the end of next turn.`);
        break;
      case "recovered":
        lines.push(`${RES_LABEL[e.res]} is back above 0. Phew!`);
        break;
      case "res": case "stars": case "badge": case "flag": case "sunMod": {
        const from = delayed.get(e.cause);
        const prefix = from !== undefined ? `From Turn ${from + 1} (${causeLabel(e.cause, ctx)}): ` : "";
        lines.push(prefix + plainEvent(e, ctx));
        if (e.type === "res" && e.cause === "nightCold") heaterWorked = false;
        break;
      }
      case "end":
        break;
    }
  }
  flushCard();
  if (heaterWorked) lines.push("The heaters kept the habitat warm through the night.");
  return lines.filter(Boolean);
}

function plainEvent(e: GameEvent, ctx: Ctx): string {
  if (e.type === "res") {
    const d = e.to - e.from;
    switch (e.cause) {
      case "split": return `You used ${-d} ${plural(d, "cell")} of Power.`;
      case "greenhouse": return `The greenhouse grew ${d} Food.`;
      case "sunlight": return `Sunlight charged the batteries: Power +${d}.`;
      case "upkeep": return `The crew ate ${-d} Food.`;
      case "sunWarmth": return `The Sun warmed the habitat: Warmth +${d}.`;
      case "nightCold": return `The cold night took ${-d} Warmth.`;
      default: return `${causeLabel(e.cause, ctx)}: ${RES_LABEL[e.res]} ${signed(d)}.`;
    }
  }
  if (e.type === "stars") return e.cause === "experiments"
    ? `Experiments earned ${signed(e.amount)} ${plural(e.amount, "Star")}.`
    : `${causeLabel(e.cause, ctx)}: ${signed(e.amount)} ${plural(e.amount, "Star")}.`;
  if (e.type === "badge") return e.cause === "drip"
    ? `Everyday cosmic rays: +${e.amount} ${plural(e.amount, "pip")}.`
    : e.cause === "storm" ? "" : `${causeLabel(e.cause, ctx)}: +${e.amount} ${plural(e.amount, "pip")}.`;
  if (e.type === "flag") return `New: ${FLAG_TEXT[e.flag]}.`;
  if (e.type === "sunMod") return `Sunlight ${signed(e.delta)} every Day from now on.`;
  return "";
}

// -----------------------------------------------------------------------------------
// The debrief
// -----------------------------------------------------------------------------------

export interface Debrief {
  headline: string;
  summary: string;
  chain: string[];          // cause-and-effect lines, oldest first
  keyCard: Card | null;     // the card most to blame (or most to thank)
  hint: string | null;      // a locked-option hint, if any option was locked
}

export function buildDebrief(history: TurnRecord[], ctx: Ctx): Debrief {
  const last = history[history.length - 1];
  const s = last.after;
  const target = ctx.level.starTarget;
  const lostBy: LostBy | undefined = s.lostBy;
  const all = history.flatMap(r => r.events.map(e => ({ e, turn: r.turn })));

  const locked = history.find(r => r.locked.length);
  const hint = locked
    ? `If you'd kept ${locked.locked[0].cost} ${plural(locked.locked[0].cost, "cell")} spare on Turn ${locked.turn + 1}, you could have picked "${locked.locked[0].label}".`
    : null;

  if (s.status === "won") {
    const fromCards = new Map<string, number>();
    for (const { e } of all) if (e.type === "stars" && ctx.cards[e.cause]) fromCards.set(e.cause, (fromCards.get(e.cause) ?? 0) + e.amount);
    const best = [...fromCards].sort((a, b) => b[1] - a[1])[0];
    const science = all.reduce((n, { e }) => n + (e.type === "stars" && e.cause === "experiments" ? e.amount : 0), 0);
    return {
      headline: "Mission complete!",
      summary: `${s.stars} of ${target} Stars, with ${s.badge} of ${ctx.level.radiation.limit} pips on the badge.`,
      chain: [
        `Experiments earned ${science} ${plural(science, "Star")}.`,
        ...(best ? [`Your best card: "${ctx.cards[best[0]].title}" (${signed(best[1])} ${plural(best[1], "Star")}).`] : []),
        `Lowest bar at the end: ${lowestBar(s)}.`,
      ],
      keyCard: best ? ctx.cards[best[0]] : null,
      hint,
    };
  }

  if (lostBy === "badge") {
    const by = new Map<string, number>();
    for (const { e } of all) if (e.type === "badge") by.set(e.cause, (by.get(e.cause) ?? 0) + e.amount);
    const chain = [...by].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${capital(causeLabel(c, ctx))}: +${n} ${plural(n, "pip")}.`);
    const storms = all.filter(({ e }) => e.type === "storm" && !e.sheltered).map(({ turn }) => turn + 1);
    if (storms.length) chain.push(`You kept working through the storm on Turn ${storms.join(" and ")}.`);
    const cardCause = [...by].filter(([c]) => ctx.cards[c]).sort((a, b) => b[1] - a[1])[0];
    return {
      headline: "Your badge filled up",
      summary: `The crew is going home early on Turn ${last.turn + 1}. That's a real rule: astronauts who reach their limit stop flying.`,
      chain, keyCard: cardCause ? ctx.cards[cardCause[0]] : null, hint,
    };
  }

  if (lostBy === "stars") {
    const lost = all.filter(({ e }) => e.type === "stars" && e.amount < 0);
    const blocked = all.filter(({ e }) => e.type === "starsBlocked");
    const chain = [
      ...lost.map(({ e, turn }) => `Turn ${turn + 1}: ${causeLabel((e as { cause: string }).cause, ctx)} cost ${signed((e as { amount: number }).amount)} ${plural((e as { amount: number }).amount, "Star")}.`),
      ...blocked.map(({ e, turn }) => `Turn ${turn + 1}: experiments earned nothing (${(e as { why: string }).why === "shelter" ? "sheltering" : "crew strained"}).`),
    ];
    const worst = lost.map(({ e }) => (e as { cause: string }).cause).find(c => ctx.cards[c]);
    return {
      headline: "Everyone's safe, but the science didn't get done",
      summary: `${s.stars} of ${target} Stars by the end of Turn ${ctx.level.turns}.`,
      chain: chain.length ? chain : ["Try putting more spare cells into Experiments: every 2 cells earn a Star."],
      keyCard: worst ? ctx.cards[worst] : null, hint,
    };
  }

  // Lost a bar.
  const res = lostBy as Res;
  const drops = all.filter(({ e }) => e.type === "res" && e.res === res && e.to < e.from) as { e: Extract<GameEvent, { type: "res" }>; turn: number }[];
  const chain = drops.slice(-6).map(({ e, turn }) => `Turn ${turn + 1}: ${causeLabel(e.cause, ctx)} took ${RES_LABEL[res]} ${signed(e.to - e.from)}.`);
  // The card that drained the most of this bar (the latest one if two drained the same).
  const byCard = new Map<string, { total: number; last: number }>();
  for (const { e, turn } of drops) {
    if (!ctx.cards[e.cause]) continue;
    const prev = byCard.get(e.cause) ?? { total: 0, last: 0 };
    byCard.set(e.cause, { total: prev.total + (e.from - e.to), last: turn });
  }
  const worst = [...byCard].sort((a, b) => b[1].total - a[1].total || b[1].last - a[1].last)[0];
  const advice: Record<Res, string> = {
    power: "Power only comes from the Sun, so saving it by day is the only way to have more at night.",
    warmth: "Lunar nights last two weeks. Heater cells and burying the habitat keep the cold out.",
    food: "Nobody's bringing groceries. Keep a cell in the greenhouse most turns.",
  };
  return {
    headline: `Mission over: ${RES_LABEL[res]} ran out`,
    summary: `${RES_LABEL[res]} stayed at 0 on Turn ${last.turn + 1}. ${advice[res]}`,
    chain, keyCard: worst ? ctx.cards[worst[0]] : null, hint,
  };
}

function lowestBar(s: GameState): string {
  const [r, v] = (Object.entries(s.res) as [Res, number][]).sort((a, b) => a[1] - b[1])[0];
  return `${RES_LABEL[r]} ${v}`;
}
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
