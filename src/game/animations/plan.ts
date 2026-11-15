/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Turns one turn's engine events into an ordered list of animation steps for the
// Outpost scene. Pure and Phaser-free, so it can be tested: every event type maps to a
// visible step, in the order the engine applied them.

import type { DailyPlan, Flag, GameEvent, Res } from "../../engine/types";

export type Step =
  | { kind: "shelter" }                                   // crew walk to the storm room first
  | { kind: "cells"; cells: number; plan: DailyPlan }     // power cells flow into the slots
  | { kind: "grow"; amount: number }                      // greenhouse food
  | { kind: "science"; stars: number }                    // experiments earn Stars
  | { kind: "blocked"; why: "shelter" | "strained" }      // experiments earned nothing
  | { kind: "card"; cardId: string }                      // the event card plays out in the scene
  | { kind: "gamble"; failed: boolean }
  | { kind: "sun"; amount: number }                       // sunlight charges the batteries
  | { kind: "bar"; res: Res; from: number; to: number; cause: string }
  | { kind: "stars"; amount: number; cause: string }
  | { kind: "badge"; amount: number; cause: string }
  | { kind: "storm"; sheltered: boolean; pips: number }
  | { kind: "delayed"; cause: string; fromTurn: number }
  | { kind: "mini" }
  | { kind: "flag"; flag: Flag }
  | { kind: "sunMod"; delta: number }
  | { kind: "status"; status: "warning" | "emergency" | "recovered"; res: Res }
  | { kind: "sweep"; to: "day" | "night" }                // sunset or sunrise before the next turn
  | { kind: "end"; status: "won" | "lost" };

export interface TurnInfo {
  cardId: string;
  plan: DailyPlan;
  isDay: boolean;           // this turn
  nextIsDay: boolean | null; // the next turn, or null after the last
}

/** The animation steps for one resolved turn, in order. */
export function planTurn(events: GameEvent[], info: TurnInfo): Step[] {
  const steps: Step[] = [];
  if (events.some(e => e.type === "storm" && e.sheltered)) steps.push({ kind: "shelter" });
  let cardShown = false;
  const showCard = () => { if (!cardShown) { steps.push({ kind: "card", cardId: info.cardId }); cardShown = true; } };

  for (const e of events) {
    switch (e.type) {
      case "res":
        if (e.cause === "split") steps.push({ kind: "cells", cells: e.from - e.to, plan: info.plan });
        else if (e.cause === "greenhouse") steps.push({ kind: "grow", amount: e.to - e.from });
        else if (e.cause === "sunlight") steps.push({ kind: "sun", amount: e.to - e.from });
        else {
          if (e.cause === info.cardId) showCard();
          steps.push({ kind: "bar", res: e.res, from: e.from, to: e.to, cause: e.cause });
        }
        break;
      case "stars":
        if (e.cause === "experiments") steps.push({ kind: "science", stars: e.amount });
        else {
          if (e.cause === info.cardId) showCard();
          steps.push({ kind: "stars", amount: e.amount, cause: e.cause });
        }
        break;
      case "starsBlocked": steps.push({ kind: "blocked", why: e.why }); break;
      case "badge":
        if (e.cause === "storm") break;                    // shown by the storm step
        if (e.cause === info.cardId) showCard();
        steps.push({ kind: "badge", amount: e.amount, cause: e.cause });
        break;
      case "flag": if (e.cause === info.cardId) showCard(); steps.push({ kind: "flag", flag: e.flag }); break;
      case "sunMod": if (e.cause === info.cardId) showCard(); steps.push({ kind: "sunMod", delta: e.delta }); break;
      case "gamble": showCard(); steps.push({ kind: "gamble", failed: e.failed }); break;
      case "storm": steps.push({ kind: "storm", sheltered: e.sheltered, pips: e.pips }); break;
      case "delayed": steps.push({ kind: "delayed", cause: e.cause, fromTurn: e.fromTurn }); break;
      case "mini": showCard(); steps.push({ kind: "mini" }); break;
      case "warning": case "emergency": case "recovered":
        steps.push({ kind: "status", status: e.type, res: e.res }); break;
      case "end": steps.push({ kind: "end", status: e.status }); break;
    }
  }
  // A card whose options changed nothing visible (e.g. "keep the power") still gets its moment.
  if (!cardShown) {
    const at = steps.findIndex(s => s.kind === "sun" || s.kind === "bar" || s.kind === "storm");
    steps.splice(at < 0 ? steps.length : at, 0, { kind: "card", cardId: info.cardId });
  }
  const over = steps.some(s => s.kind === "end");
  if (!over && info.nextIsDay !== null && info.nextIsDay !== info.isDay) {
    steps.push({ kind: "sweep", to: info.nextIsDay ? "day" : "night" });
  }
  return steps;
}

// Upkeep changes that come back to back (bar changes, a module's warning or
// emergency, Badge pips) play together as one beat, so a turn doesn't drag.
// A second change to the same bar starts a new beat, so its label and visual
// never overlap the first.
const BEAT_KINDS = new Set<Step["kind"]>(["bar", "status", "badge"]);

export function beats(steps: Step[]): Step[][] {
  const out: Step[][] = [];
  let cur: Step[] = [];
  const clash = (s: Step) =>
    cur.some(c => (s.kind === "bar" && c.kind === "bar" && c.res === s.res) || (s.kind === "badge" && c.kind === "badge"));
  for (const s of steps) {
    const joins = BEAT_KINDS.has(s.kind) && cur.length > 0 && BEAT_KINDS.has(cur[0].kind) && !clash(s);
    if (!joins && cur.length) { out.push(cur); cur = []; }
    cur.push(s);
  }
  if (cur.length) out.push(cur);
  return out;
}
