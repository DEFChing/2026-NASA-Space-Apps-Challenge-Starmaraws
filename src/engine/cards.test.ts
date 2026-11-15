/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { describe, expect, test } from "vitest";
import cardsJson from "../data/cards.json";
import { checkCards, kidOdds } from "./cardRules";
import { loadCards } from "./content";
import { moonCards, moonLevel } from "./data";
import { choicesFor, isDayTurn, resolveTurn } from "./rules";
import { newRun } from "./run";
import type { Card, Choice, DailyPlan, GameState, Specialist } from "./types";

/** A copy of one real card to break on purpose. */
const card = (id: string): Card => structuredClone(moonCards.find(c => c.id === id)!);
/** Problems for a single (broken) card, without the pile-count check. */
const check = (c: Card) => checkCards([c], { piles: null });

describe("the real cards", () => {
  test("all 18 pass every truth rule", () => {
    expect(moonCards).toHaveLength(18);
    expect(checkCards(moonCards)).toEqual([]);
  });

  test("ids follow the spec: B0, D1–D8, N1–N9", () => {
    const ids = moonCards.map(c => c.id);
    expect(ids).toEqual(["B0", ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => `D${n}`), ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `N${n}`)]);
  });

  test("specialist options sit on the cards the spec lists", () => {
    const of = (who: Specialist) => moonCards.filter(c => c.specialist?.who === who).map(c => c.id);
    expect(of("engineer")).toEqual(["D2", "D8", "N3", "N4"]);
    expect(of("botanist")).toEqual(["D3", "D5", "N2", "N7"]);
    expect(of("doctor")).toEqual(["D6", "N1", "N8"]);
  });

  test("the file carries its SI disclosure", () => {
    expect(cardsJson._meta.si.generated).toBe(true);
  });
});

