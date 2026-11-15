/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The run checker. Before Turn 1 it proves a run can be won, and measures how
// forgiving it is. It reuses resolveTurn with every gamble failing, so luck can help a
// kid but never decides whether a run is winnable.
//
// - isWinnable: a depth-first search that tries the most promising choices first and
//   stops at the first win. States that another explored state beats on every bar are
//   skipped (more Power, Warmth, Food or Stars, or fewer pips, is never worse).
// - winShare: the share of random players who win: each turn they pick a random legal
//   power split, then a random option they can pay for. It measures how much room the
//   run leaves for mistakes, and sets the difficulty tier.

import { mulberry32 } from "./rng";
import { choicesFor, isDayTurn, planProblem, resolveTurn } from "./rules";
import type { Choice, Ctx, DailyPlan, GameState, Specialist } from "./types";

export interface Move { plan: DailyPlan; choice: Choice }

/** Every power split allowed this turn. Experiments go in pairs: an odd cell earns nothing. */
export function legalSplits(s: GameState, ctx: Ctx): DailyPlan[] {
  const { level } = ctx;
  const day = isDayTurn(level, s.turn);
  const storm = ctx.weather[s.turn]?.storm ?? false;
  const step = level.slots.experiments.cellsPerStar;
  const out: DailyPlan[] = [];
  for (const shelter of storm ? [false, true] : [false]) {
    for (let heater = 0; heater <= (day && level.slots.heater.nightOnly ? 0 : level.slots.heater.max); heater++) {
      for (let greenhouse = 0; greenhouse <= level.slots.greenhouse.max; greenhouse++) {
        for (let experiments = 0; experiments <= s.res.power; experiments += step) {
          const plan = { heater, greenhouse, experiments, shelter };
          if (!planProblem(s, ctx, plan)) out.push(plan);
        }
      }
    }
  }
  return out;
}

/** Every split with every option the battery can still pay for after it. */
export function legalMoves(s: GameState, ctx: Ctx): Move[] {
  return legalSplits(s, ctx).flatMap(plan =>
    choicesFor(s, ctx, plan).filter(c => c.affordable).map(c => ({ plan, choice: c.choice })));
}

/** Everything about a state except its bars, badge and Stars (labels like causes are left out). */
function shapeOf(s: GameState): string {
  return JSON.stringify([
    s.turn,
    s.pending.map(p => [p.due, p.effect]),
    s.mods.map(m => [m.delta, m.from, m.to]),
    s.flags, s.emergencies, s.usedEmergency,
  ]);
}
const valuesOf = (s: GameState) => [s.res.power, s.res.warmth, s.res.food, -s.badge, s.stars];
const beats = (a: number[], b: number[]) => a.every((x, i) => x >= b[i]);
/** Which children to try first: Stars matter most, then healthy bars, then few pips. */
const promise = (s: GameState) => s.stars * 4 + s.res.power + s.res.warmth + s.res.food - s.badge * 2;

export interface WinCheck {
  winnable: boolean | null;  // null = gave up (search limit hit); treat as not checked
  path: Move[];              // one winning sequence of moves, if winnable
  resolves: number;          // turns simulated (for tuning)
}

/** Can this run still be won from `start`, with every gamble failing? */
export function isWinnable(start: GameState, ctx: Ctx, limit = 3_000_000): WinCheck {
  if (start.status === "won") return { winnable: true, path: [], resolves: 0 };
  if (start.status === "lost") return { winnable: false, path: [], resolves: 0 };
  const explored = new Map<string, number[][]>();
  let resolves = 0;
  let gaveUp = false;
  const path: Move[] = [];

  const alreadyBeaten = (s: GameState) => {
    const shape = shapeOf(s);
    const v = valuesOf(s);
    const front = explored.get(shape) ?? [];
    if (front.some(f => beats(f, v))) return true;
    explored.set(shape, [...front.filter(f => !beats(v, f)), v]);
    return false;
  };

  const search = (s: GameState): boolean => {
    const children: { state: GameState; move: Move }[] = [];
    for (const move of legalMoves(s, ctx)) {
      if (++resolves > limit) { gaveUp = true; return false; }
      const { state } = resolveTurn(s, ctx, move.plan, move.choice, { gambles: "fail" });
      if (state.status === "won") { path.push(move); return true; }
      if (state.status === "playing") children.push({ state, move });
    }
    children.sort((a, b) => promise(b.state) - promise(a.state));
    for (const c of children) {
      if (gaveUp) return false;
      if (alreadyBeaten(c.state)) continue;
      path.push(c.move);
      if (search(c.state)) return true;
      path.pop();
    }
    return false;
  };

  const won = search(start);
  return { winnable: won ? true : gaveUp ? null : false, path: won ? path : [], resolves };
}

