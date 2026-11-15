/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// A small promise-based wrapper around the run-checker worker, for the store (Step 4):
//
//   const checker = createChecker();
//   const found = await checker.findSeed("botanist", "rookie", randomSeed());
//   if (found) startGame(found.seed);

import type { Swap } from "../engine/draw";
import type { Analysis, Difficulty } from "../engine/solver";
import type { GameState, Res, Specialist } from "../engine/types";
import type { CheckerReply, CheckerRequest } from "./checkerProtocol";

type Pending = { resolve: (r: CheckerReply) => void; reject: (e: Error) => void };
type Body<K> = K extends CheckerRequest["kind"] ? Omit<Extract<CheckerRequest, { kind: K }>, "id"> : never;

/** Seeds stay below 31^5 so they fit in a 5-character seed code (Step 7). */
export const MAX_SEED = 31 ** 5;
export const randomSeed = () => Math.floor(Math.random() * (MAX_SEED - 1000));

export function createChecker() {
  const worker = new Worker(new URL("./checker.worker.ts", import.meta.url), { type: "module" });
  const waiting = new Map<number, Pending>();
  let nextId = 1;

  worker.onmessage = (e: MessageEvent<CheckerReply>) => {
    const p = waiting.get(e.data.id);
    if (!p) return;
    waiting.delete(e.data.id);
    if (e.data.kind === "error") p.reject(new Error(e.data.message));
    else p.resolve(e.data);
  };
  worker.onerror = (e) => {
    for (const p of waiting.values()) p.reject(new Error(e.message || "Run checker crashed"));
    waiting.clear();
  };

  function ask<K extends CheckerRequest["kind"]>(body: Body<K>): Promise<CheckerReply> {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      worker.postMessage({ ...body, id });
    });
  }

  return {
    /** A winnable seed at this difficulty, starting the search at `startSeed`; null if none found. */
    async findSeed(specialist: Specialist, difficulty: Difficulty, startSeed = randomSeed()) {
      const r = await ask<"findSeed">({ kind: "findSeed", specialist, difficulty, startSeed });
      return r.kind === "findSeed" ? r.result : null;
    },
    /** Winnable and how forgiving, from the current state. */
    async analyse(state: GameState): Promise<Analysis | null> {
      const r = await ask<"analyse">({ kind: "analyse", state });
      return r.kind === "analyse" ? r.result : null;
    },
    /** After a warning on `res`: a better next card, or null. */
    async smarterDraw(state: GameState, res: Res, lastSwapTurn: number | null): Promise<Swap | null> {
      const r = await ask<"smarterDraw">({ kind: "smarterDraw", state, res, lastSwapTurn });
      return r.kind === "smarterDraw" ? r.result : null;
    },
    terminate: () => worker.terminate(),
  };
}
