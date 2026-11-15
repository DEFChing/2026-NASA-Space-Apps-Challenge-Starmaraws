/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Messages between the game and the run-checker worker, and the code that answers them.
// Kept apart from the worker file so the tests can call `handle` directly in Node.

import { startRun } from "../engine/data";
import { smarterDraw, type Swap } from "../engine/draw";
import { analyse, findSeed, type Analysis, type Difficulty } from "../engine/solver";
import type { GameState, Res, Specialist } from "../engine/types";

export type CheckerRequest =
  | { id: number; kind: "findSeed"; specialist: Specialist; difficulty: Difficulty; startSeed: number }
  | { id: number; kind: "analyse"; state: GameState }
  | { id: number; kind: "smarterDraw"; state: GameState; res: Res; lastSwapTurn: number | null };

export type CheckerReply =
  | { id: number; kind: "findSeed"; result: { seed: number; analysis: Analysis; tried: number } | null }
  | { id: number; kind: "analyse"; result: Analysis }
  | { id: number; kind: "smarterDraw"; result: Swap | null }
  | { id: number; kind: "error"; message: string };

/** Answer one request. Runs are rebuilt from their seed, so only small messages cross over. */
export function handle(req: CheckerRequest): CheckerReply {
  try {
    switch (req.kind) {
      case "findSeed":
        return { id: req.id, kind: "findSeed", result: findSeed(startRun, req.specialist, req.difficulty, req.startSeed) };
      case "analyse": {
        const { ctx } = startRun(req.state.seed, req.state.specialist);
        return { id: req.id, kind: "analyse", result: analyse(req.state, ctx) };
      }
      case "smarterDraw": {
        const { ctx } = startRun(req.state.seed, req.state.specialist);
        return { id: req.id, kind: "smarterDraw", result: smarterDraw(req.state, ctx, req.res, req.lastSwapTurn) };
      }
    }
  } catch (err) {
    return { id: req.id, kind: "error", message: (err as Error).message };
  }
}
