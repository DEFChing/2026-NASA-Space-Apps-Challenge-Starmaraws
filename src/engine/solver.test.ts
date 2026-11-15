/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { describe, expect, test } from "vitest";
import { handle } from "../workers/checkerProtocol";
import { moonCards, moonLevel, startRun } from "./data";
import { smarterDraw, swapCandidates, swapIn } from "./draw";
import { resolveTurn } from "./rules";
import { newRun } from "./run";
import {
  analyse, bandsFor, DIFFICULTY_BANDS, difficultyOf, PRACTICE_BANDS, findSeed, isWinnable, legalSplits, winShare,
} from "./solver";
import type { Card, LevelConfig } from "./types";

const SLOW = 60_000;   // the search is fast, but give CI room
const level = (patch: Partial<LevelConfig>): LevelConfig => ({ ...structuredClone(moonLevel), ...patch });
const run = (lvl: LevelConfig, cards: Card[] = moonCards, seed = 7) =>
  newRun({ level: lvl, cards, seed, specialist: "engineer" });

describe("winnable or not", () => {
  test("a run built to be impossible (every Night card drains Warmth) isn't winnable", () => {
    const blizzards: Card[] = Array.from({ length: 9 }, (_, i) => ({
      id: `X${i}`, pile: "night", tag: "crisis", title: "Blizzard", text: "Test card.",
      options: [
        { label: "Brace", effects: [{ res: "warmth", delta: -6 }] },
        { label: "Brace harder", effects: [{ res: "warmth", delta: -6 }, { stars: -1 }] },
      ],
      realBasis: "Test card.", sources: [{ label: "test", url: "https://example.org" }],
    }));
    const cards = [...moonCards.filter(c => c.pile !== "night"), ...blizzards];
    const { state, ctx } = run(moonLevel, cards);
    const a = analyse(state, ctx);
    expect(a.winnable).toBe(false);
    expect(a.winShare).toBe(0);
    expect(a.difficulty).toBeNull();
  }, SLOW);

  test("a star target out of reach isn't winnable", () => {
    const { state, ctx } = run(level({ starTarget: 99 }));
    expect(isWinnable(state, ctx).winnable).toBe(false);
  }, SLOW);

  test("an easy run is winnable with a high share", () => {
    // No star target, no hunger, no night cold, and a huge badge: almost any play wins.
    const { state, ctx } = run(level({
      starTarget: 0, upkeep: [], night: { sunlight: 0, warmth: 0, warmthInsulated: 0 },
      radiation: { ...moonLevel.radiation, limit: 99 },
    }));
    const a = analyse(state, ctx);
    expect(a.winnable).toBe(true);
    expect(a.winShare).toBeGreaterThan(0.2);
    expect(a.difficulty).toBe("rookie");
  }, SLOW);

  test("the checker never counts a gamble as succeeding", () => {
    // Stars only from cards, and the only Star option is a gamble that takes it back on a fail.
    const coinFlip = (id: string, pile: "day" | "night"): Card => ({
      id, pile, tag: "opportunity", title: "Long shot", text: "Test card.",
      options: [
        { label: "Try it", effects: [{ stars: 1 }], gamble: { chance: 0.25, onFail: [{ stars: -1 }] } },
        { label: "Skip it", effects: [], forgoesReward: true },
      ],
      realBasis: "Test card.", sources: [{ label: "test", url: "https://example.org" }],
    });
    const cards = [moonCards[0], ...Array.from({ length: 8 }, (_, i) => coinFlip(`G${i}`, "day")),
      ...Array.from({ length: 9 }, (_, i) => coinFlip(`H${i}`, "night"))];
    const lvl = level({ starTarget: 1, slots: { ...moonLevel.slots, experiments: { cellsPerStar: 99 } } });
    const { state, ctx } = run(lvl, cards);
    expect(isWinnable(state, ctx).winnable).toBe(false);
    expect(winShare(state, ctx, 200)).toBe(0);
  }, SLOW);

  test("the winning path it finds really wins when replayed with every gamble failing", () => {
    const { state, ctx } = startRun(1003, "botanist");
    const check = isWinnable(state, ctx);
    expect(check.winnable).toBe(true);
    expect(check.path).toHaveLength(8);
    let s = state;
    for (const m of check.path) s = resolveTurn(s, ctx, m.plan, m.choice, { gambles: "fail" }).state;
    expect(s.status).toBe("won");
  }, SLOW);

  test("it can check from the middle of a run, and a lost run is never winnable", () => {
    const { state, ctx } = startRun(1003, "botanist");
    const path = isWinnable(state, ctx).path;
    let s = state;
    for (const m of path.slice(0, 4)) s = resolveTurn(s, ctx, m.plan, m.choice, { gambles: "fail" }).state;
    expect(isWinnable(s, ctx).winnable).toBe(true);
    expect(isWinnable({ ...s, status: "lost" }, ctx).winnable).toBe(false);
  }, SLOW);

  test("a search that hits its limit says so instead of guessing", () => {
    const { state, ctx } = run(level({ starTarget: 99 }));
    expect(isWinnable(state, ctx, 50).winnable).toBeNull();
  });
});

describe("choices the search tries", () => {
  test("Day splits have no Heater, Experiments go in pairs, Shelter only on storm turns", () => {
    const calm = startRun(1003, "engineer");
    const day = legalSplits(calm.state, calm.ctx);
    expect(day.every(p => p.heater === 0 && p.experiments % 2 === 0 && !p.shelter)).toBe(true);
    calm.ctx.weather[0] = { storm: true, forecast: "high" };
    expect(legalSplits(calm.state, calm.ctx).some(p => p.shelter)).toBe(true);
    const night = { ...calm.state, turn: 1 };
    expect(legalSplits(night, calm.ctx).some(p => p.heater === 2)).toBe(true);
  });
});

