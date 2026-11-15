/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The turn function for the Moon outpost. Pure: it takes a state and returns a new
// state plus a list of events for the UI and the Phaser scene. The order of steps is
// fixed and locked by tests (rules.test.ts):
//   1. power split  2. card option  3. sunlight  4. upkeep  5. storm
//   6. delayed effects  7. warning, emergency and badge checks

import type {
  Card, Choice, Ctx, DailyPlan, Effect, GameEvent, GameState, LevelConfig, Option, Res,
} from "./types";

export const BARS: Res[] = ["power", "warmth", "food"];
export const WARNING_MAX = 2;   // a bar at 1–2 (or 0) at the start of a turn = strained

/** Per-turn scratch data passed to every step. */
interface Turn {
  t: number;              // current turn (0-based)
  last: number;           // last turn of the mission
  day: boolean;           // Lunar Day turn?
  strained: boolean;      // a bar was at 2 or below at the start of the turn
  ev: GameEvent[];
}

// ---------------------------------------------------------------------------------
// Helpers the UI, the Phaser scene and the run checker also use
// ---------------------------------------------------------------------------------

/** Opener and Day-pile turns are Lunar Day; Night-pile turns are Lunar Night. */
export function isDayTurn(level: LevelConfig, t: number): boolean {
  return level.piles.opener.includes(t) || level.piles.day.includes(t);
}

/** Warning zone: Experiments earn no Stars this turn (card Stars still count). */
export function isStrained(s: GameState): boolean {
  return BARS.some(r => s.res[r] <= WARNING_MAX);
}

/** NASA-style traffic light for the Radiation Badge. */
export function badgeColour(pips: number): "green" | "yellow" | "red" {
  return pips >= 10 ? "red" : pips >= 6 ? "yellow" : "green";
}

/** Power the arrays will add on turn t: Day sunlight plus active changes, never below 0. */
export function sunlightOn(s: GameState, level: LevelConfig, t: number): number {
  if (!isDayTurn(level, t)) return level.night.sunlight;
  const mods = s.mods.filter(m => m.from <= t && t <= m.to).reduce((n, m) => n + m.delta, 0);
  return Math.max(0, level.day.sunlight + mods);
}

/** Cells the shelter needs this run: 2, or 0 once the lava-tube cave is unlocked. */
export function shelterCost(s: GameState, level: LevelConfig): number {
  return s.flags.includes("cave") ? level.slots.shelter.cellsWithCave : level.slots.shelter.cells;
}

/** Total cells a plan takes out of the battery. */
export function planCost(s: GameState, level: LevelConfig, plan: DailyPlan): number {
  return plan.heater + plan.greenhouse + plan.experiments + (plan.shelter ? shelterCost(s, level) : 0);
}

/** Power an option takes right now (step 2). Later and repeating costs don't count. */
export function nowPowerCost(opt: Option): number {
  return opt.effects
    .filter(e => e.res === "power" && (e.delta ?? 0) < 0 && !(e.inTurns ?? 0) && !e.onTurns)
    .reduce((n, e) => n - (e.delta ?? 0), 0);
}

/** The option behind a choice, or null if it doesn't exist for this run's specialist. */
export function optionFor(card: Card, s: GameState, choice: Choice): Option | null {
  if (choice === "specialist") {
    return card.specialist && card.specialist.who === s.specialist ? card.specialist : null;
  }
  return card.options[choice] ?? null;
}

export interface ChoiceInfo {
  choice: Choice;
  option: Option;
  cost: number;           // Power it takes right now
  affordable: boolean;
  reason?: string;        // why it's locked, in kid words
}

/** The options a player sees after locking this plan, with locked ones explained. */
export function choicesFor(s: GameState, ctx: Ctx, plan: DailyPlan): ChoiceInfo[] {
  const card = ctx.cards[s.deck[s.turn]];
  const spare = s.res.power - planCost(s, ctx.level, plan);
  const all: Choice[] = [0, 1, "specialist"];
  return all.flatMap(choice => {
    const option = optionFor(card, s, choice);
    if (!option) return [];
    const cost = nowPowerCost(option);
    const affordable = cost <= spare;
    const reason = affordable ? undefined
      : `Needs ${cost} Power. You kept ${Math.max(0, spare)} spare.`;
    return [{ choice, option, cost, affordable, reason }];
  });
}

