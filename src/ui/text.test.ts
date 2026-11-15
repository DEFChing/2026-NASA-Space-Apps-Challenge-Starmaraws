/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { describe, expect, test } from "vitest";
import { moonCards, startRun } from "../engine/data";
import { resolveTurn } from "../engine/rules";
import type { DailyPlan } from "../engine/types";
import { buildDebrief, describeEffect, describeOption, forecastText, reportLines, type TurnRecord } from "./text";

const card = (id: string) => moonCards.find(c => c.id === id)!;

describe("describeEffect", () => {
  test("says what changes and when", () => {
    expect(describeEffect({ res: "food", delta: 2, inTurns: 2 })).toBe("Food +2 in 2 turns");
    expect(describeEffect({ res: "power", delta: -2 })).toBe("Power −2");
    expect(describeEffect({ stars: -1 })).toBe("−1 Star");
    expect(describeEffect({ stars: 2 })).toBe("+2 Stars");
    expect(describeEffect({ badge: 1 })).toBe("+1 pip");
    expect(describeEffect({ stars: 1, inTurns: 1 })).toBe("+1 Star next turn");
    expect(describeEffect({ res: "warmth", delta: -1, forTurns: 2 })).toBe("Warmth −1 this turn and next");
    expect(describeEffect({ res: "power", delta: -1, onTurns: "day" })).toBe("Power −1 every Day left");
    expect(describeEffect({ sunlight: -1 })).toBe("sunlight −1 every Day");
    expect(describeEffect({ flag: "cave" })).toBe("cave found: sheltering from storms costs no Power");
  });
});

describe("describeOption", () => {
  test("every option on every real card has a description", () => {
    for (const c of moonCards) {
      for (const o of [...c.options, ...(c.specialist ? [c.specialist] : [])]) {
        expect(describeOption(o).length, `${c.id} ${o.label}`).toBeGreaterThan(3);
      }
    }
  });

  test("gambles show kid odds, and skip options say so", () => {
    expect(describeOption(card("N3").options[1])).toBe("Nothing now · 1 in 3 chance: Warmth −1 this turn and next");
    expect(describeOption(card("D6").options[0])).toBe("+2 Stars, +1 pip, Food −1 · 1 in 4 chance: −1 Star");
    expect(describeOption(card("D3").options[1])).toBe("No cost, but no reward");
    expect(describeOption(card("N5").options[1])).toBe("+1 Star, +1 Star next turn, Power −1 next turn");
  });

  test("forecast in kid words", () => {
    expect(forecastText("medium")).toBe("1 in 3 chance of a radiation storm next turn");
    expect(forecastText("low")).toBe("1 in 10 chance of a radiation storm next turn");
  });
});

describe("turn report and debrief", () => {
  const plan = (p: Partial<DailyPlan> = {}): DailyPlan => ({ heater: 0, greenhouse: 0, experiments: 0, shelter: false, ...p });

  function playTurn(prev: TurnRecord | null, p: Partial<DailyPlan>, choice: 0 | 1, seed = 1003) {
    const { state, ctx } = startRun(seed, "botanist");
    const s0 = prev ? prev.after : state;
    const r = resolveTurn(s0, ctx, plan(p), choice, { gambles: "fail" });
    const rec: TurnRecord = { turn: s0.turn, cardId: s0.deck[s0.turn], plan: plan(p), choice, events: r.events, after: r.state, locked: [] };
    return { rec, ctx };
  }

  test("the report tells the turn's story in order", () => {
    const { rec, ctx } = playTurn(null, { greenhouse: 1, experiments: 2 }, 0);   // Turn 1: bury
    const lines = reportLines(rec, ctx);
    expect(lines[0]).toBe("You used 3 cells of Power.");
    expect(lines).toContain("The greenhouse grew 1 Food.");
    expect(lines).toContain("Experiments earned +1 Star.");
    expect(lines.some(l => l.startsWith("Building the base: Power −3, +1 pip, habitat buried"))).toBe(true);
    expect(lines).toContain("Sunlight charged the batteries: Power +6.");
    expect(lines).toContain("The crew ate 1 Food.");
  });

  test("the debrief names what ran out and the card behind it", () => {
    // Starve the crew: no greenhouse, ever.
    let prev: TurnRecord | null = null;
    const history: TurnRecord[] = [];
    let ctx = startRun(1003, "botanist").ctx;
    while (!prev || prev.after.status === "playing") {
      const night = prev ? prev.after.turn % 2 === 1 : false;
      const r = playTurn(prev, { heater: night ? 1 : 0 }, prev ? 1 : 1);
      prev = r.rec; ctx = r.ctx; history.push(prev);
    }
    const d = buildDebrief(history, ctx);
    expect(prev.after.status).toBe("lost");
    expect(d.headline).toMatch(/ran out|badge|science/);
    expect(d.chain.length).toBeGreaterThan(0);
  });
});
