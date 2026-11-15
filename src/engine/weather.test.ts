/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { describe, expect, test } from "vitest";
import archiveText from "../data/donki.json?raw";
import oddsText from "../data/forecast-odds.json?raw";
import { RAW_CME, RAW_FLR, RAW_SEP } from "./__fixtures__/donkiRaw";
import { runMaker } from "./data";
import { buildArchive, EMPTY_ARCHIVE, loadArchive, normaliseSep, utcDay, type DonkiArchive } from "./donki";
import { buildForecastOdds, loadForecastOdds, oddsWarnings } from "./forecast";
import { resolveTurn } from "./rules";
import { isWinnable, QUICK_LIMIT } from "./solver";
import {
  archiveWeather, dayNum, dayStr, indexArchive, kidFraction, measureOdds, signTier, SIGN_DAYS, startDays, TURN_DAYS,
} from "./weather";

describe("cleaning up DONKI records", () => {
  const a = buildArchive({ sep: RAW_SEP, flr: RAW_FLR, cme: RAW_CME }, { start: "2024-01-01", end: "2026-12-31" }, "2026-11-15T00:00:00Z");

  test("only SEP events measured near Earth are storms, each counted once", () => {
    expect(a.storms.map(s => s.id)).toEqual(["2024-01-29T06:08:00-SEP-001", "2026-01-18T22:55:00-SEP-001"]);
    expect(a.storms[1]).toEqual({
      id: "2026-01-18T22:55:00-SEP-001", date: "2026-01-18",
      link: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/44041/-1", instrument: "GOES-P: SEISS >10 MeV",
    });
    expect(a.skipped).toEqual({ sepFarFromEarth: 1, sepModel: 1, sepNoInstrument: 0 });
  });

  test("an SEP seen by STEREO and SOHO at once counts, because SOHO is near Earth", () => {
    const both = { ...RAW_SEP[2], instruments: [{ displayName: "STEREO A: IMPACT 13-100 MeV" }, { displayName: "SOHO: COSTEP 15.8-39.8 MeV" }] };
    expect(normaliseSep(both)).toMatchObject({ instrument: "SOHO: COSTEP 15.8-39.8 MeV" });
  });

  test("flares keep M and X class only; the peak day wins, the start day if no peak", () => {
    expect(a.flares).toEqual([{ date: "2026-01-18", cls: "X1.9" }, { date: "2026-04-23", cls: "M1.6" }, { date: "2026-04-24", cls: "M2.0" }]);
  });

  test("CMEs keep the most accurate analysis of 500 km/s or more", () => {
    expect(a.cmes).toEqual([{ date: "2026-06-03", speed: 905 }, { date: "2026-06-06", speed: 1623 }]);
  });

  test("records outside the range are dropped", () => {
    const b = buildArchive({ sep: RAW_SEP, flr: RAW_FLR, cme: RAW_CME }, { start: "2026-01-01", end: "2026-03-31" }, "x");
    expect(b.storms.length).toBe(1);
    expect(b.flares.length).toBe(1);
    expect(b.cmes.length).toBe(0);
  });

  test("DONKI times become UTC days", () => {
    expect(utcDay("2026-01-18T22:55Z")).toBe("2026-01-18");
    expect(utcDay("yesterday")).toBeNull();
    expect(utcDay(null)).toBeNull();
  });

  test("loading: the empty file means practice weather, a broken file fails loudly", () => {
    expect(loadArchive(EMPTY_ARCHIVE)).toBeNull();
    expect(loadArchive(a)).toBe(a);
    expect(() => loadArchive({ ...a, storms: [{ id: "x", date: "2026-1-1", link: "https://x" }] })).toThrow(/bad storm/);
    expect(() => loadArchive({ ...a, range: { start: "2026-02-01", end: "2026-01-01" } })).toThrow(/bad range/);
  });
});

