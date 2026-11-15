/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The game store. One turn runs as a set of phases:
//   crewPick → checking (the worker finds a fair seed) → briefing (forecast, storm alert)
//   → split (power cells) → card (revealed after the split) → report → briefing … → over
// React reads it with useGame(); Phaser hears about each turn through the emitter.

import { create } from "zustand";
import { startRun } from "../engine/data";
import type { Swap } from "../engine/draw";
import { choicesFor, planCost, planProblem, resolveTurn, type ChoiceInfo } from "../engine/rules";
import type { Analysis, Difficulty } from "../engine/solver";
import type { Choice, Ctx, DailyPlan, GameEvent, GameState, Res, Specialist } from "../engine/types";
import type { TurnRecord } from "../ui/text";
import { createChecker, randomSeed } from "../workers/checkerClient";

export type Phase = "crewPick" | "checking" | "briefing" | "split" | "card" | "report" | "over";
export type Slot = "heater" | "greenhouse" | "experiments";

/** What the store needs from the run checker (the worker in the game, the solver in tests). */
export interface Checker {
  findSeed(specialist: Specialist, difficulty: Difficulty, startSeed?: number):
    Promise<{ seed: number; analysis: Analysis; tried: number } | null>;
  smarterDraw(state: GameState, res: Res, lastSwapTurn: number | null): Promise<Swap | null>;
}

let checker: Checker | null = null;
/** Swap in a different checker (tests use the solver directly, without a worker). */
export function setChecker(c: Checker | null) { checker = c; }
const getChecker = () => (checker ??= createChecker());

/** Phaser listens here (App wires it to the EventBus). */
type Emit = (name: "turn-resolved" | "run-started", payload: unknown) => void;
let emit: Emit = () => {};
export function setEmitter(fn: Emit) { emit = fn; }

const TIP_KEY = "jamt.seenFirstTip";
function readFirstRun(): boolean {
  try { return typeof localStorage === "undefined" || localStorage.getItem(TIP_KEY) !== "1"; } catch { return true; }
}

const emptyPlan = (): DailyPlan => ({ heater: 0, greenhouse: 0, experiments: 0, shelter: false });

export interface GameStore {
  phase: Phase;
  difficulty: Difficulty;
  specialist: Specialist | null;
  seed: number | null;
  ctx: Ctx | null;
  state: GameState | null;
  plan: DailyPlan;
  choices: ChoiceInfo[];            // the revealed card's options (card phase)
  history: TurnRecord[];
  lastSwapTurn: number | null;      // smarter draw: turn of the last swap
  swaps: { turn: number; cardId: string; replaced: string }[];
  busy: boolean;                    // the worker is thinking (smarter draw)
  error: string | null;             // shown to the player as is
  firstRun: boolean;

  setDifficulty(d: Difficulty): void;
  pickCrew(specialist: Specialist): Promise<void>;   // crew pick → checking → briefing
  start(specialist: Specialist, seed: number): void; // a checked seed (or a seed code, Step 7)
  toSplit(shelter?: boolean): void;                  // briefing → split, with the storm answer
  setSlot(slot: Slot, cells: number): void;
  lockSplit(): void;                                 // split → card: reveal the card
  choose(choice: Choice): Promise<void>;             // card → report or over
  nextTurn(): void;                                  // report → briefing
  playAgain(sameSeed: boolean): void;
  dismissTip(): void;
}

