/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The intro: four still panels (Game Design Spec v2, "Intro"), a fade between them, and
// a Skip button. It plays by itself on the first visit only.

import { useEffect, useState } from "react";
import { playSfx } from "../store/game";
import { Art } from "./Art";

export const INTRO_PANELS = [
  { key: "story_intro_1", who: "", line: "“You’ve been chosen for the Junior Astronaut Academy.”", alt: "An acceptance letter from the Junior Astronaut Academy", ph: "letter" },
  { key: "story_intro_2", who: "Flight Director Amara", line: "“Out there, every choice costs something. In here, you can practise until you’re ready.”", alt: "The simulation room, with Flight Director Amara", ph: "room" },
  { key: "story_intro_3", who: "Flight Director Amara", line: "“Four months on the Moon. Real NASA data, even real solar storms.”", alt: "Amara handing over the simulation mask", ph: "mask" },
  { key: "story_intro_4", who: "", line: "You put on the mask…", alt: "The cadet putting the mask on", ph: "cadet" },
] as const;

export function Intro({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const p = INTRO_PANELS[i];
  const next = () => {
    if (i + 1 < INTRO_PANELS.length) { playSfx("sfx_page_turn"); setI(i + 1); }
    else onDone();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      else if (e.key === "ArrowRight") next();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
  return (
    <section className="story intro" aria-label="Intro" data-testid="intro" onClick={next}>
      <div className="frame fade-in" key={p.key}>
        <Art k={p.key} alt={p.alt} className={`panel-art ph-${p.ph}`} />
        <p className="caption" aria-live="polite">
          {p.who && <strong>{p.who}: </strong>}{p.line}
        </p>
      </div>
      <div className="story-buttons" onClick={e => e.stopPropagation()}>
        <span className="dots" aria-label={`Panel ${i + 1} of ${INTRO_PANELS.length}`}>
          {INTRO_PANELS.map((_, j) => <i key={j} className={j === i ? "on" : ""} />)}
        </span>
        <button data-testid="intro-skip" onClick={onDone}>Skip</button>
        <button className="primary" data-testid="intro-next" onClick={next} autoFocus>{i + 1 < INTRO_PANELS.length ? "Next" : "Pick your crew"}</button>
      </div>
    </section>
  );
}
