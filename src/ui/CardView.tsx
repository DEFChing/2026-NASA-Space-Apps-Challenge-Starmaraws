/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import type { ChoiceInfo } from "../engine/rules";
import type { Card, Choice, Specialist } from "../engine/types";
import { CREW, describeOption } from "./text";

interface Props {
  card: Card; choices: ChoiceInfo[]; specialist: Specialist;
  onChoose: (choice: Choice) => void;
}

const TAG: Record<Card["tag"], string> = { crisis: "Crisis", dilemma: "Dilemma", opportunity: "Opportunity" };

/** The event card, revealed after the split. Locked options are greyed and say why. */
export function CardView({ card, choices, specialist, onChoose }: Props) {
  const crew = CREW[specialist];
  const option = (c: ChoiceInfo) => (
    <button key={String(c.choice)} data-testid={`option-${c.choice}`}
      className={`option ${c.choice === "specialist" ? "option-specialist" : ""}`}
      disabled={!c.affordable} onClick={() => onChoose(c.choice)}>
      {c.choice === "specialist" && <span className="who">{crew.name} the {crew.role}</span>}
      <strong>{c.option.label}</strong>
      <span className="cost">{describeOption(c.option)}</span>
      {!c.affordable && <span className="locked" data-testid={`locked-${c.choice}`}>{c.reason}</span>}
    </button>
  );
  return (
    <article className={`card card-${card.tag}`} aria-label={`Event card: ${card.title}`}>
      <span className="tag">{TAG[card.tag]}</span>
      <h2 data-testid="card-title">{card.title}</h2>
      <p>{card.text}</p>
      <div className="choices">{choices.filter(c => c.choice !== "specialist").map(option)}</div>
      {choices.filter(c => c.choice === "specialist").map(option)}
      <p className="sources">
        Real basis: {card.realBasis}{" "}
        {card.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label}</a>)}
      </p>
    </article>
  );
}
