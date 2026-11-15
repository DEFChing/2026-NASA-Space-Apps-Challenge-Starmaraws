/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The smarter draw (Game Design Spec v2, Fairness §2). When a bar drops into the warning
// zone, look in the reserve of the next turn's pile for an Opportunity or Dilemma card
// that protects that bar. Swap it in only if the run checker says the run is at least
// as winnable and as forgiving as before. At most one swap every 2 turns.

import { analyse } from "./solver";
import type { Card, Ctx, GameState, Res } from "./types";

export const SWAP_GAP = 2;   // turns between swaps

/** Reserve cards that could replace the next card to help `res`. */
export function swapCandidates(s: GameState, ctx: Ctx, res: Res): string[] {
  const nextId = s.deck[s.turn];
  const next = ctx.cards[nextId];
  if (!next || next.pile === "opener") return [];
  const helps = (c: Card | undefined) =>
    !!c && c.pile === next.pile && (c.tag === "opportunity" || c.tag === "dilemma") && !!c.protects?.includes(res);
  return s.reserve[next.pile].filter(id => helps(ctx.cards[id]));
}

/** A copy of the state with `cardId` dealt next; the card it replaces goes back to the reserve. */
export function swapIn(s: GameState, ctx: Ctx, cardId: string): GameState {
  const out = structuredClone(s);
  const pile = ctx.cards[out.deck[out.turn]].pile;
  if (pile === "opener") throw new Error("The opener is never swapped");
  if (!out.reserve[pile].includes(cardId)) throw new Error(`${cardId} isn't in the ${pile} reserve`);
  const old = out.deck[out.turn];
  out.deck[out.turn] = cardId;
  out.reserve[pile] = [...out.reserve[pile].filter(id => id !== cardId), old];
  return out;
}

export interface Swap {
  state: GameState;
  cardId: string;          // the card swapped in
  replaced: string;        // the card it replaced
  before: number;          // win share before
  after: number;           // win share after
}

/**
 * Try the smarter draw after a warning on `res`. Returns the best swap, or null if it's
 * too soon after the last one, nothing in the reserve helps, or no swap is at least as good.
 */
export function smarterDraw(
  s: GameState, ctx: Ctx, res: Res, lastSwapTurn: number | null, players = 600,
): Swap | null {
  if (s.status !== "playing" || s.turn >= ctx.level.turns) return null;
  if (lastSwapTurn !== null && s.turn - lastSwapTurn < SWAP_GAP) return null;
  const candidates = swapCandidates(s, ctx, res);
  if (!candidates.length) return null;
  const now = analyse(s, ctx, players);
  let best: Swap | null = null;
  for (const cardId of candidates) {
    const state = swapIn(s, ctx, cardId);
    const a = analyse(state, ctx, players);
    if (now.winnable && !a.winnable) continue;     // help never makes the run worse
    if (a.winShare < now.winShare) continue;
    if (!best || a.winShare > best.after) {
      best = { state, cardId, replaced: s.deck[s.turn], before: now.winShare, after: a.winShare };
    }
  }
  return best;
}
