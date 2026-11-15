/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { startRun } from "../engine/data";
import { smarterDraw } from "../engine/draw";
import { encode } from "../engine/codes";
import { analyse, findSeed, isWinnable, QUICK_LIMIT } from "../engine/solver";
import type { GameState, Res } from "../engine/types";
import { readProgress, resetProgress } from "../ui/progress";
import { buildDebrief } from "../ui/text";
import { ANIMATION_TIMEOUT_MS, setChecker, setEmitter, useGame } from "./game";

const SLOW = 60_000;
const initial = useGame.getState();
const drawCalls: { turn: number; res: Res }[] = [];
const emitted: { name: string; payload: unknown }[] = [];

beforeEach(() => {
  useGame.setState(initial, true);
  drawCalls.length = 0; emitted.length = 0;
  resetProgress();
  // The real solver, without a worker; seeds always searched from 1000 so tests repeat.
  setChecker({
    findSeed: async (sp, difficulty) => findSeed(startRun, sp, difficulty, 1000),
    checkSeed: async (sp, seed) => { const { state, ctx } = startRun(seed, sp); return analyse(state, ctx, 1000, QUICK_LIMIT); },
    smarterDraw: async (state, res, last) => {
      drawCalls.push({ turn: state.turn, res });
      return smarterDraw(state, startRun(state.seed, state.specialist).ctx, res, last, 200);
    },
  });
  setEmitter((name, payload) => emitted.push({ name, payload }));
});

const g = () => useGame.getState();

describe("starting a mission", () => {
  test("the crew pick checks a seed, then opens the briefing", async () => {
    g().setDifficulty("pilot");
    const p = g().pickCrew("engineer");
    expect(g().phase).toBe("checking");
    await p;
    expect(g().phase).toBe("briefing");
    const { state, ctx } = startRun(g().seed!, "engineer");
    expect(isWinnable(state, ctx).winnable).toBe(true);
    expect(emitted[0].name).toBe("run-started");
  }, SLOW);

  test("play again with the same seed deals the same run", () => {
    g().start("doctor", 1003);
    const deck = g().state!.deck;
    g().toSplit(); g().setSlot("greenhouse", 1); g().lockSplit(); void g().choose(1);
    g().playAgain(true);
    expect(g().phase).toBe("briefing");
    expect(g().state!.deck).toEqual(deck);
    expect(g().history).toEqual([]);
  });
});

describe("one turn", () => {
  test("the storm answer only counts on storm turns", () => {
    g().start("doctor", 1003);
    g().toSplit(true);
    expect(g().plan.shelter).toBe(g().ctx!.weather[0].storm);
  });

  test("a split the battery can't pay for shows why and stays on the split", () => {
    g().start("doctor", 1003);
    g().toSplit();
    g().setSlot("experiments", 12);
    g().lockSplit();
    expect(g().phase).toBe("split");
    expect(g().error).toMatch(/needs 12 cells, but the battery has 8/);
  });

  test("the card is revealed after the split; locked options say why and can't be picked", async () => {
    g().start("doctor", 1003);
    g().toSplit();
    g().setSlot("experiments", 6);                      // 2 spare: can't bury (Power −3)
    g().lockSplit();
    expect(g().phase).toBe("card");
    const bury = g().choices.find(c => c.choice === 0)!;
    expect(bury.affordable).toBe(false);
    expect(bury.reason).toBe("Needs 3 Power. You kept 2 spare.");
    await g().choose(0);
    expect(g().phase).toBe("card");                     // ignored
    await g().choose(1);
    expect(g().phase).toBe("report");
    expect(g().history[0].locked).toEqual([{ choice: 0, label: "Bury the whole habitat", cost: 3, spare: 2 }]);
    expect(emitted[emitted.length - 1]).toMatchObject({ name: "turn-resolved", payload: { turn: 0 } });
  });
});

