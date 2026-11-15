/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { isDayTurn } from "../engine/rules";
import type { Ctx } from "../engine/types";

/** 8 boxes marked Day or Night; the current one highlighted. */
export function TurnTracker({ ctx, turn }: { ctx: Ctx; turn: number }) {
  return (
    <ol className="tracker" aria-label={`Turn ${turn + 1} of ${ctx.level.turns}`}>
      {Array.from({ length: ctx.level.turns }, (_, t) => (
        <li key={t} className={`${isDayTurn(ctx.level, t) ? "day" : "night"} ${t === turn ? "now" : t < turn ? "done" : ""}`}>
          {isDayTurn(ctx.level, t) ? "Day" : "Night"}
        </li>
      ))}
    </ol>
  );
}
