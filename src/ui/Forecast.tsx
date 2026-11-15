/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import type { Odds } from "../engine/types";
import { forecastText } from "./text";

/** Each forecast tier has its own icon as well as its colour. */
export const FORECAST_ICON: Record<Odds, string> = { low: "\u25cb", medium: "\u25b2", high: "\u26a0" };

/** "Next turn: 1 in 3 chance of a radiation storm". */
export function Forecast({ odds }: { odds: Odds | null }) {
  return (
    <div className={`forecast forecast-${odds ?? "none"}`} data-testid="forecast">
      {odds && <span aria-hidden="true" className="icon">{FORECAST_ICON[odds]} </span>}
      <strong>Space weather:</strong> {odds ? forecastText(odds) : "this is the last turn, so no forecast."}
    </div>
  );
}
