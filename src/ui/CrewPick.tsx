/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { moonCards } from "../engine/data";
import type { Difficulty } from "../engine/solver";
import type { Specialist } from "../engine/types";
import { Art } from "./Art";
import { COMMANDER, CREW } from "./text";

interface Props {
  difficulty: Difficulty; checking: boolean; error: string | null;
  onDifficulty: (d: Difficulty) => void;
  onPick: (s: Specialist) => void;
  onBack?: () => void;
}

const LEVELS: { id: Difficulty; label: string; help: string }[] = [
  { id: "rookie", label: "Rookie", help: "Lots of room for mistakes" },
  { id: "pilot", label: "Pilot", help: "Some room for mistakes" },
  { id: "commander", label: "Commander", help: "Every choice counts" },
];

/** Sol, Mei, Kai: the order the Game Design Spec introduces them. */
export const PICK_ORDER: Specialist[] = ["doctor", "botanist", "engineer"];

/** How many cards have an idea only this specialist brings. */
export const ideasFor = (s: Specialist) => moonCards.filter(c => c.specialist?.who === s).length;

/** Pick a difficulty, then one specialist to join Commander Ana for the whole run. */
export function CrewPick({ difficulty, checking, error, onDifficulty, onPick, onBack }: Props) {
  if (checking) {
    return (
      <section className="panel" aria-live="polite" data-testid="checking">
        <h1>Preparing your mission…</h1>
        <p>Mission control is checking that this mission can be won.</p>
      </section>
    );
  }
  return (
    <section className="panel crew" aria-label="Crew pick">
      <h1>Pick your crew</h1>
      <div className="commander">
        <Art k="portrait_ana" alt={COMMANDER} className="portrait"><span>A</span></Art>
        <p>{COMMANDER} leads the outpost in the Sea of Tranquility. Pick one specialist to join her for four months.</p>
      </div>
      <div className="levels" role="radiogroup" aria-label="Difficulty">
        {LEVELS.map(l => (
          <button key={l.id} role="radio" aria-checked={difficulty === l.id} data-testid={`level-${l.id}`}
            className={difficulty === l.id ? "on" : ""} onClick={() => onDifficulty(l.id)}>
            <strong>{l.label}</strong><small>{l.help}</small>
          </button>
        ))}
      </div>
      <div className="choices crew-cards">
        {PICK_ORDER.map(s => (
          <button key={s} data-testid={`crew-${s}`} onClick={() => onPick(s)}>
            <Art k={`portrait_${CREW[s].name.toLowerCase()}`} alt={`${CREW[s].name} the ${CREW[s].role}`} className="portrait"><span>{CREW[s].name[0]}</span></Art>
            <strong>{CREW[s].name} the {CREW[s].role}</strong>
            <span>{CREW[s].helps}</span>
            <small>Has a special idea on {ideasFor(s)} cards</small>
          </button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {onBack && <button className="link" data-testid="crew-back" onClick={onBack}>Back to the title</button>}
    </section>
  );
}
