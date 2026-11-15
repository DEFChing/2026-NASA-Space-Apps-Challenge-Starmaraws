/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { isDayTurn } from "../engine/rules";
import type { Ctx } from "../engine/types";

/** 8 boxes marked Day (sun) or Night (moon); the current one highlighted. Icons keep it readable at 18 px. */
export function TurnTracker({ ctx, turn }: { ctx: Ctx; turn: number }) {
  return (
    <ol className="tracker" aria-label={`Turn ${turn + 1} of ${ctx.level.turns}`}>
      {Array.from({ length: ctx.level.turns }, (_, t) => (
        <li key={t} className={`${isDayTurn(ctx.level, t) ? "day" : "night"} ${t === turn ? "now" : t < turn ? "done" : ""}`}
          title={`Turn ${t + 1}: ${isDayTurn(ctx.level, t) ? "Day" : "Night"}`} aria-label={`Turn ${t + 1}: ${isDayTurn(ctx.level, t) ? "Day" : "Night"}`}>
          <span aria-hidden="true">{isDayTurn(ctx.level, t) ? "\u2600" : "\u263e"}</span>
        </li>
      ))}
    </ol>
  );
}
