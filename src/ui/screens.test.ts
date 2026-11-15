/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { decode } from "../engine/codes";
import { startRun } from "../engine/data";
import { CrewPick, ideasFor, PICK_ORDER } from "./CrewPick";
import { amaraFrame, Cutscene } from "./Cutscene";
import { Debrief } from "./Debrief";
import { Intro, INTRO_PANELS } from "./Intro";
import { Landing } from "./Landing";
import { Title } from "./Title";

import type { FunctionComponent } from "react";
const html = <P extends object>(el: (p: P) => unknown, props: P) =>
  renderToStaticMarkup(createElement(el as unknown as FunctionComponent<P>, props));
const noop = () => {};

describe("story screens (placeholders until the art arrives)", () => {
  test("title: Play, the code box and Datasets, each one click away", () => {
    const h = html(Title, { error: "That code has a typo.", onPlay: noop, onCode: noop, onIntro: noop });
    for (const id of ["play", "code-input", "code-go", "open-datasets", "watch-intro", "title-error"]) expect(h).toContain(`data-testid="${id}"`);
    expect(h).toContain('data-art="logo_title"');
  });

  test("intro: four panels from the Spec, starting with the acceptance letter", () => {
    expect(INTRO_PANELS.map(p => p.key)).toEqual(["story_intro_1", "story_intro_2", "story_intro_3", "story_intro_4"]);
    const h = html(Intro, { onDone: noop });
    expect(h).toMatch(/chosen for the Junior Astronaut Academy/);
    expect(h).toContain('data-placeholder="true"');
    expect(h).toContain('data-testid="intro-skip"');
  });

  test("landing: the Sea of Tranquility at sunrise, naming the crew", () => {
    const h = html(Landing, { specialist: "botanist", onDone: noop });
    expect(h).toMatch(/Sea of Tranquility, at sunrise/);
    expect(h).toMatch(/Commander Ana and Mei the Botanist/);
  });

  test("cutscene: it opens on the glitch screen", () => {
    const h = html(Cutscene, { ending: { id: "win_clean:0", text: "Textbook.", outcome: "win_clean", mood: "smile" }, onDebrief: noop });
    expect(h).toContain("SIMULATION ENDED");
    expect(h).toContain('data-art="story_mask_1"');
  });

  test("Amara's frame: smiling or thoughtful, talking while the line appears", () => {
    expect([amaraFrame("smile", true), amaraFrame("smile", false), amaraFrame("thoughtful", true), amaraFrame("thoughtful", false)]).toEqual([1, 0, 3, 2]);
  });

  test("crew pick: Sol, Mei, Kai, each with their portrait and how many cards they help on", () => {
    expect(PICK_ORDER).toEqual(["doctor", "botanist", "engineer"]);
    const h = html(CrewPick, { difficulty: "rookie", checking: false, error: null, onDifficulty: noop, onPick: noop, onBack: noop });
    expect(h.indexOf("Sol the Doctor")).toBeLessThan(h.indexOf("Mei the Botanist"));
    expect(h.indexOf("Mei the Botanist")).toBeLessThan(h.indexOf("Kai the Engineer"));
    for (const k of ["portrait_ana", "portrait_sol", "portrait_mei", "portrait_kai"]) expect(h).toContain(`data-art="${k}"`);
    expect(h).toContain(`special idea on ${ideasFor("doctor")} cards`);
    expect(ideasFor("doctor") + ideasFor("botanist") + ideasFor("engineer")).toBe(12);
  });

  test("debrief: shows the mission code, which decodes back to this crew and seed", () => {
    const { state, ctx } = startRun(1003, "engineer");
    const record = { turn: 0, cardId: state.deck[0], plan: { heater: 0, greenhouse: 0, experiments: 0, shelter: false }, choice: 0 as const, events: [], after: { ...state, status: "lost" as const, lostBy: "food" as const }, locked: [] };
    const h = html(Debrief, { history: [record], ctx, seed: 1003, specialist: "engineer", difficulty: "pilot", onAgain: noop, onTitle: noop });
    const code = /data-testid="mission-code">([^<]+)</.exec(h)![1];
    expect(decode(code)).toEqual({ ok: true, specialist: "engineer", seed: 1003 });
    expect(h).toContain('data-testid="copy-code"');
    expect(h).toContain('data-testid="to-title"');
  });
});