/** Why a plan isn't allowed, or null if it's fine. The UI shows this as it is. */
export function planProblem(s: GameState, ctx: Ctx, plan: DailyPlan): string | null {
  const { level } = ctx;
  const t = s.turn;
  const cells: [keyof DailyPlan, number][] = [
    ["heater", plan.heater], ["greenhouse", plan.greenhouse], ["experiments", plan.experiments],
  ];
  for (const [slot, n] of cells) {
    if (!Number.isInteger(n) || n < 0) return `${slot} needs a whole number of cells`;
  }
  if (plan.heater > level.slots.heater.max) return `The Heater takes at most ${level.slots.heater.max} cells`;
  if (plan.heater > 0 && level.slots.heater.nightOnly && isDayTurn(level, t)) {
    return "The Sun is keeping the habitat warm, so the Heater isn't needed by day";
  }
  if (plan.greenhouse > level.slots.greenhouse.max) return `The Greenhouse takes at most ${level.slots.greenhouse.max} cells`;
  if (plan.shelter && !ctx.weather[t]?.storm) return "The shelter only opens when a storm alert sounds";
  const cost = planCost(s, level, plan);
  if (cost > s.res.power) return `This plan needs ${cost} cells, but the battery has ${s.res.power}`;
  // Every card but the opener has an option with no Power cost, so this only ever
  // catches the opener, which every player knows is coming on Turn 1.
  const card = ctx.cards[s.deck[t]];
  if (card) {
    const spare = s.res.power - cost;
    const cheapest = Math.min(...choicesFor(s, ctx, plan).map(c => c.cost));
    if (cheapest > spare) return `Keep at least ${cheapest} cells for "${card.title}"`;
  }
  return null;
}

// ---------------------------------------------------------------------------------
// Applying effects
// ---------------------------------------------------------------------------------

/** Apply one effect right now. Bars are clamped to 0..max as they change. */
function apply(s: GameState, level: LevelConfig, e: Effect, T: Turn, cause: string) {
  if (e.res !== undefined && e.delta) {
    const from = s.res[e.res];
    const to = Math.min(level.max[e.res], Math.max(0, from + e.delta));
    s.res[e.res] = to;
    if (to !== from) T.ev.push({ type: "res", res: e.res, from, to, cause });
  }
  if (e.stars) {
    s.stars += e.stars;      // Stars can go below 0: a Star cost is real lost work
    T.ev.push({ type: "stars", amount: e.stars, cause });
  }
  if (e.badge && e.badge > 0) {
    s.badge += e.badge;      // radiation only goes up
    T.ev.push({ type: "badge", amount: e.badge, cause });
  }
  if (e.flag && !s.flags.includes(e.flag)) {
    s.flags.push(e.flag);
    T.ev.push({ type: "flag", flag: e.flag, cause });
  }
  if (e.sunlight) addSunMod(s, e.sunlight, T.t, e.forTurns, T, cause);
}

function addSunMod(s: GameState, delta: number, from: number, forTurns: number | undefined, T: Turn, cause: string) {
  const to = forTurns ? from + forTurns - 1 : T.last;
  s.mods.push({ delta, from, to, cause });
  T.ev.push({ type: "sunMod", delta, from, to, cause });
}

function queue(s: GameState, due: number, effect: Effect, cause: string, T: Turn) {
  if (due <= T.last) s.pending.push({ due, effect, cause, fromTurn: T.t });
}

/**
 * Apply an effect now or queue it. `inTurns` delays it; `forTurns` repeats a
 * res/stars/badge change on several turns in a row, or sets how long a sunlight change
 * lasts; `onTurns: "day"` lands it at step 6 of this turn and every Day turn left.
 */
function schedule(s: GameState, level: LevelConfig, e: Effect, cause: string, T: Turn) {
  const { inTurns = 0, forTurns, onTurns, sunlight, grows: _g, delivers: _d, ...rest } = e;
  if (sunlight) {
    const from = T.t + inTurns;
    if (inTurns === 0) addSunMod(s, sunlight, from, forTurns, T, cause);
    else queue(s, from, { sunlight, forTurns }, cause, T);
  }
  const hasRest = rest.res !== undefined || rest.stars || rest.badge || rest.flag;
  if (!hasRest) return;
  if (onTurns === "day") {
    for (let d = T.t + inTurns; d <= T.last; d++) if (isDayTurn(level, d)) queue(s, d, rest, cause, T);
    return;
  }
  for (let k = 0; k < (forTurns ?? 1); k++) {
    const due = T.t + inTurns + k;
    if (due === T.t) apply(s, level, rest, T, cause);
    else queue(s, due, rest, cause, T);
  }
}

