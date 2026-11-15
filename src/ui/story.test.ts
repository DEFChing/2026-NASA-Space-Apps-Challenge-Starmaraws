/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { describe, expect, test } from "vitest";
import { startRun } from "../engine/data";
import { resolveTurn } from "../engine/rules";
import { isWinnable } from "../engine/solver";
import type { Ctx, GameState } from "../engine/types";
import { dialogue, endingFor, loadDialogue, OUTCOMES, outcomeOf, pickLine } from "./story";
import type { TurnRecord } from "./text";

/** Play a list of moves from a fresh run and keep the records the store would keep. */
function play(seed: number, moves: { plan: TurnRecord["plan"]; choice: TurnRecord["choice"] }[]): { history: TurnRecord[]; ctx: Ctx } {
  let { state, ctx } = startRun(seed, "botanist");
  const history: TurnRecord[] = [];
  for (const m of moves) {
    if (state.status !== "playing") break;
    const { state: after, events } = resolveTurn(state, ctx, m.plan, m.choice);
    history.push({ turn: state.turn, cardId: state.deck[state.turn], plan: m.plan, choice: m.choice, events, after, locked: [] });
    state = after;
  }
  return { history, ctx };
}
const idle = { heater: 0, greenhouse: 0, experiments: 0, shelter: false };

/** Change how the last record ended, keeping the events (for outcomes that are slow to reach in play). */
function endAs(h: TurnRecord[], end: Partial<GameState>): TurnRecord[] {
  const last = h[h.length - 1];
  return [...h.slice(0, -1), { ...last, after: { ...last.after, ...end } }];
}

describe("dialogue.json", () => {
  test("every outcome has lines, and each has at least one line with no blanks to fill", () => {
    for (const o of OUTCOMES) {
      expect(dialogue[o].length).toBeGreaterThanOrEqual(3);
      expect(dialogue[o].some(l => !/\{\w+\}/.test(l))).toBe(true);
    }
  });

  test("a missing outcome or an unknown blank fails loudly", () => {
    expect(() => loadDialogue({ dialogue: [] })).toThrow(/"first_run" needs at least 2 lines/);
    const all = OUTCOMES.map(outcome => ({ outcome, lines: ["a", "b"] }));
    expect(() => loadDialogue({ dialogue: [...all.slice(1), { outcome: "first_run", lines: ["a", "Hi {name}"] }] })).toThrow(/unknown blank \{name\}/);
    expect(() => loadDialogue({ dialogue: [...all, { outcome: "lost_moon", lines: ["a", "b"] }] })).toThrow(/unknown outcome/);
  });
});

describe("picking Amara's line", () => {
  test("fills the blanks from the run", () => {
    const l = pickLine(dialogue, "lost_power", [], { turn: "5", card: "Moonquake" }, 0);
    expect(l).toEqual({ id: "lost_power:0", text: expect.stringMatching(/^The batteries ran dry on turn 5\./) });
    expect(pickLine(dialogue, "lost_power", [], { turn: "5", card: "Moonquake" }, 2).text).toBe("Moonquake drained more than it looked.");
  });

  test("never picks a line whose blanks this run can't fill", () => {
    for (let seed = 0; seed < 10; seed++) {
      expect(pickLine(dialogue, "lost_badge", [], {}, seed).text).not.toMatch(/\{|turn/);
    }
  });

  test("avoids the lines shown in the last runs, unless nothing else fits", () => {
    const recent = ["win_clean:0", "win_clean:1"];
    for (let seed = 0; seed < 6; seed++) expect(pickLine(dialogue, "win_clean", recent, {}, seed).id).toBe("win_clean:2");
    expect(pickLine(dialogue, "win_clean", ["win_clean:0", "win_clean:1", "win_clean:2"], {}, 4).id).toMatch(/^win_clean:/);
  });
});

describe("how the run ended", () => {
  test("a win is clean or close, and Amara smiles", () => {
    const { state, ctx } = startRun(1003, "botanist");
    const { history } = play(1003, isWinnable(state, ctx).path);
    const { outcome, fill } = outcomeOf(history, ctx, 3);
    expect(outcome).toMatch(/^win_(clean|close)$/);
    expect(fill.resource).toMatch(/^(power|warmth|food)$/);
    expect(endingFor(history, ctx, 3, []).mood).toBe("smile");
  });

  test("never planting runs out of food: first run gets a first-run line, later runs a food line", () => {
    const { history, ctx } = play(1003, Array.from({ length: 8 }, (_, t) => ({ plan: { ...idle, heater: t % 2 ? 2 : 0 }, choice: 0 as const })));
    const end = history[history.length - 1].after;
    expect(end.status).toBe("lost");
    expect(outcomeOf(history, ctx, 0).outcome).toBe("first_run");
    const later = outcomeOf(history, ctx, 2);
    expect(later.outcome).toBe(`lost_${end.lostBy}`);
    if (end.lostBy !== "badge" && end.lostBy !== "stars") expect(later.fill.turn).toMatch(/^\d$/);
    expect(endingFor(history, ctx, 2, []).mood).toBe("thoughtful");
  });

  test("safe but short of Stars, and a full badge naming the turn the forecast warned about", () => {
    const { history, ctx } = play(1003, [{ plan: idle, choice: 0 }, { plan: idle, choice: 0 }]);
    expect(outcomeOf(endAs(history, { status: "lost", lostBy: "stars" }), ctx, 1).outcome).toBe("safe_no_stars");
    const stormy = history.map((r, i) => (i === 1 ? { ...r, events: [...r.events, { type: "storm" as const, sheltered: false, pips: 5 }] } : r));
    const badge = outcomeOf(endAs(stormy, { status: "lost", lostBy: "badge" }), ctx, 1);
    expect(badge).toMatchObject({ outcome: "lost_badge", fill: { turn: "1" } });
  });
});
