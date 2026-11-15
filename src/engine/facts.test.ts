/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Datasets } from "../ui/Datasets";
import { factTagsFor } from "../ui/Debrief";
import { formatDate, realStormLine, reportLines, worthSheltering } from "../ui/text";
import { moonCards, moonCredits, moonFacts, startRun } from "./data";
import { buildArchive, EMPTY_ARCHIVE } from "./donki";
import { checkCredits, checkFacts, creditsFromCsv, parseCsv, pickFact, type Fact } from "./facts";
import { buildForecastOdds, loadForecastOdds } from "./forecast";
import { RAW_CME, RAW_FLR, RAW_SEP } from "./__fixtures__/donkiRaw";
import oddsEmpty from "./__fixtures__/forecast-odds-empty.json";

const fact = (id: string, tags: Fact["tags"]): Fact => ({
  id, text: `Fact ${id}.`, tags, source: { name: "NASA OSDR", url: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-1", refId: "OSD-1" },
});

describe("facts", () => {
  test("every fact needs text, a known tag, an https link and a reference ID", () => {
    expect(checkFacts({ facts: [fact("a", ["radiation"])] }).problems).toEqual([]);
    const bad = checkFacts({ facts: [
      { id: "b", text: "", tags: ["moods"], source: { name: "", url: "http://x", refId: "" } },
      fact("c", ["food"]), fact("c", ["food"]),
    ] }).problems.join("\n");
    expect(bad).toMatch(/b: needs text/);
    expect(bad).toMatch(/unknown tag "moods"/);
    expect(bad).toMatch(/https link/);
    expect(bad).toMatch(/reference ID/);
    expect(bad).toMatch(/c: id used twice/);
    expect(checkFacts({}).problems[0]).toMatch(/needs a "facts" list/);
  });

  test("the debrief picks a fact about what mattered, then a general one, the same for the same seed", () => {
    const facts = [fact("r1", ["radiation"]), fact("r2", ["radiation"]), fact("g", ["general"]), fact("f", ["food"])];
    expect(pickFact(facts, ["radiation"], 3)!.id).toBe("r2");
    expect(pickFact(facts, ["radiation"], 3)).toBe(pickFact(facts, ["radiation"], 3));
    expect(pickFact(facts, ["warmth"], 0)!.id).toBe("g");
    expect(pickFact([], ["food"], 1)).toBeNull();
  });

  test("how a run ended decides the fact", () => {
    const s = startRun(1003, "doctor").state;
    expect(factTagsFor({ ...s, status: "lost", lostBy: "badge" })).toEqual(["radiation"]);
    expect(factTagsFor({ ...s, status: "lost", lostBy: "food" })).toEqual(["food"]);
    expect(factTagsFor({ ...s, status: "won" })).toEqual(["moon"]);
  });

  test("the committed facts and credits load", () => {
    expect(Array.isArray(moonFacts)).toBe(true);
    expect(Array.isArray(moonCredits)).toBe(true);
  });
});

describe("credits", () => {
  const HEAD = "file,title,author,source_url,licence,changes,si";

  test("the asset guide's CSV imports, quotes and all", () => {
    const csv = `${HEAD}\r\nbg_day_far.webp,"Mare Tranquillitatis, mosaic",NASA/GSFC/Arizona State University,https://images.nasa.gov/details/x,NASA media guidelines,"cropped, darkened",no\n` +
      `story_intro_2.webp,Simulation room,Ana Team (team),,own work,"painted over the ""background""",yes: SomeTool\n\n`;
    const { credits, problems } = creditsFromCsv(csv);
    expect(problems).toEqual([]);
    expect(credits[0]).toMatchObject({ title: "Mare Tranquillitatis, mosaic", changes: "cropped, darkened", si: "no" });
    expect(credits[1]).toMatchObject({ changes: 'painted over the "background"', si: "yes: SomeTool", source_url: "" });
  });

  test("missing columns or fields are reported, not guessed", () => {
    expect(creditsFromCsv("file,title\nx.webp,X").problems[0]).toMatch(/missing column/);
    const p = creditsFromCsv(`${HEAD}\nx.webp,,me,http://x,own work,,maybe`).problems.join("\n");
    expect(p).toMatch(/needs title/);
    expect(p).toMatch(/https link/);
    expect(p).toMatch(/si must be/);
    expect(checkCredits({ credits: [{ file: "a", title: "A", author: "B", licence: "CC0" }, { file: "a", title: "A", author: "B", licence: "CC0" }] }).problems[0]).toMatch(/listed twice/);
  });

  test("a corrected row added at the bottom replaces the earlier one", () => {
    const r = creditsFromCsv(`${HEAD}\nx.webp,Old,Me,,own work,,no\nx.webp,New,Me,,own work,,no\n`);
    expect(r.problems).toEqual([]);
    expect(r.replaced).toEqual(["x.webp"]);
    expect(r.credits).toEqual([expect.objectContaining({ file: "x.webp", title: "New" })]);
  });

  test("a CSV saved by Excel (with a byte-order mark) still imports", () => {
    expect(creditsFromCsv(`\uFEFF${HEAD}\nx.webp,X,Me,,own work,,no\n`).problems).toEqual([]);
  });

  test("CSV parsing keeps empty cells and skips blank lines", () => {
    expect(parseCsv('a,,c\n\n"x""y",2,\n')).toEqual([["a", "", "c"], ['x"y', "2", ""]]);
  });
});

describe("real-data text", () => {
  test("dates read the same everywhere", () => {
    expect(formatDate("2026-01-18")).toBe("18 January 2026");
    expect(realStormLine("2024-05-10")).toBe("This storm really happened on 10 May 2024.");
  });

  test("the storm nudge shows on a high forecast only (real odds top out at 1 in 4)", () => {
    expect(worthSheltering("low")).toBe(false);
    expect(worthSheltering("medium")).toBe(false);
    expect(worthSheltering("high")).toBe(true);
    expect(worthSheltering(null)).toBe(false);
  });

  test("the turn report names the real date of a storm", () => {
    const { state, ctx } = startRun(1003, "doctor");
    const lines = reportLines({
      turn: 0, cardId: state.deck[0], plan: { heater: 0, greenhouse: 0, experiments: 0, shelter: true }, choice: 0,
      events: [{ type: "storm", sheltered: true, pips: 1, date: "2024-05-10" }], after: state, locked: [],
    }, ctx);
    expect(lines.join(" ")).toMatch(/sheltered: \+1 pip\. This storm really happened on 10 May 2024\./);
  });
});

describe("the Datasets page", () => {
  const archive = buildArchive({ sep: RAW_SEP, flr: RAW_FLR, cme: RAW_CME }, { start: "2024-01-01", end: "2026-10-31" }, "x");
  const render = (props: Partial<Parameters<typeof Datasets>[0]>) =>
    renderToStaticMarkup(createElement(Datasets, { onClose: () => {}, archive: null, odds: loadForecastOdds(oddsEmpty), cards: moonCards, facts: [], credits: [], ...props }));

  test("before the download it says the game uses practice weather", () => {
    const html = render({ archive: null });
    expect(html).toMatch(/uses practice weather and placeholder odds/);
    expect(html).toMatch(/ccmc\.gsfc\.nasa\.gov\/tools\/DONKI/);
  });

  test("with the archive it shows the range, the counts and how each forecast was measured", () => {
    const odds = buildForecastOdds({ ...archive, range: { start: "2024-01-01", end: "2026-10-31" } });
    const html = render({ archive, odds });
    expect(html).toMatch(/1 January 2024 to 31 October 2026/);
    expect(html).toMatch(/2 solar particle storms measured near Earth/);
    expect(html).toMatch(/An X-class flare or a CME of 1,000 km\/s or more/);
    expect(html).toMatch(/A storm followed in [\d,]+ of [\d,]+ two-week stretches/);
  });

  test("without flares it says the warning signs are CMEs only", () => {
    const noFlares = { ...buildArchive({ sep: RAW_SEP, flr: [], cme: RAW_CME }, { start: "2024-01-01", end: "2026-10-31" }, "x", { flaresAvailable: false }) };
    const html = render({ archive: noFlares, odds: buildForecastOdds(noFlares) });
    expect(html).toMatch(/couldn&#x27;t download DONKI&#x27;s flare records, so the warning signs use CMEs only/);
    expect(html).toMatch(/<td>A CME of 1,000 km\/s or more<\/td>/);
    expect(html).toMatch(/<td>No fast CME in the week before<\/td>/);
    expect(html).not.toMatch(/big flares/);
  });

  test("every card source, fact and credit is listed", () => {
    const html = render({
      facts: [fact("a", ["moon"])],
      credits: [{ file: "bg_day_far.webp", title: "Sky", author: "NASA", source_url: "https://images.nasa.gov/x", licence: "NASA media guidelines", changes: "", si: "no" }],
    });
    for (const c of moonCards) for (const s of c.sources) expect(html).toContain(s.url.replace(/&/g, "&amp;"));
    expect(html).toContain("OSD-1");
    expect(html).toContain("bg_day_far.webp");
    expect(EMPTY_ARCHIVE.range).toBeNull();
  });
});
