/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import type { Difficulty } from "../engine/solver";
import type { Ctx, Specialist } from "../engine/types";
import { buildDebrief, CREW, type TurnRecord } from "./text";

interface Props {
  history: TurnRecord[]; ctx: Ctx; seed: number; specialist: Specialist; difficulty: Difficulty;
  onAgain: (sameSeed: boolean) => void;
}

/** Win or lose, the cause chain, a locked-option hint, one fact and the seed. Step 7 adds the mask cutscene first. */
export function Debrief({ history, ctx, seed, specialist, difficulty, onAgain }: Props) {
  const d = buildDebrief(history, ctx);
  const won = history[history.length - 1].after.status === "won";
  return (
    <section className={`debrief ${won ? "won" : "lost"}`} aria-label="Debrief">
      <h1 data-testid="debrief-headline">{d.headline}</h1>
      <p>{d.summary}</p>
      <h3>What happened</h3>
      <ul data-testid="debrief-chain">{d.chain.map((l, i) => <li key={i}>{l}</li>)}</ul>
      {d.hint && <p className="hint" data-testid="debrief-hint">{d.hint}</p>}
      {d.keyCard && (
        <div className="fact" data-testid="debrief-card">
          <strong>{won ? "Card to remember" : "The card that mattered most"}: {d.keyCard.title}</strong>
          <p>Real basis: {d.keyCard.realBasis}</p>
          {d.keyCard.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label}</a>)}
        </div>
      )}
      <p className="seed" data-testid="seed">Seed {seed} · {CREW[specialist].name} the {CREW[specialist].role} · {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</p>
      <div className="choices">
        <button className="primary" data-testid="again-same" onClick={() => onAgain(true)}>Try this mission again</button>
        <button data-testid="again-new" onClick={() => onAgain(false)}>New mission</button>
      </div>
    </section>
  );
}