describe("seeds and difficulty", () => {
  test("difficulty bands", () => {
    expect(difficultyOf(0.3)).toBe("rookie");
    expect(difficultyOf(DIFFICULTY_BANDS.rookie)).toBe("rookie");
    expect(difficultyOf(0.1)).toBe("pilot");
    expect(difficultyOf(DIFFICULTY_BANDS.pilot)).toBe("pilot");
    expect(difficultyOf(0.01)).toBe("commander");
    expect(difficultyOf(0)).toBe("commander");
  });

  test("practice weather keeps the gentler Step 4 bands; real DONKI weather uses the retuned ones", () => {
    const practice = startRun(1000, "doctor").ctx;
    expect(practice.weatherStart).toBeUndefined();
    expect(bandsFor(practice)).toBe(PRACTICE_BANDS);
    expect(bandsFor({ ...practice, weatherStart: "2017-09-01" })).toBe(DIFFICULTY_BANDS);
    expect(difficultyOf(0.05, PRACTICE_BANDS)).toBe("rookie");
    expect(difficultyOf(0.05)).toBe("pilot");
  });

  test("the same seed and specialist give the same result", () => {
    const a = startRun(1000, "doctor"), b = startRun(1000, "doctor");
    expect(analyse(b.state, b.ctx)).toEqual(analyse(a.state, a.ctx));
  }, SLOW);

  test("a seed can pass for one specialist and fail for another", () => {
    const result = (["engineer", "botanist", "doctor"] as const).map(sp => {
      const { state, ctx } = startRun(1092, sp);
      return isWinnable(state, ctx).winnable;
    });
    expect(result).toEqual([false, false, true]);   // only the Doctor can win seed 1092
  }, SLOW);

  test("findSeed only hands out seeds that pass at the asked difficulty", () => {
    for (const difficulty of ["rookie", "pilot", "commander"] as const) {
      const found = findSeed(startRun, "botanist", difficulty, 2000);
      expect(found).not.toBeNull();
      expect(found!.analysis.winnable).toBe(true);
      expect(found!.analysis.difficulty).toBe(difficulty);
      const again = startRun(found!.seed, "botanist");
      expect(analyse(again.state, again.ctx).difficulty).toBe(difficulty);
    }
    expect(findSeed(startRun, "botanist", "pilot", 2000)).toEqual(findSeed(startRun, "botanist", "pilot", 2000));
  }, SLOW);
});

describe("smarter draw", () => {
  /** Turn 3 (a Day turn), Food low, D1 next, with D5 and D7 waiting in the reserve. */
  function lowFood() {
    const { state, ctx } = startRun(1003, "engineer");
    const s = structuredClone(state);
    s.turn = 2; s.res = { power: 4, warmth: 7, food: 2 }; s.badge = 3; s.stars = 2;
    s.flags = ["buried"];
    const day = moonCards.filter(c => c.pile === "day").map(c => c.id);
    s.deck = ["B0", s.deck[1], "D1", s.deck[3], "D2", s.deck[5], "D3", s.deck[7]];
    s.reserve.day = day.filter(id => !s.deck.includes(id));
    return { s, ctx };
  }

  test("candidates come from the next turn's pile and protect the warned bar", () => {
    const { s, ctx } = lowFood();
    const food = swapCandidates(s, ctx, "food");
    expect(food.sort()).toEqual(["D5", "D7"]);
    expect(food.every(id => ctx.cards[id].pile === "day")).toBe(true);
    expect(swapCandidates(s, ctx, "warmth")).toEqual([]);          // no Day card protects Warmth
    expect(swapCandidates({ ...s, turn: 1 }, ctx, "food")).toEqual([]); // nothing in the Night pile does
  });

  test("a swap puts the old card back in the reserve and leaves the original state alone", () => {
    const { s, ctx } = lowFood();
    const before = structuredClone(s);
    const out = swapIn(s, ctx, "D7");
    expect(out.deck[2]).toBe("D7");
    expect(out.reserve.day).toContain("D1");
    expect(out.reserve.day).not.toContain("D7");
    expect(out.reserve.day.length).toBe(s.reserve.day.length);
    expect(s).toEqual(before);
    expect(() => swapIn(s, ctx, "N1")).toThrow(/isn't in the day reserve/);
  });

  test("it only swaps when the run gets at least as forgiving, and waits 2 turns between swaps", () => {
    const { s, ctx } = lowFood();
    const swap = smarterDraw(s, ctx, "food", null);
    expect(swap).not.toBeNull();
    expect(["D5", "D7"]).toContain(swap!.cardId);
    expect(swap!.replaced).toBe("D1");
    expect(swap!.after).toBeGreaterThanOrEqual(swap!.before);
    expect(smarterDraw(s, ctx, "food", 1)).toBeNull();             // swapped last turn: too soon
    expect(smarterDraw(s, ctx, "food", 0)).not.toBeNull();         // 2 turns ago: allowed
  }, SLOW);
});

describe("the worker's message handler", () => {
  test("answers with the request's id", () => {
    const r = handle({ id: 42, kind: "findSeed", specialist: "doctor", difficulty: "rookie", startSeed: 3000 });
    expect(r.id).toBe(42);
    expect(r.kind).toBe("findSeed");
    if (r.kind === "findSeed") expect(r.result?.analysis.difficulty).toBe("rookie");
  }, SLOW);

  test("turns a crash into an error reply instead of killing the worker", () => {
    const { state } = startRun(1, "doctor");
    const r = handle({ id: 7, kind: "analyse", state: { ...state, deck: [] } });
    expect(r).toEqual({ id: 7, kind: "error", message: expect.any(String) });
  });
});