describe("whole runs", () => {
  test("following a winning path wins, and the debrief says so", async () => {
    g().start("botanist", 1003);
    const { state, ctx } = startRun(1003, "botanist");
    const path = isWinnable(state, ctx).path;
    for (const m of path) {
      g().toSplit(m.plan.shelter);
      for (const slot of ["heater", "greenhouse", "experiments"] as const) g().setSlot(slot, m.plan[slot]);
      g().lockSplit();
      expect(g().phase).toBe("card");
      await g().choose(m.choice);
      if (g().phase === "report") g().nextTurn();
    }
    expect(g().phase).toBe("over");
    expect(g().state!.status).toBe("won");
    expect(g().history).toHaveLength(8);
    expect(buildDebrief(g().history, g().ctx!).headline).toBe("Mission complete!");
    expect(g().ending).toMatchObject({ outcome: expect.stringMatching(/^win_(clean|close)$/), mood: "smile" });
    expect(g().ending!.text).not.toMatch(/\{/);
    expect(readProgress()).toMatchObject({ runs: 1, recentLines: [g().ending!.id] });
  }, SLOW);

  test("never using the greenhouse runs out of food, and the debrief says what ran out", async () => {
    g().start("botanist", 1003);
    while (g().phase !== "over") {
      const s = g().state!;
      g().toSplit(true);
      if (s.turn % 2 === 1) g().setSlot("heater", Math.min(2, s.res.power));
      g().lockSplit();
      const free = g().choices.find(c => c.affordable)!;
      await g().choose(free.choice);
      if (g().phase === "report") g().nextTurn();
    }
    expect(g().state!.status).toBe("lost");
    const d = buildDebrief(g().history, g().ctx!);
    expect(d.headline).toMatch(/Mission over: \w+ ran out|badge filled|science/);
    expect(g().ending).toMatchObject({ outcome: "first_run", mood: "thoughtful" });   // nobody passes their first sim
    expect(g().debriefOpen).toBe(false);
    g().openDebrief();
    expect(g().debriefOpen).toBe(true);
  }, SLOW);
});

describe("smarter draw", () => {
  test("a warning asks the checker for help, and a swap replaces the next card", async () => {
    g().start("engineer", 1003);
    const s = structuredClone(g().state!) as GameState;
    s.res.food = 3;                                     // this turn's upkeep drops it to 2
    useGame.setState({ state: s });
    g().toSplit(); g().lockSplit();
    await g().choose(1);                                // sandbag
    expect(drawCalls).toEqual([{ turn: 1, res: "food" }]);
    expect(g().busy).toBe(false);
  }, SLOW);

  test("no warning, no call", async () => {
    g().start("engineer", 1003);
    g().toSplit(); g().setSlot("greenhouse", 1); g().lockSplit();
    await g().choose(1);
    expect(drawCalls).toEqual([]);
  });
});

test("the first-run tip can be dismissed", () => {
  g().dismissTip();
  expect(g().firstRun).toBe(false);
});

describe("waiting for the outpost scene", () => {
  afterEach(() => { vi.useRealTimers(); });

  function toCard() {
    g().start("doctor", 1003);
    g().toSplit(); g().setSlot("greenhouse", 1); g().lockSplit();
  }

  test("with the scene ready, the report waits for animations-done", async () => {
    g().setSceneReady(true);
    toCard();
    await g().choose(1);
    expect(g().phase).toBe("report");
    expect(g().animating).toBe(true);
    g().nextTurn();
    expect(g().phase).toBe("report");             // can't move on mid-animation
    g().animationsDone();
    expect(g().animating).toBe(false);
    g().nextTurn();
    expect(g().phase).toBe("briefing");
  });

  test("the HUD keeps the state before the turn until the animation ends", async () => {
    g().setSceneReady(true);
    toCard();
    const before = g().state!;
    await g().choose(1);
    expect(g().hudState).toBe(before);
    expect(g().state).not.toBe(before);
    g().animationsDone();
    expect(g().hudState).toBeNull();
  });

  test("the turn payload gives the scene what it needs", async () => {
    g().setSceneReady(true);
    toCard();
    await g().choose(1);
    const p = emitted.filter(e => e.name === "turn-resolved").pop()!.payload as Record<string, unknown>;
    expect(p).toMatchObject({ turn: 0, cardId: "B0", cardTitle: "Building the base", isDay: true, nextIsDay: false });
    expect(p.plan).toEqual({ heater: 0, greenhouse: 1, experiments: 0, shelter: false });
  });

  test("if the scene never answers, the game moves on after the timeout", async () => {
    vi.useFakeTimers();
    g().setSceneReady(true);
    toCard();
    await g().choose(1);
    expect(g().animating).toBe(true);
    vi.advanceTimersByTime(ANIMATION_TIMEOUT_MS + 1);
    expect(g().animating).toBe(false);
  });

  test("without a scene (tests, or Phaser failed), nothing waits", async () => {
    toCard();
    await g().choose(1);
    expect(g().animating).toBe(false);
  });

  test("skip only asks the scene to hurry while it's animating", async () => {
    g().skipAnimations();
    expect(emitted.some(e => e.name === "skip-animations")).toBe(false);
    g().setSceneReady(true);
    toCard();
    await g().choose(1);
    g().skipAnimations();
    expect(emitted.some(e => e.name === "skip-animations")).toBe(true);
  });

  test("a scene that appears mid-run is told about the run", () => {
    g().start("doctor", 1003);
    emitted.length = 0;
    g().setSceneReady(true);
    expect(emitted[0]).toMatchObject({ name: "run-started", payload: { specialist: "doctor", isDay: true } });
  });

  test("interface sounds: card reveal, locked option, option select", async () => {
    g().start("doctor", 1003);
    g().toSplit(); g().setSlot("experiments", 6); g().lockSplit();
    await g().choose(0);                            // locked: bury needs 3
    await g().choose(1);
    const sounds = emitted.filter(e => e.name === "sfx").map(e => e.payload);
    expect(sounds).toEqual(expect.arrayContaining(["sfx_card_reveal", "sfx_locked", "sfx_option_select"]));
  });
});

describe("title, intro, codes and endings", () => {
  test("the game opens on the title; the intro plays on the first visit only", () => {
    expect(g().phase).toBe("title");
    g().play();
    expect(g().phase).toBe("intro");
    g().finishIntro();
    expect(g().phase).toBe("crewPick");
    expect(readProgress().introSeen).toBe(true);
    g().toTitle();
    g().play();
    expect(g().phase).toBe("crewPick");
  });

  test("a crew pick shows the landing panel first; trying the same mission again doesn't", async () => {
    await g().pickCrew("doctor");
    expect(g().phase).toBe("briefing");
    expect(g().landing).toBe(true);
    g().land();
    expect(g().landing).toBe(false);
    g().playAgain(true);
    expect(g().landing).toBe(false);
  }, SLOW);

  test("a mission code starts that crew and seed, checked first, at its difficulty", async () => {
    const found = findSeed(startRun, "engineer", "pilot", 1000)!;
    await g().startCode(encode("engineer", found.seed).toLowerCase());
    expect(g()).toMatchObject({ phase: "briefing", specialist: "engineer", seed: found.seed, difficulty: "pilot", landing: true, error: null });
  }, SLOW);

  test("a code with a typo is caught before anything starts", async () => {
    const code = encode("botanist", 1003);
    await g().startCode(code.slice(0, -1) + (code.endsWith("2") ? "3" : "2"));
    expect(g().phase).toBe("title");
    expect(g().error).toMatch(/typo/);
  });

  test("a valid code for a mission the checker can't win is refused", async () => {
    // Seed 1092 can only be won with the doctor (solver tests), so the engineer's version is refused.
    expect(isWinnable(startRun(1092, "engineer").state, startRun(1092, "engineer").ctx).winnable).toBe(false);
    await g().startCode(encode("engineer", 1092));
    expect(g().phase).toBe("title");
    expect(g().error).toMatch(/couldn't check that mission/);
  }, SLOW);

  test("going back to the title clears the run", async () => {
    g().start("doctor", 1003);
    g().toTitle();
    expect(g()).toMatchObject({ phase: "title", state: null, seed: null, ending: null, debriefOpen: false });
    expect(emitted.some(e => e.name === "phase" && e.payload === "title")).toBe(true);
  });
});
