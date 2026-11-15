/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { describe, expect, test } from "vitest";
import { startRun } from "../../engine/data";
import { isDayTurn, resolveTurn } from "../../engine/rules";
import { isWinnable } from "../../engine/solver";
import type { DailyPlan, GameEvent } from "../../engine/types";
import { AUDIO, deliveredStatus, IMAGES } from "../assets";
import { beats, planTurn, type Step } from "./plan";

const plan = (p: Partial<DailyPlan> = {}): DailyPlan => ({ heater: 0, greenhouse: 0, experiments: 0, shelter: false, ...p });
const info = (p: Partial<Parameters<typeof planTurn>[1]> = {}) =>
  ({ cardId: "N7", plan: plan(), isDay: false, nextIsDay: true, ...p });
const kinds = (steps: Step[]) => steps.map(s => s.kind);

describe("planTurn", () => {
  test("every engine event type becomes a visible step", () => {
    const all: GameEvent[] = [
      { type: "res", res: "power", from: 8, to: 5, cause: "split" },
      { type: "res", res: "food", from: 5, to: 6, cause: "greenhouse" },
      { type: "stars", amount: 1, cause: "experiments" },
      { type: "starsBlocked", amount: 1, why: "strained" },
      { type: "res", res: "power", from: 5, to: 4, cause: "N7" },
      { type: "gamble", cardId: "N7", failed: true },
      { type: "res", res: "power", from: 4, to: 10, cause: "sunlight" },
      { type: "res", res: "food", from: 6, to: 5, cause: "upkeep" },
      { type: "badge", amount: 1, cause: "drip" },
      { type: "storm", sheltered: false, pips: 5 },
      { type: "badge", amount: 5, cause: "storm" },
      { type: "delayed", cause: "N5", fromTurn: 1 },
      { type: "stars", amount: 1, cause: "N5" },
      { type: "flag", flag: "cave", cause: "D4" },
      { type: "sunMod", delta: -1, from: 2, to: 7, cause: "D8" },
      { type: "warning", res: "food" },
      { type: "emergency", res: "warmth" },
      { type: "recovered", res: "power" },
      { type: "end", status: "lost", lostBy: "warmth" },
    ];
    const steps = planTurn(all, info());
    expect(kinds(steps)).toEqual([
      "cells", "grow", "science", "blocked", "card", "bar", "gamble", "sun", "bar", "badge",
      "storm", "delayed", "stars", "flag", "sunMod", "status", "status", "status", "end",
    ]);
  });

  test("sheltering walks the crew to the storm room before anything else", () => {
    const steps = planTurn([
      { type: "res", res: "power", from: 8, to: 6, cause: "split" },
      { type: "storm", sheltered: true, pips: 1 },
    ], info());
    expect(kinds(steps)[0]).toBe("shelter");
  });

  test("a card with no visible effect still gets its moment, before sunlight", () => {
    const steps = planTurn([
      { type: "res", res: "power", from: 8, to: 7, cause: "split" },
      { type: "res", res: "power", from: 7, to: 10, cause: "sunlight" },
    ], info({ cardId: "D3", isDay: true, nextIsDay: false }));
    expect(kinds(steps)).toEqual(["cells", "card", "sun", "sweep"]);
    expect(steps[3]).toEqual({ kind: "sweep", to: "night" });
  });

  test("no sweep after the last turn or when the run ends", () => {
    expect(kinds(planTurn([], info({ nextIsDay: null })))).not.toContain("sweep");
    expect(kinds(planTurn([{ type: "end", status: "won" }], info()))).not.toContain("sweep");
  });

  test("a whole real run plans without gaps: every turn has the card and alternates sweeps", () => {
    const { state, ctx } = startRun(1003, "botanist");
    let s = state;
    for (const m of isWinnable(state, ctx).path) {
      const t = s.turn;
      const r = resolveTurn(s, ctx, m.plan, m.choice, { gambles: "fail" });
      const steps = planTurn(r.events, {
        cardId: s.deck[t], plan: m.plan, isDay: isDayTurn(ctx.level, t),
        nextIsDay: t + 1 < ctx.level.turns ? isDayTurn(ctx.level, t + 1) : null,
      });
      expect(kinds(steps).filter(k => k === "card")).toHaveLength(1);
      if (t < 7) expect(steps[steps.length - 1]).toEqual({ kind: "sweep", to: isDayTurn(ctx.level, t + 1) ? "day" : "night" });
      s = r.state;
    }
    expect(s.status).toBe("won");
  });
});

describe("asset manifest", () => {
  test("names follow the asset guide's rules and are unique", () => {
    const keys = [...IMAGES.map(a => a.key), ...AUDIO.map(a => a.key)];
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
  });

  test("sprite strips stay within 4096 px when delivered at 2×", () => {
    for (const a of IMAGES) expect(a.w * 2 * (a.frames ?? 1), a.key).toBeLessThanOrEqual(4096);
  });

  test("crew sheets match the contract: 26 frames of 128 × 192 px", () => {
    for (const k of ["crew_ana", "crew_kai", "crew_mei", "crew_sol"]) {
      const a = IMAGES.find(x => x.key === k)!;
      expect([a.w * 2, a.h * 2, a.frames]).toEqual([128, 192, 26]);
    }
  });

  test("delivered files are matched by name; a sound counts with either format", () => {
    const s = deliveredStatus({ art: ["module_heater.webp", "Module_Power.webp"], audio: ["sfx_storm.ogg"] });
    expect(s.images.find(i => i.asset.key === "module_heater")!.real).toBe(true);
    expect(s.images.find(i => i.asset.key === "module_power")!.real).toBe(false);   // wrong case
    expect(s.audio.find(i => i.asset.key === "sfx_storm")).toMatchObject({ real: true, ogg: true, mp3: false });
  });
});

describe("beats: upkeep plays together", () => {
  const bar = (res: "power" | "warmth" | "food"): Step => ({ kind: "bar", res, from: 5, to: 4, cause: "upkeep" });
  test("groups back-to-back bars, statuses and pips into one beat", () => {
    const steps: Step[] = [{ kind: "cells", cells: 6, plan: { heater: 0, greenhouse: 0, experiments: 0 } as DailyPlan }, bar("food"), bar("warmth"),
      { kind: "status", status: "warning", res: "warmth" }, { kind: "badge", amount: 1, cause: "drip" }, { kind: "sweep", to: "night" }];
    expect(beats(steps).map(b => b.map(s => s.kind))).toEqual([["cells"], ["bar", "bar", "status", "badge"], ["sweep"]]);
  });
  test("starts a new beat when the same bar changes twice", () => {
    expect(beats([bar("food"), bar("warmth"), bar("food")]).map(b => b.length)).toEqual([2, 1]);
  });
  test("keeps every step, in order", () => {
    const steps: Step[] = [bar("power"), { kind: "stars", amount: 1, cause: "science" }, bar("power"), bar("food")];
    expect(beats(steps).flat()).toEqual(steps);
  });
});
