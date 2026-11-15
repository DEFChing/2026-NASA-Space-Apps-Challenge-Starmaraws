/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { describe, expect, test } from "vitest";
import levelJson from "../data/moon.level.json";
import { loadCards, loadLevel } from "./content";
import {
  badgeColour, choicesFor, isDayTurn, planProblem, resolveTurn, shelterCost, sunlightOn,
} from "./rules";
import { newRun, placeholderWeather } from "./run";
import { moonTestCards } from "./testCards";
import type { Choice, Ctx, DailyPlan, GameEvent, GameState, Specialist, WeatherTurn } from "./types";

const level = loadLevel(levelJson, "moon.level.json");
const cards = loadCards({ cards: moonTestCards }, "testCards");
const CALM: WeatherTurn[] = Array.from({ length: 8 }, () => ({ storm: false, forecast: "low" }));
const DECK = ["B0", "N1", "D3", "N5", "D4", "N3", "D8", "N7"];

/** A run with a fixed deck and weather, so each test controls exactly what happens. */
function setup(opts: { deck?: string[]; storms?: number[]; specialist?: Specialist; seed?: number } = {}) {
  const weather = CALM.map((w, t) => ({ ...w, storm: (opts.storms ?? []).includes(t) }));
  const { state, ctx } = newRun({ level, cards, seed: opts.seed ?? 1, specialist: opts.specialist ?? "engineer", weather });
  state.deck = opts.deck ?? DECK;
  return { state, ctx };
}

const plan = (p: Partial<DailyPlan> = {}): DailyPlan =>
  ({ heater: 0, greenhouse: 0, experiments: 0, shelter: false, ...p });

/** Play a turn with gambles forced to fail (the run checker's view). */
function play(s: GameState, ctx: Ctx, p: Partial<DailyPlan>, choice: Choice, gambles: "roll" | "fail" = "fail") {
  return resolveTurn(s, ctx, plan(p), choice, { gambles });
}

/** Skip ahead: play turns with the given plans and choices. */
function playAll(s: GameState, ctx: Ctx, turns: [Partial<DailyPlan>, Choice][]) {
  for (const [p, c] of turns) s = play(s, ctx, p, c).state;
  return s;
}

const resEvents = (ev: GameEvent[], cause: string) =>
  ev.filter((e): e is Extract<GameEvent, { type: "res" }> => e.type === "res" && e.cause === cause);

describe("level and card files", () => {
  test("the level file loads with Day and Night turns alternating from a Day", () => {
    expect(level.turns).toBe(8);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(t => isDayTurn(level, t)))
      .toEqual([true, false, true, false, true, false, true, false]);
  });

  test("a broken level file is rejected with a clear message", () => {
    const bad = structuredClone(levelJson);
    bad.level.piles.night = [1, 3, 5];
    expect(() => loadLevel(bad, "bad.json")).toThrow(/bad.json: piles must cover all 8 turns/);
    expect(() => loadLevel({ id: "moon" })).toThrow(/expected/);
  });

  test("a card with no zero-Power option is rejected (rule 6)", () => {
    const n1 = structuredClone(moonTestCards.find(c => c.id === "N1")!);
    n1.options[1].effects = [{ res: "power", delta: -1 }];
    expect(() => loadCards({ cards: [n1] })).toThrow(/N1: needs an option with no Power cost/);
  });

  test("cards can't create Power or Warmth (truth rules)", () => {
    const d3 = structuredClone(moonTestCards.find(c => c.id === "D3")!);
    d3.options[1].effects = [{ res: "power", delta: 2 }];
    expect(() => loadCards({ cards: [d3] })).toThrow(/Power only comes from sunlight/);
  });
});

