/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Dragging power cells in the split (Build Guide, Step 8). A drag moves one "step" of
// cells: 1 for the Heater and Greenhouse, a pair for Experiments (2 cells earn a Star).
// The +/– steppers stay as the keyboard way to do the same thing.

import type { DailyPlan } from "../engine/types";
import type { Slot } from "../store/game";

export type Place = Slot | "spare";
export interface SlotRule { max: number; step: number; off: boolean }

/**
 * The slot counts after dragging one step from `from` to `to`, or null if that drop isn't
 * allowed (an off slot, a full slot, nothing to take, or not enough spare cells).
 */
export function moveCells(
  plan: DailyPlan, spare: number, from: Place, to: Place, rules: Record<Slot, SlotRule>,
): Partial<Record<Slot, number>> | null {
  if (from === to) return null;
  const out: Partial<Record<Slot, number>> = {};
  let free = spare;
  if (from !== "spare") {
    const r = rules[from];
    if (r.off || plan[from] < r.step) return null;
    out[from] = plan[from] - r.step;
    free += r.step;
  }
  if (to !== "spare") {
    const r = rules[to];
    if (r.off || plan[to] + r.step > r.max || free < r.step) return null;
    out[to] = plan[to] + r.step;
  }
  return out;
}