describe("check-cards catches broken cards", () => {
  test("rule 1: no Power, Warmth or Food from nothing", () => {
    const d1 = card("D1");
    d1.options[0].effects = [{ res: "power", delta: 1 }, { stars: -1 }];
    expect(check(d1)).toContainEqual(expect.stringMatching(/D1 option A: adds Power/));
    const n9 = card("N9");
    n9.options[1].effects = [{ res: "warmth", delta: 1 }, { stars: -1 }];
    expect(check(n9)).toContainEqual(expect.stringMatching(/N9 option B: adds Warmth/));
    const d5 = card("D5");
    delete d5.options[0].effects[1].grows;
    expect(check(d5)).toContainEqual(expect.stringMatching(/D5 option A: adds Food without "grows" or "delivers"/));
  });

  test("rule 2: every option costs something", () => {
    const d3 = card("D3");
    delete d3.options[1].forgoesReward;
    expect(check(d3)).toContainEqual(expect.stringMatching(/D3 option B: costs nothing/));
    const n1 = card("N1");
    n1.specialist!.effects = [];
    expect(check(n1)).toContainEqual(expect.stringMatching(/N1 doctor option: costs nothing/));
    const d5 = card("D5");
    d5.options[1].effects = [{ stars: 1 }];
    expect(check(d5)).toContainEqual(expect.stringMatching(/forgoesReward means its only cost/));
  });

  test("rule 3: the two options aren't mirror images or copies", () => {
    const d1 = card("D1");
    d1.options = [
      { label: "A", effects: [{ res: "power", delta: -1 }, { res: "food", delta: 1, delivers: true }] },
      { label: "B", effects: [{ res: "power", delta: 1 }, { res: "food", delta: -1 }] },
    ];
    expect(check(d1)).toContainEqual("D1: options A and B are mirror images");
    const n1 = card("N1");
    n1.options[1] = { ...n1.options[0], label: "Same thing again" };
    expect(check(n1)).toContainEqual("N1: options A and B are the same");
  });

  test("rule 6: every card but the opener has an option with no Power cost now", () => {
    const n4 = card("N4");
    n4.options[0].effects = [{ res: "power", delta: -1 }];
    expect(check(n4)).toContainEqual("N4: needs an option with no Power cost right now (rule 6)");
    // A cost that lands later doesn't count against rule 6 (N5 option B).
    expect(check(card("N5"))).toEqual([]);
  });

  test("rule 5: gambles use kid fractions", () => {
    const n6 = card("N6");
    n6.options[1].gamble!.chance = 0.37;
    expect(check(n6)).toContainEqual(expect.stringMatching(/isn't a kid fraction/));
    n6.options[1].gamble!.chance = 1.2;
    expect(check(n6)).toContainEqual(expect.stringMatching(/between 0 and 1/));
    expect([0.5, 0.3333, 0.25, 0.1].map(kidOdds)).toEqual(["1 in 2", "1 in 3", "1 in 4", "1 in 10"]);
    expect(kidOdds(0.37)).toBeNull();
  });

  test("pile counts, ids and specialist names", () => {
    expect(checkCards(moonCards.filter(c => c.id !== "N9"))).toContainEqual("the night pile has 8 cards, expected 9");
    expect(() => loadCards({ cards: [card("D1"), card("D1")] })).toThrow(/"D1" is missing or repeated/);
    const n2 = card("N2");
    (n2.specialist as { who: string }).who = "pilot";
    expect(() => loadCards({ cards: [n2] })).toThrow(/unknown specialist "pilot"/);
    const d2 = card("D2");
    (d2 as { pile: string }).pile = "dusk";
    expect(() => loadCards({ cards: [d2] })).toThrow(/pile must be opener, day or night/);
  });

  test("rule 4: every card has a real basis and an https source", () => {
    const d7 = card("D7");
    d7.realBasis = "";
    d7.sources = [{ label: "NASA", url: "http://www.nasa.gov" }];
    const problems = check(d7);
    expect(problems).toContainEqual("D7: needs a one-line realBasis for the debrief");
    expect(problems).toContainEqual(expect.stringMatching(/D7: source "NASA" needs a label and an https:\/\/ link/));
  });
});

describe("cards in play", () => {
  const plan = (p: Partial<DailyPlan> = {}): DailyPlan =>
    ({ heater: 0, greenhouse: 0, experiments: 0, shelter: false, ...p });

  test("D5's garden grows Food 2 turns later", () => {
    const { state, ctx } = newRun({ level: moonLevel, cards: moonCards, seed: 3, specialist: "doctor" });
    state.deck = ["B0", "N1", "D5", "N2", "D1", "N3", "D2", "N4"];
    let s = resolveTurn(state, ctx, plan(), 1).state;
    s = resolveTurn(s, ctx, plan({ heater: 1 }), 1).state;
    s = resolveTurn(s, ctx, plan(), 0).state;               // Turn 3: plant it
    const food = s.res.food;
    s = resolveTurn(s, ctx, plan({ heater: 1 }), 0).state;  // Turn 4: N2 A, nothing yet
    expect(s.res.food).toBe(food - 1);
    const r = resolveTurn(s, ctx, plan(), 0);               // Turn 5: +2 lands
    expect(r.events).toContainEqual({ type: "delayed", cause: "D5", fromTurn: 2 });
    expect(r.state.res.food).toBe(food - 1 - 1 + 2);
  });

  /** A simple steady player: hold Warmth and Food, spend the rest on science, keep 2 spare. Not a good player. */
  function steadyTurn(s: GameState, ctx: ReturnType<typeof newRun>["ctx"]) {
    const day = isDayTurn(moonLevel, s.turn);
    const storm = ctx.weather[s.turn].storm;
    const insulated = s.flags.includes("buried") || s.flags.includes("sandbagged");
    const p = plan({
      heater: day ? 0 : Math.min(insulated ? 1 : 2, s.res.power),
      shelter: storm && s.res.power >= 4,
    });
    let spare = s.res.power - p.heater - (p.shelter ? (s.flags.includes("cave") ? 0 : 2) : 0);
    p.greenhouse = Math.min(s.res.food <= 4 ? 2 : 1, Math.max(0, spare - (s.turn === 0 ? 3 : 0)));
    spare -= p.greenhouse;
    const keep = s.turn === 0 ? 3 : 2;
    p.experiments = Math.max(0, Math.floor((spare - keep) / 2) * 2);
    const options = choicesFor(s, ctx, p).filter(c => c.affordable);
    const pick: Choice = s.turn === 0 ? 0 : (options.find(c => c.choice === "specialist") ?? options.find(c => c.cost === 0) ?? options[0]).choice;
    return resolveTurn(s, ctx, p, pick);
  }

  test("seeded runs with the real cards play through all 8 turns for every specialist", () => {
    const outcomes = { won: 0, lost: 0 };
    for (const specialist of ["engineer", "botanist", "doctor"] as const) {
      for (let seed = 0; seed < 30; seed++) {
        let { state, ctx } = newRun({ level: moonLevel, cards: moonCards, seed, specialist });
        let turns = 0;
        while (state.status === "playing") { state = steadyTurn(state, ctx).state; turns++; }
        expect(turns).toBeLessThanOrEqual(8);
        if (state.status === "won") expect(turns).toBe(8);
        outcomes[state.status]++;
      }
    }
    // This player is deliberately simple (it takes the first free option, even one that
    // costs a Star or a pip), so this only checks that both endings happen. Win rates
    // and difficulty come from the run checker in Step 3.
    expect(outcomes.won).toBeGreaterThan(0);
    expect(outcomes.lost).toBeGreaterThan(0);
  });
});
