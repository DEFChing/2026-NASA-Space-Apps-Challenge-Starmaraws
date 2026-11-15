/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { startRun } from "../engine/data";
import { smarterDraw } from "../engine/draw";
import { findSeed, isWinnable } from "../engine/solver";
import type { GameState, Res } from "../engine/types";
import { buildDebrief } from "../ui/text";
import { setChecker, setEmitter, useGame } from "./game";

const SLOW = 60_000;
const initial = useGame.getState();
const drawCalls: { turn: number; res: Res }[] = [];
const emitted: { name: string; payload: unknown }[] = [];

beforeEach(() => {
  useGame.setState(initial, true);
  drawCalls.length = 0; emitted.length = 0;
  // The real solver, without a worker; seeds always searched from 1000 so tests repeat.
  setChecker({
    findSeed: async (sp, difficulty) => findSeed(startRun, sp, difficulty, 1000),
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