export const useGame = create<GameStore>()((set, get) => ({
  phase: "crewPick",
  difficulty: "rookie",
  specialist: null, seed: null, ctx: null, state: null,
  plan: emptyPlan(), choices: [], history: [],
  lastSwapTurn: null, swaps: [], busy: false, error: null,
  firstRun: readFirstRun(),

  setDifficulty: (difficulty) => set({ difficulty }),

  async pickCrew(specialist) {
    set({ phase: "checking", specialist, error: null });
    try {
      const found = await getChecker().findSeed(specialist, get().difficulty, randomSeed());
      if (!found) { set({ phase: "crewPick", error: "Couldn't find a fair mission. Try again!" }); return; }
      get().start(specialist, found.seed);
    } catch (err) {
      set({ phase: "crewPick", error: `The mission checker had a problem: ${(err as Error).message}` });
    }
  },

  start(specialist, seed) {
    const { state, ctx } = startRun(seed, specialist);
    set({
      phase: "briefing", specialist, seed, state, ctx,
      plan: emptyPlan(), choices: [], history: [], lastSwapTurn: null, swaps: [], busy: false, error: null,
    });
    emit("run-started", { seed, specialist });
  },

  toSplit(shelter = false) {
    const { phase, state, ctx } = get();
    if (phase !== "briefing" || !state || !ctx) return;
    const storm = ctx.weather[state.turn].storm;
    set({ phase: "split", plan: { ...emptyPlan(), shelter: storm && shelter }, error: null });
  },

  setSlot(slot, cells) {
    if (get().phase !== "split") return;
    set({ plan: { ...get().plan, [slot]: Math.max(0, Math.floor(cells)) }, error: null });
  },

  lockSplit() {
    const { phase, state, ctx, plan } = get();
    if (phase !== "split" || !state || !ctx) return;
    const problem = planProblem(state, ctx, plan);
    if (problem) { set({ error: problem }); return; }
    set({ phase: "card", choices: choicesFor(state, ctx, plan), error: null });
  },

  async choose(choice) {
    const { phase, state, ctx, plan, choices, history } = get();
    if (phase !== "card" || !state || !ctx) return;
    const info = choices.find(c => c.choice === choice);
    if (!info?.affordable) return;
    const { state: after, events } = resolveTurn(state, ctx, plan, choice);
    const spare = state.res.power - planCost(state, ctx.level, plan);
    const record: TurnRecord = {
      turn: state.turn, cardId: state.deck[state.turn], plan, choice, events, after,
      locked: choices.filter(c => !c.affordable).map(c => ({ choice: c.choice, label: c.option.label, cost: c.cost, spare })),
    };
    set({ state: after, history: [...history, record], phase: after.status === "playing" ? "report" : "over", choices: [] });
    emit("turn-resolved", { turn: record.turn, events, state: after });
    if (after.status === "playing") await tryHelp(after, events);
  },

  nextTurn() {
    const { phase, busy } = get();
    if (phase !== "report" || busy) return;
    set({ phase: "briefing", plan: emptyPlan(), error: null });
  },

  playAgain(sameSeed) {
    const { specialist, seed } = get();
    if (sameSeed && specialist && seed !== null) get().start(specialist, seed);
    else set({ phase: "crewPick", state: null, ctx: null, history: [], seed: null, error: null });
  },

  dismissTip() {
    try { localStorage.setItem(TIP_KEY, "1"); } catch { /* private mode: fine */ }
    set({ firstRun: false });
  },
}));

/** Smarter draw: after a warning, ask the checker for a better next card. */
async function tryHelp(after: GameState, events: GameEvent[]) {
  const warned = events.flatMap(e => (e.type === "warning" ? [e.res] : []));
  if (!warned.length) return;
  const res: Res = warned.includes("food") ? "food" : warned.includes("power") ? "power" : warned[0];
  const { lastSwapTurn } = useGame.getState();
  useGame.setState({ busy: true });
  try {
    const swap = await getChecker().smarterDraw(after, res, lastSwapTurn);
    const now = useGame.getState();
    if (swap && now.state === after) {          // only if nothing moved on meanwhile
      useGame.setState({
        state: swap.state, lastSwapTurn: after.turn,
        swaps: [...now.swaps, { turn: after.turn, cardId: swap.cardId, replaced: swap.replaced }],
      });
      if (import.meta.env?.DEV) console.info(`[smarter draw] Turn ${after.turn + 1}: ${swap.replaced} → ${swap.cardId}`);
    }
  } catch {
    /* help is optional: if the checker fails, the run goes on unchanged */
  } finally {
    useGame.setState({ busy: false });
  }
}
