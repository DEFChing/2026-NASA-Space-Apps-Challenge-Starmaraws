/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The game store. A visit and a run go through these phases:
//   title → intro (first visit only) → crewPick → checking (the worker finds a fair seed)
//   → briefing (forecast, storm alert) → split (power cells) → card (revealed after the
//   split) → report → briefing … → over (mask cutscene, then the debrief)
// A mission code skips the intro and the crew pick: title → checking → briefing.
// React reads it with useGame(); Phaser hears about each turn through the emitter.

import { create } from "zustand";
import { decode } from "../engine/codes";
import { startRun } from "../engine/data";
import type { Swap } from "../engine/draw";
import { choicesFor, isDayTurn, miniFor, planCost, planProblem, resolveTurn, type ChoiceInfo } from "../engine/rules";
import type { Analysis, Difficulty } from "../engine/solver";
import type { Choice, Ctx, DailyPlan, GameEvent, GameState, Res, Specialist } from "../engine/types";
import { markIntroSeen, readProgress, recordRun } from "../ui/progress";
import { endingFor, type Ending } from "../ui/story";
import type { TurnRecord } from "../ui/text";
import { createChecker, randomSeed } from "../workers/checkerClient";

export type Phase = "title" | "intro" | "crewPick" | "checking" | "briefing" | "split" | "card" | "mini" | "report" | "over";
export type Slot = "heater" | "greenhouse" | "experiments";

/** What the store needs from the run checker (the worker in the game, the solver in tests). */
export interface Checker {
  findSeed(specialist: Specialist, difficulty: Difficulty, startSeed?: number):
    Promise<{ seed: number; analysis: Analysis; tried: number } | null>;
  checkSeed(specialist: Specialist, seed: number): Promise<Analysis | null>;
  smarterDraw(state: GameState, res: Res, lastSwapTurn: number | null): Promise<Swap | null>;
}

let checker: Checker | null = null;
/** Swap in a different checker (tests use the solver directly, without a worker). */
export function setChecker(c: Checker | null) { checker = c; }
const getChecker = () => (checker ??= createChecker());

/** Phaser listens here (App wires it to the EventBus). */
export type EmitName = "turn-resolved" | "run-started" | "sfx" | "phase" | "skip-animations" | "settings";
type Emit = (name: EmitName, payload?: unknown) => void;
let emit: Emit = () => {};
export function setEmitter(fn: Emit) { emit = fn; }
/** Story screens play their sounds through the outpost scene too. */
export const playSfx = (key: string) => emit("sfx", key);
/** Volume, mute and reduce motion go to the scene the same way. */
export const sendSettings = (settings: unknown) => emit("settings", settings);
/** A sound effect from a React screen (the scene plays it with the effects volume). */
export const sendSfx = (key: string) => emit("sfx", key);

const TIP_KEY = "jamt.seenFirstTip";
function readFirstRun(): boolean {
  try { return typeof window === "undefined" || window.localStorage.getItem(TIP_KEY) !== "1"; } catch { return true; }
}

const emptyPlan = (): DailyPlan => ({ heater: 0, greenhouse: 0, experiments: 0, shelter: false });

/** If the scene never reports back (an error, a closed tab), stop waiting after this long. */
export const ANIMATION_TIMEOUT_MS = 25_000;
let animationTimer: ReturnType<typeof setTimeout> | undefined;

export interface GameStore {
  phase: Phase;
  difficulty: Difficulty;
  specialist: Specialist | null;
  seed: number | null;
  ctx: Ctx | null;
  state: GameState | null;
  plan: DailyPlan;
  choices: ChoiceInfo[];            // the revealed card's options (card phase)
  miniChoice: Choice | null;        // the option waiting for its mini-moment (mini phase)
  history: TurnRecord[];
  lastSwapTurn: number | null;      // smarter draw: turn of the last swap
  swaps: { turn: number; cardId: string; replaced: string }[];
  busy: boolean;                    // the worker is thinking (smarter draw)
  animating: boolean;               // the outpost scene is playing this turn's consequences
  hudState: GameState | null;       // while animating: the state before the turn, so the HUD doesn't spoil it
  sceneReady: boolean;              // the Phaser scene is listening
  error: string | null;             // shown to the player as is
  firstRun: boolean;
  landing: boolean;                 // show the landing panel before Turn 1 (after a crew pick or a code)
  ending: Ending | null;            // the mentor line for the mask cutscene, once the run is over
  debriefOpen: boolean;             // the cutscene has been dismissed