describe("turn order", () => {
  test("split, card, sunlight, upkeep, storm, delayed effects, checks", () => {
    // Turn 2 plays N5 option B, so its delayed Star and Power cost land on Turn 3,
    // which also has a storm. Turn 3 then touches every step.
    let { state, ctx } = setup({ storms: [2], deck: ["B0", "N5", "D3", "N1", "D4", "N3", "D8", "N7"] });
    state = playAll(state, ctx, [[{ greenhouse: 1 }, 1], [{ heater: 1, greenhouse: 1 }, 1]]);
    const { events } = play(state, ctx, { greenhouse: 1, experiments: 2, shelter: true }, 0); // D3 option A
    const step = (e: GameEvent): number => {
      if (e.type === "starsBlocked") return 1;
      if (e.type === "storm") return 5;
      if (e.type === "delayed") return 6;
      if (e.type === "warning" || e.type === "emergency" || e.type === "recovered" || e.type === "end") return 7;
      const cause = "cause" in e ? e.cause : "";
      const map: Record<string, number> = {
        split: 1, greenhouse: 1, experiments: 1, D3: 2, sunlight: 3,
        upkeep: 4, sunWarmth: 4, nightCold: 4, drip: 4, storm: 5, N5: 6,
      };
      return map[cause] ?? -1;
    };
    const steps = events.map(step);
    expect(steps).not.toContain(-1);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    for (const n of [1, 2, 3, 4, 5, 6]) expect(steps).toContain(n);
  });

  test("resolveTurn never changes the state it was given", () => {
    const { state, ctx } = setup();
    const before = structuredClone(state);
    play(state, ctx, { greenhouse: 1, experiments: 2 }, 0);
    expect(state).toEqual(before);
  });
});