/** Share of random players who win from `start` (gambles fail). Seeded, so repeatable. */
export function winShare(start: GameState, ctx: Ctx, players = 1000, seed = start.seed): number {
  if (start.status !== "playing") return start.status === "won" ? 1 : 0;
  const rand = mulberry32((seed ^ 0x2c1b3c6d) >>> 0);
  let wins = 0;
  for (let i = 0; i < players; i++) {
    let s = start;
    while (s.status === "playing") {
      const plans = legalSplits(s, ctx);
      const plan = plans[Math.floor(rand() * plans.length)];
      const options = choicesFor(s, ctx, plan).filter(c => c.affordable);
      const pick = options[Math.floor(rand() * options.length)];
      s = resolveTurn(s, ctx, plan, pick.choice, { gambles: "fail" }).state;
    }
    if (s.status === "won") wins++;
  }
  return wins / players;
}

export type Difficulty = "rookie" | "pilot" | "commander";

/**
 * Difficulty bands by random-player win share, measured on 450 seeds with Day +1 /
 * Night −4 (−3) warmth: Rookie ≥ 3% (about 32% of winnable seeds), Pilot 0.3–3%
 * (about 22%), Commander under 0.3% but still winnable (about 47%); 94% of seeds were
 * winnable. Retune when cards or level numbers change.
 */
export const DIFFICULTY_BANDS = { rookie: 0.03, pilot: 0.003 } as const;

/**
 * Search limit when choosing seeds or helping mid-run: about 2 seconds at most. A seed
 * that needs more is skipped (it's "not checked", never handed out); on 450 seeds this
 * skipped under 2% of winnable ones. isWinnable's own default stays higher for exact answers.
 */
export const QUICK_LIMIT = 400_000;

export function difficultyOf(share: number): Difficulty {
  return share >= DIFFICULTY_BANDS.rookie ? "rookie" : share >= DIFFICULTY_BANDS.pilot ? "pilot" : "commander";
}

export interface Analysis {
  winnable: boolean | null;
  winShare: number;
  difficulty: Difficulty | null;   // null if not winnable
  path: Move[];
  resolves: number;
}

/** Full check of a run from `start`: winnable, how forgiving, and which tier. */
export function analyse(start: GameState, ctx: Ctx, players = 1000, limit?: number): Analysis {
  const check = isWinnable(start, ctx, limit);
  if (!check.winnable) return { ...check, winShare: 0, difficulty: null };
  const share = winShare(start, ctx, players);
  return { ...check, winShare: share, difficulty: difficultyOf(share) };
}

export type MakeRun = (seed: number, specialist: Specialist) => { state: GameState; ctx: Ctx };

/**
 * Try seeds from `startSeed` upward until one is winnable at the asked difficulty.
 * Only seeds that pass are ever handed out, so seed codes always give a fair run.
 */
export function findSeed(
  makeRun: MakeRun, specialist: Specialist, difficulty: Difficulty, startSeed: number, tries = 300,
): { seed: number; analysis: Analysis; tried: number } | null {
  for (let i = 0; i < tries; i++) {
    const seed = startSeed + i;
    const { state, ctx } = makeRun(seed, specialist);
    const analysis = analyse(state, ctx, 1000, QUICK_LIMIT);
    if (analysis.winnable && analysis.difficulty === difficulty) return { seed, analysis, tried: i + 1 };
  }
  return null;
}