/** Delayed effects due this turn: `sun` lands sunlight changes, `other` the rest. */
function landDue(s: GameState, level: LevelConfig, T: Turn, which: "sun" | "other") {
  const isSun = (e: Effect) => e.sunlight !== undefined;
  const due = s.pending.filter(p => p.due === T.t && (which === "sun") === isSun(p.effect));
  s.pending = s.pending.filter(p => !due.includes(p));
  for (const p of due) {
    // Effects queued earlier this same turn (onTurns: "day") aren't "delayed".
    if (p.fromTurn !== T.t) T.ev.push({ type: "delayed", cause: p.cause, fromTurn: p.fromTurn });
    if (p.effect.sunlight) addSunMod(s, p.effect.sunlight, T.t, p.effect.forTurns, T, p.cause);
    else apply(s, level, p.effect, T, p.cause);
  }
}

// ---------------------------------------------------------------------------------
// The seven steps
// ---------------------------------------------------------------------------------

/** Step 1: pay for the power split; the Greenhouse grows and Experiments run. */
function powerSplit(s: GameState, ctx: Ctx, plan: DailyPlan, T: Turn) {
  const problem = planProblem(s, ctx, plan);
  if (problem) throw new Error(problem);
  const { level } = ctx;
  const cost = planCost(s, level, plan);
  if (cost > 0) apply(s, level, { res: "power", delta: -cost }, T, "split");
  if (plan.greenhouse > 0) {
    apply(s, level, { res: "food", delta: plan.greenhouse * level.slots.greenhouse.foodPerCell }, T, "greenhouse");
  }
  const stars = Math.floor(plan.experiments / level.slots.experiments.cellsPerStar);
  if (stars > 0) {
    if (plan.shelter) T.ev.push({ type: "starsBlocked", amount: stars, why: "shelter" });
    else if (T.strained) T.ev.push({ type: "starsBlocked", amount: stars, why: "strained" });
    else apply(s, level, { stars }, T, "experiments");
  }
}

/** Step 2: the event card, revealed after the split is locked. */
function playCard(s: GameState, ctx: Ctx, choice: Choice, mode: TurnMode, T: Turn) {
  const card = ctx.cards[s.deck[T.t]];
  if (!card) throw new Error(`No card for turn ${T.t}`);
  const opt = optionFor(card, s, choice);
  if (!opt) throw new Error(`${card.id} has no "${choice}" option for the ${s.specialist}`);
  const cost = nowPowerCost(opt);
  if (cost > s.res.power) throw new Error(`${card.id}: needs ${cost} Power, only ${s.res.power} left after the split`);
  const mini = mode.miniDone ? miniFor(card, choice) : null;
  for (const e of opt.effects) {
    if (mini && (e.stars ?? 0) < 0) {
      // A mini-moment can only lower a cost: the Star loss goes, anything else in the effect stays.
      T.ev.push({ type: "mini", cardId: card.id, kind: mini, savedStars: -e.stars! });
      const { stars: _saved, ...rest } = e;
      if (Object.keys(rest).length) schedule(s, ctx.level, rest, card.id, T);
      continue;
    }
    schedule(s, ctx.level, e, card.id, T);
  }
  if (opt.gamble) {
    const roll = s.rolls[T.t];
    if (roll === undefined) throw new Error(`No roll for turn ${T.t}`);
    const failed = mode.gambles === "fail" || roll < opt.gamble.chance;
    T.ev.push({ type: "gamble", cardId: card.id, failed });
    if (failed) for (const e of opt.gamble.onFail) schedule(s, ctx.level, e, card.id, T);
  }
}

/** Step 4: the crew eats, the habitat warms or cools, and the radiation drip lands. */
function upkeep(s: GameState, level: LevelConfig, plan: DailyPlan, T: Turn) {
  for (const e of level.upkeep) apply(s, level, e, T, "upkeep");
  if (T.day) {
    apply(s, level, { res: "warmth", delta: level.day.warmth }, T, "sunWarmth");
  } else {
    const insulated = s.flags.includes("buried") || s.flags.includes("sandbagged");
    const loss = insulated ? level.night.warmthInsulated : level.night.warmth;   // e.g. −2 or −1
    // Each Heater cell cancels 1 of the loss; heaters never push Warmth up.
    const net = Math.min(0, loss + Math.min(plan.heater, -loss));
    if (net) apply(s, level, { res: "warmth", delta: net }, T, "nightCold");
  }
  const shielded = s.flags.includes("buried") && T.day;   // buried: drip only on Night turns
  if (!shielded) apply(s, level, { badge: level.radiation.drip }, T, "drip");
}