describe("Day and Night", () => {
  test("Day: sunlight adds Power +6 and Warmth +2", () => {
    const { state, ctx } = setup();
    state.res = { power: 3, warmth: 5, food: 6 };
    const { state: s } = play(state, ctx, {}, 1);              // B0 sandbag: Power −1
    expect(s.res.power).toBe(3 - 1 + 6);
    expect(s.res.warmth).toBe(5 + 2);
  });

  test("the Heater is Night only: Day splits can't put cells in it", () => {
    const { state, ctx } = setup();
    expect(planProblem(state, ctx, plan({ heater: 1 }))).toMatch(/Heater isn't needed by day/);
    expect(() => play(state, ctx, { heater: 1 }, 1)).toThrow(/Heater isn't needed by day/);
  });

  test("Night: Warmth −2, each Heater cell cancels 1, never above where it started", () => {
    const fresh = setup();
    fresh.state.turn = 1; fresh.state.res.warmth = 6;          // Turn 2 (Night), no upgrades
    const warmthAfter = (heater: number) =>
      play(fresh.state, fresh.ctx, { heater }, 1).state.res.warmth; // N1 B: Warmth −1
    expect(warmthAfter(0)).toBe(6 - 1 - 2);
    expect(warmthAfter(1)).toBe(6 - 1 - 1);
    expect(warmthAfter(2)).toBe(6 - 1);
  });

  test("Night loses only 1 Warmth once buried or sandbagged", () => {
    for (const flag of ["buried", "sandbagged"] as const) {
      const { state, ctx } = setup();
      state.turn = 1; state.flags = [flag];
      const s = play(state, ctx, {}, 0).state;                  // N1 A: Power −2
      expect(s.res.warmth).toBe(8 - 1);
      expect(play(state, ctx, { heater: 2 }, 0).state.res.warmth).toBe(8); // 2nd cell wasted
    }
  });

  test("Food −1 every turn; each Greenhouse cell adds Food +1", () => {
    const { state, ctx } = setup();
    expect(play(state, ctx, {}, 1).state.res.food).toBe(5);
    expect(play(state, ctx, { greenhouse: 1 }, 1).state.res.food).toBe(6);
    expect(play(state, ctx, { greenhouse: 2 }, 1).state.res.food).toBe(7);
  });

  test("bars never go above 10", () => {
    const { state, ctx } = setup();
    state.res = { power: 10, warmth: 10, food: 10 };
    const s = play(state, ctx, { greenhouse: 2 }, 1).state;
    // Greenhouse food is wasted at 10, then the crew eats 1; sunlight and warming cap at 10.
    expect(s.res).toEqual({ power: 10, warmth: 10, food: 9 });
  });
});

describe("radiation", () => {
  test("the drip is +1 a turn, and only on Night turns once buried", () => {
    let { state, ctx } = setup();
    state = play(state, ctx, {}, 1).state;                     // T1 Day, sandbagged: drip
    expect(state.badge).toBe(1);
    ({ state, ctx } = setup());
    state = play(state, ctx, {}, 0).state;                     // T1 Day, bury: +1 work, no drip
    expect(state.badge).toBe(1);
    state = play(state, ctx, { heater: 1 }, 1).state;          // T2 Night: drip
    expect(state.badge).toBe(2);
    state = play(state, ctx, {}, 1).state;                     // T3 Day: no drip
    expect(state.badge).toBe(2);
  });

  test("badge colours follow the traffic light", () => {
    expect([0, 5, 6, 9, 10, 11].map(badgeColour)).toEqual(["green", "green", "yellow", "yellow", "red", "red"]);
  });
});

describe("storms and the shelter", () => {
  test("in the open: +5 pips; sheltered: +1 pip for 2 cells", () => {
    const { state, ctx } = setup({ storms: [0] });
    state.res.power = 5;
    const open = play(state, ctx, {}, 1);
    expect(open.events).toContainEqual({ type: "storm", sheltered: false, pips: 5, date: undefined });
    expect(open.state.badge).toBe(5 + 1);                       // storm + drip
    const sheltered = play(state, ctx, { shelter: true }, 1);
    expect(sheltered.state.badge).toBe(1 + 1);
    expect(sheltered.state.res.power).toBe(5 - 2 - 1 + 6);      // shelter, sandbag, sunlight
  });

  test("sheltering stops Experiment Stars that turn", () => {
    const { state, ctx } = setup({ storms: [0] });
    const r = play(state, ctx, { experiments: 2, shelter: true }, 1);
    expect(r.state.stars).toBe(0);
    expect(r.events).toContainEqual({ type: "starsBlocked", amount: 1, why: "shelter" });
  });

  test("the cave makes the shelter free", () => {
    const { state, ctx } = setup({ storms: [0] });
    state.flags = ["cave"];
    expect(shelterCost(state, level)).toBe(0);
    const r = play(state, ctx, { shelter: true }, 1);           // 0 cells, then sandbag −1
    expect(resEvents(r.events, "split")).toHaveLength(0);
    expect(r.state.res.power).toBe(10);                         // 7 + 6 sunlight, capped at 10
    expect(r.state.badge).toBe(1 + 1);
  });

  test("Shelter cells are only allowed on storm turns", () => {
    const { state, ctx } = setup();
    expect(planProblem(state, ctx, plan({ shelter: true }))).toMatch(/only opens when a storm alert/);
    expect(() => play(state, ctx, { shelter: true }, 1)).toThrow(/storm alert/);
  });
});

describe("the power split", () => {
  test("a split can't spend more than the battery or break slot limits", () => {
    const { state, ctx } = setup();
    expect(planProblem(state, ctx, plan({ experiments: 10 }))).toMatch(/needs 10 cells, but the battery has 8/);
    expect(planProblem(state, ctx, plan({ heater: 3 }))).toMatch(/Heater takes at most 2/);
    expect(planProblem(state, ctx, plan({ greenhouse: 3 }))).toMatch(/Greenhouse takes at most 2/);
    expect(planProblem(state, ctx, plan({ experiments: 1.5 }))).toMatch(/whole number/);
    expect(planProblem(state, ctx, plan({ greenhouse: 2, experiments: 4 }))).toBeNull();
  });

  test("Experiments: every 2 cells earn +1 Star", () => {
    const { state, ctx } = setup();
    expect(play(state, ctx, { experiments: 2 }, 1).state.stars).toBe(1);
    expect(play(state, ctx, { experiments: 5 }, 1).state.stars).toBe(2);
  });

  test("the opener can't be left unanswerable: the split must keep a cell for it", () => {
    const { state, ctx } = setup();
    expect(planProblem(state, ctx, plan({ experiments: 8 }))).toMatch(/Keep at least 1 cells for "Building the base"/);
  });
});

describe("card options", () => {
  test("options the battery can't pay for after the split are locked and rejected", () => {
    const { state, ctx } = setup();
    const locked = choicesFor(state, ctx, plan({ experiments: 6 }));  // 2 spare
    expect(locked.map(c => [c.choice, c.affordable])).toEqual([[0, false], [1, true]]);
    expect(locked[0].reason).toBe("Needs 3 Power. You kept 2 spare.");
    expect(() => play(state, ctx, { experiments: 6 }, 0)).toThrow(/B0: needs 3 Power, only 2 left/);
  });

  test("the specialist option only exists for the picked specialist", () => {
    const eng = setup({ specialist: "engineer", deck: ["B0", "N3", "D2", "N1", "D3", "N5", "D8", "N7"] });
    const s = play(eng.state, eng.ctx, {}, 1).state;            // to Turn 2: N3, Power 10
    expect(choicesFor(s, eng.ctx, plan()).map(c => c.choice)).toEqual([0, 1, "specialist"]);
    expect(play(s, eng.ctx, {}, "specialist").state.res.power).toBe(10 - 1);

    const doc = setup({ specialist: "doctor", deck: eng.state.deck });
    const d = play(doc.state, doc.ctx, {}, 1).state;
    expect(choicesFor(d, doc.ctx, plan()).map(c => c.choice)).toEqual([0, 1]);
    expect(() => play(d, doc.ctx, {}, "specialist")).toThrow(/no "specialist" option for the doctor/);
  });

  test("gambles follow the seeded roll, or always fail for the run checker", () => {
    const { state, ctx } = setup({ deck: ["B0", "N3", "D2", "N1", "D3", "N5", "D8", "N7"] });
    const s = play(state, ctx, {}, 1).state;                    // Turn 2: N3, option B gambles
    s.rolls[1] = 0.9;                                           // above 1 in 3: no crack
    expect(play(s, ctx, { heater: 2 }, 1, "roll").events).toContainEqual({ type: "gamble", cardId: "N3", failed: false });
    s.rolls[1] = 0.1;
    expect(play(s, ctx, { heater: 2 }, 1, "roll").events).toContainEqual({ type: "gamble", cardId: "N3", failed: true });
    expect(play(s, ctx, { heater: 2 }, 1, "fail").events).toContainEqual({ type: "gamble", cardId: "N3", failed: true });
  });
});

describe("delayed effects", () => {
  test("'next turn' effects land at step 6 and name the turn they came from", () => {
    let { state, ctx } = setup({ deck: ["B0", "N5", "D3", "N1", "D4", "N3", "D8", "N7"] });
    state = playAll(state, ctx, [[{}, 1], [{ heater: 1 }, 1]]); // N5 B: +1 Star now, +1 and Power −1 later
    expect(state.stars).toBe(1);
    const r = play(state, ctx, {}, 1);
    expect(r.events).toContainEqual({ type: "delayed", cause: "N5", fromTurn: 1 });
    expect(r.state.stars).toBe(2);
  });

  test("'every Day turn left' lands on this and each later Day turn", () => {
    let { state, ctx } = setup({ deck: ["B0", "N1", "D2", "N3", "D3", "N5", "D4", "N7"] });
    state = playAll(state, ctx, [[{}, 1], [{ heater: 1 }, 1]]);
    const t3 = play(state, ctx, {}, 1);                         // D2 B on Turn 3
    expect(resEvents(t3.events, "D2")).toHaveLength(1);
    expect(t3.state.pending.map(p => p.due)).toEqual([4, 6]);
  });

  test("a sunlight change lasts the rest of the mission", () => {
    let { state, ctx } = setup({ deck: ["B0", "N1", "D8", "N3", "D3", "N5", "D4", "N7"] });
    state = playAll(state, ctx, [[{}, 1], [{ heater: 1 }, 1]]);
    state = play(state, ctx, {}, 1).state;                      // D8 B: sunlight −1
    expect(sunlightOn(state, level, 4)).toBe(5);
    expect(sunlightOn(state, level, 5)).toBe(0);                // Night is 0 anyway
  });

  test("forTurns repeats on turns in a row (moonquake crack: this turn and next)", () => {
    let { state, ctx } = setup({ deck: ["B0", "N3", "D2", "N1", "D3", "N5", "D4", "N7"] });
    state = play(state, ctx, {}, 1).state;
    const r = play(state, ctx, { heater: 1 }, 1);               // gamble fails
    expect(resEvents(r.events, "N3")).toHaveLength(1);
    expect(r.state.pending).toEqual([{ due: 2, effect: { res: "warmth", delta: -1 }, cause: "N3", fromTurn: 1 }]);
  });
});

describe("warning zone, emergency turn and the badge limit", () => {
  test("a bar at 1–2 at the start of a turn blocks Experiment Stars, not card Stars", () => {
    const { state, ctx } = setup({ deck: ["B0", "N5", "D3", "N1", "D4", "N3", "D8", "N7"] });
    state.turn = 1; state.res.food = 2;
    const r = play(state, ctx, { greenhouse: 2, experiments: 2 }, 0); // N5 A: +2 Stars
    expect(r.events).toContainEqual({ type: "starsBlocked", amount: 1, why: "strained" });
    expect(r.state.stars).toBe(2);
  });

  test("the first 0 gives one turn to recover", () => {
    const { state, ctx } = setup();
    state.res.food = 1;
    const r1 = play(state, ctx, {}, 1);                         // Food 1 → 0
    expect(r1.events).toContainEqual({ type: "emergency", res: "food" });
    expect(r1.state.status).toBe("playing");
    const r2 = play(r1.state, ctx, { heater: 1, greenhouse: 2 }, 1);
    expect(r2.events).toContainEqual({ type: "recovered", res: "food" });
    expect(r2.state.res.food).toBe(1);
  });

  test("still 0 after the emergency turn loses", () => {
    const { state, ctx } = setup();
    state.res.food = 1;
    const s = play(state, ctx, {}, 1).state;
    const r = play(s, ctx, { heater: 1, greenhouse: 1 }, 1);
    expect(r.state.status).toBe("lost");
    expect(r.state.lostBy).toBe("food");
  });

  test("hitting 0 a second time loses", () => {
    const { state, ctx } = setup();
    state.usedEmergency = ["food"]; state.res.food = 1;
    const r = play(state, ctx, {}, 1);
    expect(r.state.lostBy).toBe("food");
  });

  test("0 on the last turn loses", () => {
    const { state, ctx } = setup();
    state.turn = 7; state.res.food = 1; state.stars = 9;
    const r = play(state, ctx, { heater: 2 }, 0);               // N7 A: Food −2
    expect(r.state.status).toBe("lost");
    expect(r.state.lostBy).toBe("food");
  });

  test("12 pips loses straight away", () => {
    let { state, ctx } = setup({ storms: [1, 2] });
    state = play(state, ctx, {}, 1).state;                      // drip 1
    state = play(state, ctx, { heater: 1 }, 1).state;           // storm in the open: 1 + 1 + 5
    expect(state.badge).toBe(7);
    const r = play(state, ctx, {}, 1);                          // drip + storm: 13
    expect(r.state.status).toBe("lost");
    expect(r.state.lostBy).toBe("badge");
    expect(r.state.turn).toBe(3);
  });
});

describe("Stars", () => {
  test("Stars can go below 0", () => {
    const { state, ctx } = setup({ deck: ["B0", "N3", "D2", "N1", "D3", "N5", "D4", "N7"] });
    const s = play(state, ctx, {}, 1).state;
    expect(play(s, ctx, { heater: 1 }, 0).state.stars).toBe(-1); // N3 A: −1 Star
  });
});

describe("seeded runs", () => {
  test("the same seed gives the same deck, storm turns and rolls", () => {
    const a = newRun({ level, cards, seed: 42, specialist: "botanist" });
    const b = newRun({ level, cards, seed: 42, specialist: "botanist" });
    expect(b.state.deck).toEqual(a.state.deck);
    expect(b.state.reserve).toEqual(a.state.reserve);
    expect(b.state.rolls).toEqual(a.state.rolls);
    expect(b.ctx.weather).toEqual(a.ctx.weather);
  });

  test("decks follow the piles: opener on Turn 1, Day and Night cards on their turns", () => {
    for (let seed = 0; seed < 50; seed++) {
      const { state, ctx } = newRun({ level, cards, seed, specialist: "doctor" });
      expect(state.deck[0]).toBe("B0");
      state.deck.forEach((id, t) => {
        const pile = ctx.cards[id].pile;
        expect(pile).toBe(t === 0 ? "opener" : isDayTurn(level, t) ? "day" : "night");
      });
      expect(new Set(state.deck).size).toBe(8);
      expect(state.reserve.day.length + state.reserve.night.length).toBe(cards.length - 8);
    }
  });

  test("different seeds give different runs", () => {
    const decks = new Set(Array.from({ length: 20 }, (_, seed) =>
      newRun({ level, cards, seed, specialist: "engineer" }).state.deck.join()));
    expect(decks.size).toBeGreaterThan(5);
  });

  test("the placeholder weather has storms on some turns, not all", () => {
    const storms = Array.from({ length: 200 }, (_, seed) => placeholderWeather(seed, 8))
      .flat().filter(w => w.storm).length;
    expect(storms / 1600).toBeGreaterThan(0.1);
    expect(storms / 1600).toBeLessThan(0.45);
  });
});

describe("a scripted 8-turn run", () => {
  const script: [Partial<DailyPlan>, Choice][] = [
    [{ greenhouse: 1, experiments: 4 }, 0],          // T1 Day   B0: bury
    [{ heater: 1, greenhouse: 1, experiments: 2 }, 1], // T2 Night N1: bundle up
    [{ greenhouse: 1 }, 1],                          // T3 Day   D3: keep the power
    [{ heater: 1, greenhouse: 1, experiments: 2 }, 0], // T4 Night N5: live call
    [{ greenhouse: 1 }, 0],                          // T5 Day   D4: rappel, unlock cave
    [{ heater: 1, greenhouse: 2, experiments: 2 }, 1], // T6 Night N3: keep working (crack)
    [{ greenhouse: 1 }, 1],                          // T7 Day   D8: live with it
    [{ heater: 1, greenhouse: 1, experiments: 2 }, 0], // T8 Night N7: pull the plants
  ];

  test("good planning wins", () => {
    const { state, ctx } = setup();
    const end = playAll(state, ctx, script);
    expect(end.status).toBe("won");
    expect(end.stars).toBe(10);
    expect(end.badge).toBe(6);
    expect(end.res).toEqual({ power: 1, warmth: 9, food: 4 });
  });

  test("skipping the greenhouse runs out of food", () => {
    const { state, ctx } = setup();
    let s = state;
    for (const [p, c] of script) {
      if (s.status !== "playing") break;
      s = play(s, ctx, { ...p, greenhouse: 0 }, c).state;
    }
    expect(s.status).toBe("lost");
    expect(s.lostBy).toBe("food");
  });

  test("a safe run with too little science misses the star target", () => {
    const { state, ctx } = setup();
    const end = playAll(state, ctx, script.map(([p, c]) => [{ ...p, experiments: 0 }, c]));
    expect(end.status).toBe("lost");
    expect(end.lostBy).toBe("stars");
  });
});
