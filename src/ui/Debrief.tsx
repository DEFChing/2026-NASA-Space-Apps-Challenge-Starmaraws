/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { useState } from "react";
import { encode } from "../engine/codes";
import { moonFacts } from "../engine/data";
import { pickFact, type Fact, type FactTag } from "../engine/facts";
import type { Difficulty } from "../engine/solver";
import type { Ctx, GameState, Specialist } from "../engine/types";
import { buildDebrief, CREW, formatDate, type TurnRecord } from "./text";

/** The fact tags that suit how the run ended. */
export function factTagsFor(end: GameState): FactTag[] {
  if (end.status === "won") return ["moon"];
  if (end.lostBy === "badge") return ["radiation"];
  if (end.lostBy === "stars") return ["moon"];
  return end.lostBy ? [end.lostBy] : [];
}

interface Props {
  history: TurnRecord[]; ctx: Ctx; seed: number; specialist: Specialist; difficulty: Difficulty;
  onAgain: (sameSeed: boolean) => void;
  onTitle?: () => void;
  facts?: Fact[];
}

/** Win or lose, the cause chain, a locked-option hint, one fact and the seed. Step 7 adds the mask cutscene first. */
export function Debrief({ history, ctx, seed, specialist, difficulty, onAgain, onTitle, facts = moonFacts }: Props) {
  const code = encode(specialist, seed);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); } catch { setCopied(false); }
  };
  const d = buildDebrief(history, ctx);
  const end = history[history.length - 1].after;
  const won = end.status === "won";
  const fact = pickFact(facts, factTagsFor(end), seed);
  const weatherEnd = ctx.weatherStart && new Date(Date.parse(`${ctx.weatherStart}T00:00:00Z`) + (ctx.level.turns * 14 - 1) * 86_400_000).toISOString().slice(0, 10);
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
      {fact && (
        <div className="fact" data-testid="debrief-fact">
          <strong>Real NASA fact</strong>
          <p>{fact.text}</p>
          <a href={fact.source.url} target="_blank" rel="noreferrer">{fact.source.name} ({fact.source.refId})</a>
        </div>
      )}
      {ctx.weatherStart && weatherEnd && (
        <p className="real-data" data-testid="debrief-weather">
          Your storms were real: this mission used NASA's space weather records from {formatDate(ctx.weatherStart)} to {formatDate(weatherEnd)}.
        </p>
      )}
      <div className="mission-code">
        <span>Mission code</span>
        <code data-testid="mission-code">{code}</code>
        <button data-testid="copy-code" onClick={() => void copy()}>{copied ? "Copied!" : "Copy"}</button>
        <small>Share it: a friend who types it in on the title screen plays this exact mission.</small>
      </div>
      <p className="seed" data-testid="seed">{CREW[specialist].name} the {CREW[specialist].role} · {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} · seed {seed}</p>
      <div className="choices">
        <button className="primary" data-testid="again-same" onClick={() => onAgain(true)}>Try this mission again</button>
        <button data-testid="again-new" onClick={() => onAgain(false)}>New mission</button>
        {onTitle && <button data-testid="to-title" onClick={onTitle}>Title screen</button>}
      </div>
    </section>
  );
}