/** A one-year archive with storms, flares and CMEs on chosen days (day 0 = 2024-01-01). */
function archive(o: { storms?: number[]; x?: number[]; m?: number[]; cme?: [number, number][]; days?: number } = {}): DonkiArchive {
  const d0 = dayNum("2024-01-01");
  const day = (n: number) => dayStr(d0 + n);
  return {
    source: "test", fetched: "x", range: { start: day(0), end: day((o.days ?? 366) - 1) },
    storms: (o.storms ?? []).map(n => ({ id: `S${n}`, date: day(n), link: `https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/${n}/-1`, instrument: "GOES" })),
    flares: [...(o.x ?? []).map(n => ({ date: day(n), cls: "X1.0" })), ...(o.m ?? []).map(n => ({ date: day(n), cls: "M2.0" }))],
    cmes: (o.cme ?? []).map(([n, speed]) => ({ date: day(n), speed })),
  };
}

describe("real weather for a run", () => {
  test("the same seed always gets the same 16 weeks; seeds spread over the archive", () => {
    const a = archive({ storms: [40, 100, 200] });
    expect(archiveWeather(a, 7, 8)).toEqual(archiveWeather(a, 7, 8));
    const starts = new Set(Array.from({ length: 200 }, (_, s) => archiveWeather(a, s, 8).start));
    expect(starts.size).toBeGreaterThan(100);
  });

  test("a run never needs days outside the archive, including the week of signs before it", () => {
    const a = archive({ days: 140 });
    const ix = indexArchive(a);
    // 140 days: a week of signs, then 8 turns of 14 days → 140 − 7 − 112 + 1 = 22 start days.
    expect(startDays(ix, 8)).toEqual({ first: ix.start + SIGN_DAYS, last: ix.end - 8 * TURN_DAYS + 1, count: 22 });
    for (let s = 0; s < 300; s++) {
      const start = dayNum(archiveWeather(a, s, 8).start);
      expect(start - SIGN_DAYS).toBeGreaterThanOrEqual(ix.start);
      expect(start + 8 * TURN_DAYS - 1).toBeLessThanOrEqual(ix.end);
    }
    expect(() => archiveWeather(archive({ days: 100 }), 1, 8)).toThrow(/too short/);
  });

  test("a turn is a storm turn if a storm falls in its 14 days; two storms still make one", () => {
    // Find a seed whose run starts on day 30, then place storms relative to it.
    const base = archive();
    const seed = Array.from({ length: 5000 }, (_, s) => s).find(s => archiveWeather(base, s, 8).start === dayStr(dayNum("2024-01-01") + 30))!;
    expect(seed).toBeDefined();
    const a = archive({ storms: [30, 31, 44 + 13, 44 + 14] }); // turn 0 twice; turn 1 on its last day; turn 2 on its first day
    const w = archiveWeather(a, seed, 8).weather;
    expect(w.map(t => t.storm)).toEqual([true, true, true, false, false, false, false, false]);
    expect(w[0]).toMatchObject({ date: "2024-01-31", link: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/30/-1" });
    expect(w[3].date).toBeUndefined();
  });

  test("the forecast tier comes from warning signs in the 7 days before the turn", () => {
    const ix = (o: Parameters<typeof archive>[0]) => indexArchive(archive(o));
    const d = dayNum("2024-01-01") + 50;
    expect(signTier(ix({}), d - 7, d)).toBe("low");
    expect(signTier(ix({ m: [45] }), d - 7, d)).toBe("medium");
    expect(signTier(ix({ cme: [[49, 600]] }), d - 7, d)).toBe("medium");
    expect(signTier(ix({ cme: [[49, 499]] }), d - 7, d)).toBe("low");
    expect(signTier(ix({ x: [43] }), d - 7, d)).toBe("high");
    expect(signTier(ix({ m: [44], cme: [[46, 1200]] }), d - 7, d)).toBe("high");
    expect(signTier(ix({ x: [42] }), d - 7, d)).toBe("low");     // 8 days before: too early
    expect(signTier(ix({ x: [50] }), d - 7, d)).toBe("low");     // on the turn itself: too late to warn
  });

  test("measured odds count every day with a full week before and 14 days after", () => {
    // 30 days, an X flare on day 10, a storm on day 12.
    // Windows start on days 7–16 (a week before, 14 days after): 10 windows.
    // The flare is in the week before for starts 11–16: 6 high windows.
    // The storm is in the next 14 days for starts 7–12: 6 windows, 2 of them high (11, 12).
    const counts = measureOdds(archive({ days: 30, x: [10], storms: [12] }));
    expect(counts.low.windows + counts.medium.windows + counts.high.windows).toBe(10);
    expect(counts.high).toEqual({ windows: 6, withStorm: 2 });
    expect(counts.low).toEqual({ windows: 4, withStorm: 4 });
    expect(counts.medium).toEqual({ windows: 0, withStorm: 0 });
  });

  test("odds round to kid fractions, and tiny chances aren't rounded up", () => {
    expect(kidFraction(0.08)).toBe("1 in 10");
    expect(kidFraction(0.3)).toBe("1 in 3");
    expect(kidFraction(0.62)).toBe("2 in 3");
    expect(kidFraction(0.01)).toBe("less than 1 in 20");
  });

  test("forecast-odds.json: measured tiers with their counts, and warnings a reviewer should see", () => {
    const a = archive({ x: [100, 200], m: [50, 150, 250], storms: [103, 204, 155] });
    const odds = buildForecastOdds(a);
    expect(loadForecastOdds(odds)).toBe(odds);
    expect(odds.archive).toEqual(a.range);
    expect(odds.tiers!.high.chance).toBeGreaterThan(odds.tiers!.low.chance);
    expect(oddsWarnings(odds).some(w => /only \d+ windows/.test(w))).toBe(true);   // high has few windows in one year
    expect(oddsWarnings({ ...odds, tiers: { ...odds.tiers!, high: { ...odds.tiers!.high, chance: 0, windows: 999 } } }).join())
      .toMatch(/high .* less likely than medium/);
  });
});

describe("runs on real weather", () => {
  const a = archive({ storms: [20, 60, 61, 130, 170, 240, 300], x: [15, 165], m: [55, 125, 235, 295], cme: [[58, 800], [128, 1300]] });
  const make = runMaker(a);

  test("a run carries its window, storm dates and NASA links; the storm event names the date", () => {
    let found = false;
    for (let seed = 0; seed < 300 && !found; seed++) {
      const { state, ctx } = make(seed, "doctor");
      expect(ctx.weatherStart).toMatch(/^2024-/);
      const t = ctx.weather.findIndex(w => w.storm);
      if (t !== 0) continue;   // a storm on Turn 1 lets us resolve it straight away
      found = true;
      expect(ctx.weather[0].link).toMatch(/^https:\/\/kauai\.ccmc\.gsfc\.nasa\.gov\/DONKI\/view\/SEP\//);
      const plan = { heater: 0, greenhouse: 0, experiments: 0, shelter: true };
      const { events } = resolveTurn(state, ctx, plan, 0);
      expect(events).toContainEqual(expect.objectContaining({ type: "storm", date: ctx.weather[0].date }));
    }
    expect(found).toBe(true);
  });

  test("the run checker works on real weather", () => {
    const { state, ctx } = make(3, "botanist");
    expect(isWinnable(state, ctx, QUICK_LIMIT).winnable).not.toBeUndefined();
  });

  test("with no archive, runs keep practice weather (no dates)", () => {
    const { ctx } = runMaker(null)(3, "botanist");
    expect(ctx.weatherStart).toBeUndefined();
    expect(ctx.weather.every(w => w.date === undefined)).toBe(true);
  });
});

describe("the committed data files", () => {
  // Read as raw text: the test setup swaps the plain JSON imports for empty copies.
  const archiveFile = JSON.parse(archiveText);
  const oddsFile = JSON.parse(oddsText);

  test("donki.json is either the empty file or a valid archive long enough for a run", () => {
    const a = loadArchive(archiveFile);
    if (a) expect(startDays(indexArchive(a), 8).count).toBeGreaterThan(365);
  });

  test("forecast-odds.json was measured from the committed archive", () => {
    const odds = loadForecastOdds(oddsFile);
    const a = loadArchive(archiveFile);
    if (!a) expect(odds.tiers).toBeNull();
    else expect(odds).toEqual({ ...buildForecastOdds(a), _meta: odds._meta });
  });
});
