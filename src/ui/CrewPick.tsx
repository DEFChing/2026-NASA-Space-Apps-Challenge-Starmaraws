/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { useState } from "react";
import type { Difficulty } from "../engine/solver";
import type { Specialist } from "../engine/types";
import { Datasets } from "./Datasets";
import { COMMANDER, CREW } from "./text";

// ?datasets opens the Datasets page straight away (a link for judges and teachers).
const openDatasets = () => typeof location !== "undefined" && new URLSearchParams(location.search).has("datasets");

interface Props {
  difficulty: Difficulty; checking: boolean; error: string | null;
  onDifficulty: (d: Difficulty) => void;
  onPick: (s: Specialist) => void;
}

const LEVELS: { id: Difficulty; label: string; help: string }[] = [
  { id: "rookie", label: "Rookie", help: "Lots of room for mistakes" },
  { id: "pilot", label: "Pilot", help: "Some room for mistakes" },
  { id: "commander", label: "Commander", help: "Every choice counts" },
];

/** Pick a difficulty, then one specialist for the whole run. Step 7 adds portraits. */
export function CrewPick({ difficulty, checking, error, onDifficulty, onPick }: Props) {
  const [datasets, setDatasets] = useState(openDatasets);
  if (datasets && !checking) return <Datasets onClose={() => setDatasets(false)} />;
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
      <h1>Four months on the Moon</h1>
      <p>{COMMANDER} leads the outpost in the Sea of Tranquility. Pick one specialist to join her.</p>
      <div className="levels" role="radiogroup" aria-label="Difficulty">
        {LEVELS.map(l => (
          <button key={l.id} role="radio" aria-checked={difficulty === l.id} data-testid={`level-${l.id}`}
            className={difficulty === l.id ? "on" : ""} onClick={() => onDifficulty(l.id)}>
            <strong>{l.label}</strong><small>{l.help}</small>
          </button>
        ))}
      </div>
      <div className="choices">
        {(Object.keys(CREW) as Specialist[]).map(s => (
          <button key={s} data-testid={`crew-${s}`} onClick={() => onPick(s)}>
            <strong>{CREW[s].name} the {CREW[s].role}</strong>
            <span>{CREW[s].helps}</span>
          </button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="link" data-testid="open-datasets" onClick={() => setDatasets(true)}>Where our data comes from</button>
    </section>
  );
}
