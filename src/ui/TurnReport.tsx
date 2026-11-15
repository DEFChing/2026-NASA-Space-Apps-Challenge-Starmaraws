/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import type { Ctx } from "../engine/types";
import { reportLines, turnLabel, type TurnRecord } from "./text";

/** What happened this turn, in order, built from the engine's events. */
export function TurnReport({ record, ctx, busy, onNext }: { record: TurnRecord; ctx: Ctx; busy: boolean; onNext: () => void }) {
  return (
    <section className="report" aria-label="Turn report">
      <h2>{turnLabel(ctx, record.turn)}: report</h2>
      <ul data-testid="report">{reportLines(record, ctx).map((l, i) => <li key={i}>{l}</li>)}</ul>
      <button className="primary" data-testid="next-turn" disabled={busy} onClick={onNext}>
        {busy ? "Mission control is checking in…" : "Next turn"}
      </button>
    </section>
  );
}
