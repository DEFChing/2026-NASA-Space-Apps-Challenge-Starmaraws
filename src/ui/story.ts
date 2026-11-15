/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The mask cutscene's mentor line: how did the run end, and which of Amara's lines
// (src/data/dialogue.json) fits? Lines can name the turn, the card or the bar that
// mattered; a line whose blanks this run can't fill is never picked.

import dialogueJson from "../data/dialogue.json";
import type { Ctx, Res } from "../engine/types";
import { buildDebrief, RES_LABEL, type TurnRecord } from "./text";

export const OUTCOMES = ["first_run", "win_clean", "win_close", "safe_no_stars", "lost_power", "lost_warmth", "lost_food", "lost_badge"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export type Dialogue = Record<Outcome, string[]>;
type Fill = Partial<Record<"turn" | "card" | "resource", string>>;

const BLANK = /\{(\w+)\}/g;           // for matchAll / replace
const HAS_BLANK = /\{\w+\}/;          // for a yes/no test (no global state)
const KNOWN = new Set(["turn", "card", "resource"]);

/** Check dialogue.json: every outcome has lines, and lines only use the blanks we can fill. */
export function loadDialogue(json: unknown, file = "src/data/dialogue.json"): Dialogue {
  const list = (json as { dialogue?: { outcome: string; lines: string[] }[] })?.dialogue;
  if (!Array.isArray(list)) throw new Error(`${file}: needs a "dialogue" list`);
  const out = {} as Dialogue;
  for (const o of OUTCOMES) {
    const entry = list.find(d => d.outcome === o);
    if (!entry || !Array.isArray(entry.lines) || entry.lines.length < 2) throw new Error(`${file}: "${o}" needs at least 2 lines`);
    for (const line of entry.lines) {
      for (const [, name] of line.matchAll(BLANK)) if (!KNOWN.has(name)) throw new Error(`${file}: unknown blank {${name}} in "${line}"`);
    }
    out[o] = entry.lines;
  }
  const extra = list.find(d => !(OUTCOMES as readonly string[]).includes(d.outcome));
  if (extra) throw new Error(`${file}: unknown outcome "${extra.outcome}"`);
  return out;
}

export const dialogue = loadDialogue(dialogueJson);

const firstTurnOf = (history: TurnRecord[], match: (e: TurnRecord["events"][number]) => boolean, last = false) => {
  const turns = history.filter(r => r.events.some(match)).map(r => r.turn + 1);
  return turns.length ? turns[last ? turns.length - 1 : 0] : undefined;
};

/** Which kind of ending this was, and what its lines can mention. */
export function outcomeOf(history: TurnRecord[], ctx: Ctx, runsBefore: number): { outcome: Outcome; fill: Fill } {
  const end = history[history.length - 1].after;
  const fill: Fill = {};
  const card = buildDebrief(history, ctx).keyCard;
  if (card) fill.card = card.title;
  const emergency = firstTurnOf(history, e => e.type === "emergency");

  if (end.status === "won") {
    const res = (Object.keys(end.res) as Res[]).sort((a, b) => end.res[a] - end.res[b])[0];
    fill.resource = RES_LABEL[res].toLowerCase();
    if (emergency !== undefined) fill.turn = String(emergency);
    return { outcome: emergency !== undefined || end.res[res] <= 2 ? "win_close" : "win_clean", fill };
  }
  if (runsBefore === 0) return { outcome: "first_run", fill };
  if (end.lostBy === "stars") return { outcome: "safe_no_stars", fill };
  if (end.lostBy === "badge") {
    // The biggest storm the crew worked through; its forecast showed in the briefing before it.
    const open = history.filter(r => r.turn > 0 && r.events.some(e => e.type === "storm" && !e.sheltered));
    if (open.length) fill.turn = String(open[open.length - 1].turn);
    return { outcome: "lost_badge", fill };
  }
  const res = end.lostBy as Res;
  const ranDry = firstTurnOf(history, e => e.type === "emergency" && "res" in e && e.res === res, true);
  if (ranDry !== undefined) fill.turn = String(ranDry);
  return { outcome: `lost_${res}` as Outcome, fill };
}

export interface MentorLine { id: string; text: string }

/** A line for this outcome that wasn't shown in the last runs and whose blanks can all be filled. */
export function pickLine(d: Dialogue, outcome: Outcome, recent: string[], fill: Fill, seed: number): MentorLine {
  const all = d[outcome].map((text, i) => ({ id: `${outcome}:${i}`, text }));
  const fits = all.filter(l => [...l.text.matchAll(BLANK)].every(([, name]) => fill[name as keyof Fill] !== undefined));
  const fresh = fits.filter(l => !recent.includes(l.id));
  const pool = fresh.length ? fresh : fits.length ? fits : all.filter(l => !HAS_BLANK.test(l.text));
  const line = pool[seed % pool.length];
  return { id: line.id, text: line.text.replace(BLANK, (_, name: keyof Fill) => fill[name] ?? "") };
}

export interface Ending extends MentorLine { outcome: Outcome; mood: "smile" | "thoughtful" }

export function endingFor(history: TurnRecord[], ctx: Ctx, runsBefore: number, recent: string[], d: Dialogue = dialogue): Ending {
  const { outcome, fill } = outcomeOf(history, ctx, runsBefore);
  const seed = history[history.length - 1].after.seed + runsBefore;
  return { ...pickLine(d, outcome, recent, fill, seed), outcome, mood: outcome.startsWith("win") ? "smile" : "thoughtful" };
}
