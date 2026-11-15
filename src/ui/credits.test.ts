/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import manifestRaw from "../../si-manifest.json?raw";
import { Credits, readTeam, siSummary, type SiEntry } from "./Credits";
import { Title } from "./Title";

const html = <P extends object>(el: (p: P) => unknown, props: P) =>
  renderToStaticMarkup(createElement(el as unknown as FunctionComponent<P>, props));
const noop = () => {};
const manifest = JSON.parse(manifestRaw) as SiEntry[];

describe("credits screen", () => {
  test("is one click from the title", () => {
    expect(html(Title, { error: null, onPlay: noop, onCode: noop, onIntro: noop })).toContain('data-testid="open-credits"');
  });

  test("Made with help from AI is built from si-manifest.json, so it lists every entry", () => {
    const h = html(Credits, { onClose: noop, onDatasets: noop, manifest });
    expect(h).toContain("Made with help from AI");
    expect(h).toContain(`Every file the AI helped with (${manifest.length})`);
    for (const e of manifest) expect(h).toContain(e.path);
    expect(h).toContain("No pictures, sounds or videos in the game were made with AI.");
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
        { file: "a.png", title: "Habitat", author: "Ana", source_url: "https://example.org/a", licence: "CC BY 4.0", changes: "cropped", si: "no" },
        { file: "b.ogg", title: "Hum", author: "Team", source_url: "", licence: "CC0", changes: "", si: "yes: SoundTool" },
      ],
    });
    expect(h).toContain("Habitat</a> by Ana (CC BY 4.0), cropped");
    expect(h).toContain("made with AI help (SoundTool)");
    expect(h.match(/made with AI help/g)).toHaveLength(1);
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
