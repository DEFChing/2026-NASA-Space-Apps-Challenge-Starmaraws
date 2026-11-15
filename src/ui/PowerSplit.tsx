/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { isDayTurn, planCost, shelterCost } from "../engine/rules";
import type { Ctx, DailyPlan, GameState } from "../engine/types";
import type { Slot } from "../store/game";
import { nextForecast, worthSheltering } from "./text";

interface Props {
  state: GameState; ctx: Ctx; plan: DailyPlan; error: string | null;
  onSlot: (slot: Slot, cells: number) => void;
  onLock: () => void;
}

/** One +/– stepper per slot, the spare-cells counter and the storm nudge. Greybox; Step 5 adds dragging. */
export function PowerSplit({ state, ctx, plan, error, onSlot, onLock }: Props) {
  const { level } = ctx;
  const day = isDayTurn(level, state.turn);
  const spare = state.res.power - planCost(state, level, plan);
  const next = nextForecast(ctx, state.turn);
  const nudge = worthSheltering(next) && !state.flags.includes("cave") && shelterCost(state, level) > 0;
  const step = level.slots.experiments.cellsPerStar;
  const insulated = state.flags.includes("buried") || state.flags.includes("sandbagged");

  const rows: { slot: Slot; label: string; help: string; max: number; step: number; off?: string }[] = [
    { slot: "heater", label: "Heater", max: level.slots.heater.max, step: 1,
      help: `Each cell cancels 1 Warmth lost tonight (tonight loses ${-(insulated ? level.night.warmthInsulated : level.night.warmth)})`,
      off: day ? "The Sun is keeping the habitat warm" : undefined },
    { slot: "greenhouse", label: "Greenhouse", max: level.slots.greenhouse.max, step: 1, help: "Each cell grows 1 Food" },
    { slot: "experiments", label: "Experiments", max: 99, step,
      help: plan.shelter ? "No Stars while sheltering" : `Every ${step} cells earn 1 Star` },
  ];

  return (
    <section className="split" aria-label="Power split">
      <h2>Power split</h2>
      <p className="battery">Battery: {state.res.power} cells</p>
      {rows.map(r => (
        <div key={r.slot} className={`slot ${r.off ? "slot-off" : ""}`}>
          <div className="slot-name">{r.label}<small>{r.off ?? r.help}</small></div>
          <div className="stepper">
            <button data-testid={`${r.slot}-minus`} aria-label={`Fewer cells in ${r.label}`}
              disabled={!!r.off || plan[r.slot] === 0} onClick={() => onSlot(r.slot, plan[r.slot] - r.step)}>–</button>
            <span data-testid={`${r.slot}-cells`}>{plan[r.slot]}</span>
            <button data-testid={`${r.slot}-plus`} aria-label={`More cells in ${r.label}`}
              disabled={!!r.off || plan[r.slot] + r.step > r.max || spare < r.step} onClick={() => onSlot(r.slot, plan[r.slot] + r.step)}>+</button>
          </div>
        </div>
      ))}
      {plan.shelter && (
        <div className="slot slot-shelter">
          <div className="slot-name">Shelter<small>Runs the storm room's air, heat and lights</small></div>
          <div className="stepper"><span>{shelterCost(state, level)}</span></div>
        </div>
      )}
      <div className={`spare ${spare <= 0 ? "spare-zero" : ""}`} data-testid="spare">
        Spare: {Math.max(0, spare)}
        {spare <= 0 && <small>No spare power. Some card options may be locked.</small>}
        {nudge && spare >= 0 && <small className="nudge">Storm chance next turn: keep 2 for the shelter?</small>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" data-testid="lock-split" onClick={onLock}>Lock the plan</button>
    </section>
  );
}
