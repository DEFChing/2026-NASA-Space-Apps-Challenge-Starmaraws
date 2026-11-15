/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { isDayTurn, planCost, shelterCost } from "../engine/rules";
import type { Ctx, DailyPlan, GameState } from "../engine/types";
import type { Slot } from "../store/game";
import { moveCells, type Place, type SlotRule } from "./cellDrag";
import { nextForecast, worthSheltering } from "./text";

interface Props {
  state: GameState; ctx: Ctx; plan: DailyPlan; error: string | null;
  onSlot: (slot: Slot, cells: number) => void;
  onLock: () => void;
}

/** Power cells to drag between the slots and the spare tray, a +/– stepper per slot (the keyboard way), and the storm nudge. */
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

  const rules = Object.fromEntries(rows.map(r => [r.slot, { max: r.max, step: r.step, off: !!r.off }])) as Record<Slot, SlotRule>;
  const [drag, setDrag] = useState<{ from: Place; x: number; y: number; over: Place | null } | null>(null);
  const moved = useRef(false);

  const placeAt = (x: number, y: number): Place | null => {
    const el = typeof document !== "undefined" ? document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]") : null;
    return (el?.dataset.drop as Place | undefined) ?? null;
  };
  const start = (from: Place) => (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    moved.current = false;
    setDrag({ from, x: e.clientX, y: e.clientY, over: from });
  };
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return;
    moved.current = true;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, over: placeAt(e.clientX, e.clientY) });
  };
  const end = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return;
    const to = placeAt(e.clientX, e.clientY);
    setDrag(null);
    if (!to || !moved.current) return;
    const next = moveCells(plan, spare, drag.from, to, rules);
    if (!next) return;
    // Take from the source first, so the spare count is right when the target fills.
    for (const slot of [drag.from, to]) if (slot !== "spare" && next[slot] !== undefined) onSlot(slot, next[slot]!);
  };
  const handlers = { onPointerMove: move, onPointerUp: end, onPointerCancel: () => setDrag(null) };
  const dropOk = (to: Place) => !!drag && !!moveCells(plan, spare, drag.from, to, rules);
  const cells = (from: Place, n: number, step = 1) => (
    <span className="cells" aria-hidden="true">
      {Array.from({ length: Math.ceil(n / step) }, (_, i) => (
        <span key={i} className={`cell${step > 1 ? " cell-pair" : ""}`} data-testid={`cell-${from}`} onPointerDown={start(from)} {...handlers}>
          {step > 1 ? "▮▮" : "▮"}
        </span>
      ))}
    </span>
  );

  return (
    <section className={`split${drag ? " dragging" : ""}`} aria-label="Power split">
      <h2>Power split</h2>
      <p className="battery">Battery: {state.res.power} cells. Drag them, or use + and –.</p>
      {rows.map(r => (
        <div key={r.slot} data-drop={r.slot} className={`slot ${r.off ? "slot-off" : ""}${drag?.over === r.slot ? (dropOk(r.slot) ? " drop-ok" : " drop-no") : ""}`}>
          <div className="slot-name">{r.label}<small>{r.off ?? r.help}</small>{cells(r.slot, plan[r.slot], r.step)}</div>
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
      <div className={`spare ${spare <= 0 ? "spare-zero" : ""}${drag?.over === "spare" && drag.from !== "spare" ? " drop-ok" : ""}`} data-testid="spare" data-drop="spare">
        Spare: {Math.max(0, spare)} {cells("spare", Math.max(0, spare))}
        {spare <= 0 && <small>No spare power. Some card options may be locked.</small>}
        {nudge && spare >= 0 && <small className="nudge">Storm chance next turn: keep 2 for the shelter?</small>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" data-testid="lock-split" onClick={onLock}>Lock the plan</button>
      {drag && moved.current && <span className="cell cell-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">{drag.from === "experiments" ? "▮▮" : "▮"}</span>}
    </section>
  );
}
