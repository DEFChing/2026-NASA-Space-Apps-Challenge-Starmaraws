/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test } from "vitest";
import { startRun } from "../engine/data";
import { choicesFor } from "../engine/rules";
import { setEmitter } from "../store/game";
import { CardView, keyOrder, optionForKey } from "./CardView";
import { CrewPick } from "./CrewPick";
import { Forecast, FORECAST_ICON } from "./Forecast";
import { NewWord, WORDS } from "./NewWord";
import { defaultSettings, readProgress, readSettings, resetProgress, saveSettings } from "./progress";
import { RadiationBadge } from "./RadiationBadge";
import { ResourceBar, STATUS_ICON } from "./ResourceBar";
import { useSettings } from "./settings";
import { Title } from "./Title";
import { TurnTracker } from "./TurnTracker";

const html = <P extends object>(el: (p: P) => unknown, props: P) =>
  renderToStaticMarkup(createElement(el as unknown as FunctionComponent<P>, props));

beforeEach(() => resetProgress());

describe("settings", () => {
  test("defaults, saving, and anything odd in storage falls back to the default", () => {
    expect(readSettings()).toEqual(defaultSettings());
    saveSettings({ music: 0.2, effects: 0, mute: true, reduceMotion: true, largeText: true });
    expect(readSettings()).toEqual({ music: 0.2, effects: 0, mute: true, reduceMotion: true, largeText: true });
  });

  test("a change is saved and sent to the outpost scene", () => {
    const sent: unknown[] = [];
    setEmitter((name, payload) => { if (name === "settings") sent.push(payload); });
    useSettings.getState().change({ mute: true, music: 0.4 });
    expect(readSettings()).toMatchObject({ mute: true, music: 0.4 });
    expect(sent.pop()).toMatchObject({ mute: true, music: 0.4 });
  });

  test("Settings can be opened from the title and crew pick screens (in the mission it sits in the HUD)", () => {
    const noop = () => {};
    expect(html(Title, { error: null, onPlay: noop, onCode: noop, onIntro: noop })).toContain('data-testid="open-settings"');
    expect(html(CrewPick, { difficulty: "rookie", checking: false, error: null, onDifficulty: noop, onPick: noop, onBack: noop }))
      .toContain('data-testid="open-settings"');
  });
});

describe("keyboard", () => {
  const { state, ctx } = startRun(1003, "engineer");
  const card = ctx.cards[state.deck[1]];
  const choices = choicesFor({ ...state, turn: 1 }, ctx, { heater: 0, greenhouse: 0, experiments: 0, shelter: false });

  test("keys 1–3 pick the options in the order they're shown; a locked option or other key does nothing", () => {
    const order = keyOrder(choices);
    expect(order[order.length - 1].choice).toBe(choices.some(c => c.choice === "specialist") ? "specialist" : order[order.length - 1].choice);
    order.forEach((c, i) => expect(optionForKey(String(i + 1), choices)).toBe(c.affordable ? c.choice : null));
    expect(optionForKey("9", choices)).toBeNull();
    expect(optionForKey("a", choices)).toBeNull();
    const locked = choices.map(c => ({ ...c, affordable: false }));
    expect(optionForKey("1", locked)).toBeNull();
  });

  test("each option shows its number key", () => {
    const h = html(CardView, { card, choices, specialist: "engineer", onChoose: () => {} });
    expect(h).toMatch(/<kbd class="key" aria-hidden="true">1<\/kbd>/);
    expect(h).toMatch(/aria-keyshortcuts="2"/);
  });
});

describe("status never relies on colour alone", () => {
  test("bars: an icon and a word for low, empty and emergency", () => {
    expect(html(ResourceBar, { res: "food", value: 2, max: 10, emergency: false })).toContain(`${STATUS_ICON.warning}</span> Low`);
    expect(html(ResourceBar, { res: "food", value: 0, max: 10, emergency: true })).toContain(`${STATUS_ICON.emergency}</span> Emergency!`);
    expect(html(ResourceBar, { res: "food", value: 6, max: 10, emergency: false })).not.toMatch(/Low|Emergency/);
  });

  test("badge and forecast carry icons; the turn tracker names each turn", () => {
    expect(html(RadiationBadge, { pips: 10, limit: 12 })).toContain(STATUS_ICON.emergency);
    for (const o of ["low", "medium", "high"] as const) expect(html(Forecast, { odds: o })).toContain(FORECAST_ICON[o]);
    expect(html(TurnTracker, { ctx: startRun(1003, "doctor").ctx, turn: 1 })).toContain('aria-label="Turn 2: Night"');
  });
});

describe("new words", () => {
  test("lunar day, lunar night and radiation dose are explained once, then remembered", () => {
    expect(Object.keys(WORDS)).toEqual(["lunar day", "lunar night", "radiation dose"]);
    expect(html(NewWord, { word: "lunar night" })).toContain("New word: lunar night.");
    expect(readProgress().seenWords).toEqual([]);   // marked seen once it's actually shown (an effect, in the browser)
  });

  test("regolith is already explained by the card that introduces it", () => {
    expect(startRun(1003, "doctor").ctx.cards.B0.text).toMatch(/called regolith/);
  });
});