  play(): void;                                      // title → intro (first visit) or crew pick
  finishIntro(): void;                               // intro → crew pick, and remember it was seen
  watchIntro(): void;                                // title → intro, on request
  toTitle(): void;
  startCode(code: string): Promise<void>;            // title → checking → briefing, from a mission code
  land(): void;                                      // dismiss the landing panel
  openDebrief(): void;                               // cutscene → debrief
  setDifficulty(d: Difficulty): void;
  pickCrew(specialist: Specialist): Promise<void>;   // crew pick → checking → briefing
  start(specialist: Specialist, seed: number): void; // a checked seed (from the crew pick or a code)
  toSplit(shelter?: boolean): void;                  // briefing → split, with the storm answer
  setSlot(slot: Slot, cells: number): void;
  lockSplit(): void;                                 // split → card: reveal the card
  choose(choice: Choice): Promise<void>;             // card → report or over (or mini first)
  finishMini(done: boolean): Promise<void>;          // mini → report or over
  nextTurn(): void;                                  // report → briefing
  playAgain(sameSeed: boolean): void;
  dismissTip(): void;
  setSceneReady(ready: boolean): void;
  animationsDone(): void;
  skipAnimations(): void;
}

export const useGame = create<GameStore>()((set, get) => ({
  phase: "title",
  difficulty: "rookie",
  specialist: null, seed: null, ctx: null, state: null,
  plan: emptyPlan(), choices: [], miniChoice: null, history: [],
  lastSwapTurn: null, swaps: [], busy: false, error: null,
  animating: false, hudState: null, sceneReady: false,
  firstRun: readFirstRun(),
  landing: false, ending: null, debriefOpen: false,

  play() {
    set({ phase: readProgress().introSeen ? "crewPick" : "intro", error: null });
    emit("sfx", "sfx_click");
  },

  finishIntro() {
    markIntroSeen();
    if (get().phase === "intro") set({ phase: "crewPick" });
  },

  watchIntro() { if (get().phase === "title") set({ phase: "intro", error: null }); },

  toTitle() {
    set({ phase: "title", state: null, ctx: null, history: [], seed: null, error: null, animating: false, hudState: null, landing: false, ending: null, debriefOpen: false });
    emit("phase", "title");
  },

  async startCode(code) {
    if (get().phase === "checking") return;   // already checking one (e.g. a ?code= link seen twice)
    const d = decode(code);
    if (!d.ok) { set({ error: d.why }); return; }
    set({ phase: "checking", specialist: d.specialist, error: null });
    try {
      const analysis = await getChecker().checkSeed(d.specialist, d.seed);
      if (!analysis?.winnable || !analysis.difficulty) {
        set({ phase: "title", error: "Mission control couldn't check that mission. Check the code with whoever shared it." });
        return;
      }
      set({ difficulty: analysis.difficulty });
      get().start(d.specialist, d.seed);
      set({ landing: true });
    } catch (err) {
      set({ phase: "title", error: `The mission checker had a problem: ${(err as Error).message}` });
    }
  },

  land() { if (get().landing) set({ landing: false }); },

  openDebrief() { if (get().phase === "over" && !get().debriefOpen) set({ debriefOpen: true }); },

  setDifficulty: (difficulty) => set({ difficulty }),

  async pickCrew(specialist) {
    set({ phase: "checking", specialist, error: null });
    try {
      const found = await getChecker().findSeed(specialist, get().difficulty, randomSeed());
      if (!found) { set({ phase: "crewPick", error: "Couldn't find a fair mission. Try again!" }); return; }
      get().start(specialist, found.seed);
      set({ landing: true });
    } catch (err) {
      set({ phase: "crewPick", error: `The mission checker had a problem: ${(err as Error).message}` });
    }
  },

  start(specialist, seed) {
    const { state, ctx } = startRun(seed, specialist);
    set({
      phase: "briefing", specialist, seed, state, ctx,
      plan: emptyPlan(), choices: [], miniChoice: null, history: [], lastSwapTurn: null, swaps: [], busy: false, error: null,
      animating: false, hudState: null, landing: false, ending: null, debriefOpen: false,
    });
    emit("run-started", { seed, specialist, state, isDay: isDayTurn(ctx.level, 0) });
    emit("sfx", "sfx_forecast");
  },

  toSplit(shelter = false) {
    const { phase, state, ctx } = get();
    if (phase !== "briefing" || !state || !ctx) return;
    const storm = ctx.weather[state.turn].storm;
    set({ phase: "split", plan: { ...emptyPlan(), shelter: storm && shelter }, error: null });
    emit("sfx", "sfx_click");
  },

  setSlot(slot, cells) {
    if (get().phase !== "split") return;
    const next = Math.max(0, Math.floor(cells));
    emit("sfx", next > get().plan[slot] ? "sfx_cell_snap" : "sfx_cell_pick");
    set({ plan: { ...get().plan, [slot]: next }, error: null });
  },

  lockSplit() {
    const { phase, state, ctx, plan } = get();
    if (phase !== "split" || !state || !ctx) return;
    const problem = planProblem(state, ctx, plan);
    if (problem) { set({ error: problem }); emit("sfx", "sfx_locked"); return; }
    set({ phase: "card", choices: choicesFor(state, ctx, plan), error: null });
    emit("sfx", "sfx_card_reveal");
  },

  async choose(choice) {
    const { phase, state, ctx, choices } = get();
    if (phase !== "card" || !state || !ctx) return;
    const info = choices.find(c => c.choice === choice);
    if (!info?.affordable) { if (info) emit("sfx", "sfx_locked"); return; }
    emit("sfx", "sfx_option_select");
    // The hands-on option of a mini card opens its mini-moment first (Spec: about 10 s, skippable).
    if (miniFor(ctx.cards[state.deck[state.turn]], choice)) { set({ phase: "mini", miniChoice: choice }); return; }
    await resolveChoice(choice, false);
  },

  async finishMini(done) {
    const { phase, miniChoice } = get();
    if (phase !== "mini" || miniChoice === null) return;
    set({ miniChoice: null });
    await resolveChoice(miniChoice, done);
  },

  nextTurn() {
    const { phase, busy, animating } = get();
    if (phase !== "report" || busy || animating) return;
    set({ phase: "briefing", plan: emptyPlan(), error: null });
    emit("sfx", "sfx_forecast");
  },

  playAgain(sameSeed) {
    const { specialist, seed } = get();
    if (sameSeed && specialist && seed !== null) get().start(specialist, seed);
    else {
      set({ phase: "crewPick", state: null, ctx: null, history: [], seed: null, error: null, animating: false, hudState: null, landing: false, ending: null, debriefOpen: false });
      emit("phase", "crewPick");
    }
  },

  dismissTip() {
    try { if (typeof window !== "undefined") window.localStorage.setItem(TIP_KEY, "1"); } catch { /* private mode: fine */ }
    set({ firstRun: false });
  },

  setSceneReady(ready) {
    set({ sceneReady: ready });
    const { state, specialist, ctx } = get();
    // A run started before the scene existed (e.g. a dev seed link): show it now.
    if (ready && state && specialist && ctx) emit("run-started", { seed: state.seed, specialist, state, isDay: isDayTurn(ctx.level, Math.min(state.turn, ctx.level.turns - 1)) });
  },

  animationsDone() {
    clearTimeout(animationTimer);
    if (get().animating) set({ animating: false, hudState: null });
  },

  skipAnimations() {
    if (get().animating) emit("skip-animations");
  },
}));