/** Step 5: a storm adds its pips, fewer if the crew sheltered. */
function spaceWeather(s: GameState, ctx: Ctx, plan: DailyPlan, T: Turn) {
  const w = ctx.weather[T.t];
  if (!w?.storm) return;
  const { radiation } = ctx.level;
  const pips = plan.shelter ? radiation.stormSheltered : radiation.stormOpen;
  T.ev.push({ type: "storm", sheltered: plan.shelter, pips, date: w.date });
  apply(s, ctx.level, { badge: pips }, T, "storm");
}

/** Step 7: warning zone, emergency turn and the Radiation Badge limit. */
function checkLimits(s: GameState, level: LevelConfig, T: Turn) {
  const lose = (why: Res | "badge") => {
    if (s.status === "playing") { s.status = "lost"; s.lostBy = why; }
  };
  for (const r of BARS) {
    const v = s.res[r];
    if (v === 0) {
      if (s.emergencies.includes(r)) lose(r);          // still 0 after its emergency turn
      else if (s.usedEmergency.includes(r)) lose(r);   // hit 0 a second time
      else if (T.t === T.last) lose(r);                // no turn left to recover
      else {
        s.emergencies.push(r); s.usedEmergency.push(r);
        T.ev.push({ type: "emergency", res: r });
      }
    } else {
      if (s.emergencies.includes(r)) {
        s.emergencies = s.emergencies.filter(x => x !== r);
        T.ev.push({ type: "recovered", res: r });
      }
      if (v <= WARNING_MAX) T.ev.push({ type: "warning", res: r });
    }
  }
  if (s.badge >= level.radiation.limit) lose("badge");  // no emergency turn for a dose
}

/**
 * A fast copy of a state for resolveTurn (structuredClone is several times slower,
 * and the run checker copies states hundreds of thousands of times). Effects, cards
 * and rolls are never changed in place, so they can be shared.
 */
export function cloneState(s: GameState): GameState {
  return {
    ...s,
    res: { ...s.res },
    pending: s.pending.slice(), mods: s.mods.slice(), flags: s.flags.slice(),
    emergencies: s.emergencies.slice(), usedEmergency: s.usedEmergency.slice(),
    deck: s.deck.slice(), reserve: { day: s.reserve.day.slice(), night: s.reserve.night.slice() },
  };
}

/**
 * `miniDone`: the player did well in the card's mini-moment (Spec: dust on D2, the leak
 * detector on N3), so that option's Star cost is dropped. The run checker never sets it,
 * so it treats every mini-moment as failed: skill helps but is never needed to win.
 */
export interface TurnMode { gambles: "roll" | "fail"; miniDone?: boolean }

/** The mini-moment this choice opens, if any: only the hands-on option 0 of a "mini" card, and only when it costs a Star. */
export function miniFor(card: Card, choice: Choice): "dust" | "leak" | null {
  if (!card.mini || choice !== 0) return null;
  return card.options[0].effects.some(e => (e.stars ?? 0) < 0) ? card.mini : null;
}

/**
 * Play one turn. `plan` is the power split (locked before the card is shown) and
 * `choice` is the card option picked after the reveal.
 */
export function resolveTurn(
  s0: GameState, ctx: Ctx, plan: DailyPlan, choice: Choice,
  mode: TurnMode = { gambles: "roll" },
): { state: GameState; events: GameEvent[] } {
  if (s0.status !== "playing") throw new Error("This run is already over");
  const s = cloneState(s0);
  const level = ctx.level;
  const t = s.turn;
  const T: Turn = { t, last: level.turns - 1, day: isDayTurn(level, t), strained: isStrained(s0), ev: [] };

  powerSplit(s, ctx, plan, T);                         // 1. power split
  playCard(s, ctx, choice, mode, T);                   // 2. event card
  landDue(s, level, T, "sun");                         // 3. sunlight changes due today,
  const sun = sunlightOn(s, level, t);                 //    then sunlight (the only Power source)
  if (sun > 0) apply(s, level, { res: "power", delta: sun }, T, "sunlight");
  upkeep(s, level, plan, T);                           // 4. upkeep
  spaceWeather(s, ctx, plan, T);                       // 5. space weather
  landDue(s, level, T, "other");                       // 6. delayed effects
  checkLimits(s, level, T);                            // 7. checks

  s.mods = s.mods.filter(m => m.to > t);               // drop finished sunlight changes
  s.turn += 1;
  if (s.status === "playing" && t === T.last) {
    const won = s.stars >= level.starTarget;
    s.status = won ? "won" : "lost";
    if (!won) s.lostBy = "stars";
  }
  if (s.status !== "playing") {
    s.pending = [];
    T.ev.push({ type: "end", status: s.status, lostBy: s.lostBy });
  }
  return { state: s, events: T.ev };
}
