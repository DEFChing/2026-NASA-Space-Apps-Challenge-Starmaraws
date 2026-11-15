/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test } from "vitest";
import { startRun } from "../engine/data";
import { miniFor, resolveTurn } from "../engine/rules";
import type { DailyPlan, GameState } from "../engine/types";
import { setEmitter, useGame } from "../store/game";
import { moveCells, type SlotRule } from "./cellDrag";
import { dustSpots, JOINTS, leakJoint, leakSignal, MiniMoment } from "./MiniMoment";
import { resetProgress } from "./progress";
import { MINI_SAVED, reportLines } from "./text";

const html = <P extends object>(el: (p: P) => unknown, props: P) =>
  renderToStaticMarkup(createElement(el as unknown as FunctionComponent<P>, props));
const plan = (p: Partial<DailyPlan> = {}): DailyPlan => ({ heater: 0, greenhouse: 0, experiments: 0, shelter: false, ...p });

/** A run whose current card is forced to `cardId` (the deck is otherwise seeded). */
function runWith(cardId: string, turn = 0) {
  const { state, ctx } = startRun(1003, "doctor");
  const s = structuredClone(state) as GameState;
  s.turn = turn;
  s.deck[turn] = cardId;
  return { s, ctx };
}

describe("dragging power cells", () => {
  const rules: Record<"heater" | "greenhouse" | "experiments", SlotRule> = {
    heater: { max: 2, step: 1, off: false }, greenhouse: { max: 2, step: 1, off: false }, experiments: { max: 99, step: 2, off: false },
  };

  test("spare → slot, slot → spare and slot → slot, one step at a time", () => {
    expect(moveCells(plan(), 8, "spare", "greenhouse", rules)).toEqual({ greenhouse: 1 });
    expect(moveCells(plan(), 8, "spare", "experiments", rules)).toEqual({ experiments: 2 });
    expect(moveCells(plan({ experiments: 4 }), 4, "experiments", "spare", rules)).toEqual({ experiments: 2 });
    expect(moveCells(plan({ greenhouse: 1 }), 0, "greenhouse", "heater", rules)).toEqual({ greenhouse: 0, heater: 1 });
  });

  test("drops that break a rule do nothing", () => {
    expect(moveCells(plan({ greenhouse: 2 }), 5, "spare", "greenhouse", rules)).toBeNull();          // full
    expect(moveCells(plan(), 1, "spare", "experiments", rules)).toBeNull();                            // needs a pair
    expect(moveCells(plan({ greenhouse: 1 }), 0, "greenhouse", "experiments", rules)).toBeNull();     // 1 freed, 2 needed
    expect(moveCells(plan(), 8, "heater", "spare", rules)).toBeNull();                                  // nothing to take
    expect(moveCells(plan(), 8, "spare", "heater", { ...rules, heater: { ...rules.heater, off: true } })).toBeNull(); // Day
    expect(moveCells(plan(), 8, "greenhouse", "greenhouse", rules)).toBeNull();
  });
});

describe("mini-moments (Spec: only lower a cost; the checker treats them as failed)", () => {
  test("only option 0 of D2 and N3 opens one", () => {
    const { ctx } = startRun(1003, "doctor");
    expect(miniFor(ctx.cards.D2, 0)).toBe("dust");
    expect(miniFor(ctx.cards.N3, 0)).toBe("leak");
    expect(miniFor(ctx.cards.D2, 1)).toBeNull();
    expect(miniFor(ctx.cards.D2, "specialist")).toBeNull();
    expect(miniFor(ctx.cards.D1, 0)).toBeNull();
  });

  test("doing well drops the Star cost and keeps the rest; failing (the default) costs the Star", () => {
    const { s, ctx } = runWith("D2");
    const failed = resolveTurn(s, ctx, plan(), 0, { gambles: "fail" });
    const done = resolveTurn(s, ctx, plan(), 0, { gambles: "fail", miniDone: true });
    expect(done.state.stars).toBe(failed.state.stars + 1);
    expect(done.state.badge).toBe(failed.state.badge);                   // the moonwalk's pip still lands
    expect(done.events).toContainEqual({ type: "mini", cardId: "D2", kind: "dust", savedStars: 1 });
    expect(failed.events.some(e => e.type === "mini")).toBe(false);
  });

  test("miniDone changes nothing on other options or cards", () => {
    for (const [id, choice] of [["D2", 1], ["D1", 0]] as const) {
      const { s, ctx } = runWith(id);
      expect(resolveTurn(s, ctx, plan(), choice, { gambles: "fail", miniDone: true }).state)
        .toEqual(resolveTurn(s, ctx, plan(), choice, { gambles: "fail" }).state);
    }
  });

  test("the report says the Star was saved", () => {
    const { s, ctx } = runWith("N3", 1);
    const r = resolveTurn(s, ctx, plan(), 0, { gambles: "fail", miniDone: true });
    const lines = reportLines({ turn: 1, cardId: "N3", plan: plan(), choice: 0, events: r.events, after: r.state, locked: [] }, ctx);
    expect(lines).toContain(MINI_SAVED.leak);
  });

  test("the dust spots and the leak are seeded, on the panel, and the detector points the way", () => {
    expect(dustSpots(42)).toEqual(dustSpots(42));
    for (const p of dustSpots(7)) { expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(100); expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(100); }
    const leak = leakJoint(99);
    expect(leak).toBeGreaterThanOrEqual(0); expect(leak).toBeLessThan(JOINTS);
    expect(leakSignal(leak, leak)).toBe(4);
    expect(leakSignal(leak + 1, leak)).toBe(3);
    expect(leakSignal(leak + 9, leak)).toBe(0);
  });

  test("both mini-moments show a timer, keyboard help and a Skip", () => {
    for (const kind of ["dust", "leak"] as const) {
      const h = html(MiniMoment, { kind, seed: 5, onDone: () => {} });
      expect(h).toContain('role="timer"');
      expect(h).toContain("Skip (the Star cost happens)");
      expect(h).toMatch(/Tab|Enter/);
    }
  });

  describe("in the store", () => {
    beforeEach(() => { resetProgress(); setEmitter(() => {}); });

    const toCard = (cardId: string) => {
      useGame.getState().start("doctor", 1003);
      const s = structuredClone(useGame.getState().state!) as GameState;
      s.deck[s.turn] = cardId;
      useGame.setState({ state: s });
      useGame.getState().toSplit();
      useGame.getState().lockSplit();
      return s.stars;
    };

    test("option 0 on D2 waits for the mini-moment; doing well saves the Star", async () => {
      toCard("D2");
      await useGame.getState().choose(0);
      expect(useGame.getState().phase).toBe("mini");
      expect(useGame.getState().history).toHaveLength(0);
      await useGame.getState().finishMini(true);
      expect(useGame.getState().phase).toBe("report");
      expect(useGame.getState().history[0].events).toContainEqual(expect.objectContaining({ type: "mini", kind: "dust" }));
    });

    test("skipping costs the Star, as the option said", async () => {
      const before = toCard("D2");
      await useGame.getState().choose(0);
      await useGame.getState().finishMini(false);
      const rec = useGame.getState().history[0];
      expect(rec.events.some(e => e.type === "mini")).toBe(false);
      expect(rec.events).toContainEqual(expect.objectContaining({ type: "stars", amount: -1, cause: "D2" }));
      expect(useGame.getState().state!.stars).toBeLessThanOrEqual(before);
    });

    test("other options go straight to the report", async () => {
      toCard("D2");
      await useGame.getState().choose(1);
      expect(useGame.getState().phase).toBe("report");
    });
  });
});