/** Play the picked option (after its mini-moment, if it had one): history, ending, animations, help. */
async function resolveChoice(choice: Choice, miniDone: boolean) {
  const get = useGame.getState, set = useGame.setState;
  const { state, ctx, plan, choices, history } = get();
  if (!state || !ctx) return;
  const { state: after, events } = resolveTurn(state, ctx, plan, choice, { gambles: "roll", miniDone });
    const spare = state.res.power - planCost(state, ctx.level, plan);
    const record: TurnRecord = {
      turn: state.turn, cardId: state.deck[state.turn], plan, choice, events, after,
      locked: choices.filter(c => !c.affordable).map(c => ({ choice: c.choice, label: c.option.label, cost: c.cost, spare })),
    };
    const animating = get().sceneReady;
    const playing = after.status === "playing";
    let ending: Ending | null = null;
    if (!playing) {
      // Pick Amara's line now, so the cutscene and the saved "recent lines" agree.
      const progress = readProgress();
      ending = endingFor([...history, record], ctx, progress.runs, progress.recentLines);
      recordRun(ending.id);
    }
    set({ state: after, history: [...history, record], phase: playing ? "report" : "over", choices: [], animating, hudState: animating ? state : null, ending });
    if (animating) {
      clearTimeout(animationTimer);
      animationTimer = setTimeout(() => get().animationsDone(), ANIMATION_TIMEOUT_MS);
    }
    const t = record.turn;
    emit("turn-resolved", {
      turn: t, events, state: after, cardId: record.cardId, cardTitle: ctx.cards[record.cardId].title, plan,
      isDay: isDayTurn(ctx.level, t), nextIsDay: t + 1 < ctx.level.turns ? isDayTurn(ctx.level, t + 1) : null,
    });
    if (after.status === "playing") await tryHelp(after, events);
}


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
