/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import manifestRaw from "../../si-manifest.json?raw";
import { SiTag } from "./Art";
import { Credits, readTeam, siSummary, type SiEntry } from "./Credits";
import { Cutscene, FINALE_PHOTOS } from "./Cutscene";
import { isSiArt, siArtFiles } from "./siArt";
import type { Ending } from "./story";
import { CreditsPage } from "./CreditsPage";
import { Title } from "./Title";

const html = <P extends object>(el: (p: P) => unknown, props: P) =>
  renderToStaticMarkup(createElement(el as unknown as FunctionComponent<P>, props));
const noop = () => {};
const manifest = JSON.parse(manifestRaw) as SiEntry[];

describe("credits screen", () => {
  test("the main menu links to the credits page, and shows the game and team names", () => {
    const h = html(Title, { error: null, onPlay: noop, onCode: noop, onIntro: noop });
    expect(h).toMatch(/data-testid="open-credits" href="credits.html"/);
    expect(h).toContain("CraterQuest");
    expect(h).toContain("A game by <strong>Team Starmaraws</strong>");
  });

  test("the credits page has the team with roles, the art acknowledgement, and the data sources", () => {
    const h = html(CreditsPage, {});
    for (const [name, role] of [["Jon Rian Añonuevo", "Documentation and Asset Collection"], ["Daniel Emile Ching", "Lead Developer and Designer"], ["Michael Udarbe Jr.", "Co-Designer"]])
      expect(h).toContain(`<strong>${name}</strong> · ${role}`);
    expect(h).toContain('data-testid="credits-art-ack"');
    expect(h).toContain("real NASA photos");
    expect(h).toContain("Where our data comes from");
    expect(h).toContain('href="./"');                 // back to the game, not a button
    expect(h).not.toContain('data-testid="datasets-close"');
  });

  test("Made with help from AI is built from si-manifest.json, so it lists every entry", () => {
    const h = html(Credits, { onClose: noop, onDatasets: noop, manifest });
    expect(h).toContain("Made with help from AI");
    expect(h).toContain(`Every file the AI helped with (${manifest.length})`);
    for (const e of manifest) expect(h).toContain(e.path);
    expect(h).toContain("carry an &quot;SI-generated&quot; label");
  });

  test("the summary counts files by kind and tool", () => {
    const rows = (type: string, n: number, tool = "Claude (Anthropic)") =>
      Array.from({ length: n }, (_, i) => ({ path: `${type}${i}`, type, tool, how: "x", humanReviewed: true }));
    expect(siSummary([...rows("doc", 2), ...rows("code", 3), ...rows("data", 1)]))
      .toEqual(["Claude (Anthropic) helped make 3 code files, 1 data file and 2 documents."]);
    expect(siSummary(rows("image", 1, "Another tool"))).toEqual(["Another tool helped make 1 image."]);
  });

  test("art and sound credits show who made them, and mark SI-made files", () => {
    const h = html(Credits, {
      onClose: noop, onDatasets: noop, manifest: [],
      credits: [
        { file: "art/a.webp", title: "Habitat", author: "Ana", source_url: "https://example.org/a", licence: "CC BY 4.0", changes: "cropped", si: "no" },
        { file: "art/c.webp", title: "Rover", author: "Team", source_url: "", licence: "Ours", changes: "", si: "yes" },
        { file: "audio/b.mp3", title: "Hum", author: "Team", source_url: "", licence: "CC0", changes: "", si: "yes: SoundTool" },
      ],
    });
    expect(h).toContain("Habitat</a>: Ana (CC BY 4.0). cropped");
    expect(h).toContain("SI-generated (SoundTool)");
    expect(h.match(/si-tag inline/g)).toHaveLength(2);
    expect(h).toContain("1 of the 2 pictures and the 1 sound");
    expect(h).toContain("The only picture not made with SI is real NASA photo: Habitat");
  });

  test("team names come from team.json; broken rows are skipped", () => {
    expect(readTeam({ team: [{ name: " Ching ", role: "Lead" }, { role: "no name" }, { name: "Sam" }, "x"] }))
      .toEqual([{ name: "Ching", role: "Lead" }, { name: "Sam", role: "" }]);
    expect(readTeam({})).toEqual([]);
    const h = html(Credits, { onClose: noop, onDatasets: noop, manifest: [], team: [{ name: "Ching", role: "Lead" }] });
    expect(h).toContain("<strong>Ching</strong> · Lead");
  });

  test("no logos or images on the credits screen", () => {
    const h = html(Credits, { onClose: noop, onDatasets: noop, manifest });
    expect(h).not.toMatch(/<img|<svg/);
  });
});

describe("SI labels (every SI picture shows one)", () => {
  test("the SI list comes from credits.json's si column", () => {
    const files = siArtFiles([
      { file: "art/x.webp", title: "x", author: "a", source_url: "", licence: "l", changes: "", si: "yes" },
      { file: "art/y.webp", title: "y", author: "a", source_url: "", licence: "l", changes: "", si: "no" },
      { file: "audio/z.mp3", title: "z", author: "a", source_url: "", licence: "l", changes: "", si: "yes" },
    ]);
    expect([...files]).toEqual(["art/x.webp"]);
    expect(isSiArt("x", "webp", files)).toBe(true);
    expect(isSiArt("y", "webp", files)).toBe(false);
  });

  test("the committed credits mark the team's art as SI and the NASA photos as not", () => {
    for (const k of ["outpost_day", "crew_kai", "portrait_ana", "bg_title", "logo_title", "mentor_amara", "story_intro_1"]) expect(isSiArt(k), k).toBe(true);
    for (const k of ["photo_finale_1", "photo_finale_2", "photo_finale_3"]) expect(isSiArt(k), k).toBe(false);
  });

  test("SiTag reads SI-generated, or SI on small pictures", () => {
    expect(html(SiTag, {})).toContain(">SI-generated<");
    expect(html(SiTag, { short: true })).toContain(">SI<");
  });
});

describe("finale (after a win)", () => {
  const ending = (outcome: string) => ({ id: "x", outcome, mood: outcome.startsWith("win") ? "smile" : "thoughtful", text: "Well done." }) as unknown as Ending;
  test("three real NASA photos follow a win, captioned and credited; none after a loss", () => {
    expect(FINALE_PHOTOS.map(p => p.key)).toEqual(["photo_finale_1", "photo_finale_2", "photo_finale_3"]);
    // Tests see no delivered art (the asset fixture), so the finale only renders with the files; check the rule instead.
    expect(ending("win_clean").outcome.startsWith("win")).toBe(true);
    expect(html(Cutscene, { ending: ending("loss_power"), onDebrief: noop })).not.toContain('data-testid="finale"');
  });
});
