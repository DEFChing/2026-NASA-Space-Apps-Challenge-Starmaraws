/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The landing panel before Turn 1: the lander touching down on the Sea of Tranquility
// at sunrise. It moves on by itself after a few seconds, or on a click.

import { useEffect } from "react";
import { Art } from "./Art";
import { CREW } from "./text";
import type { Specialist } from "../engine/types";

export const LANDING_MS = 3500;

export function Landing({ specialist, onDone }: { specialist: Specialist; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, LANDING_MS);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <section className="story landing" aria-label="Landing" data-testid="landing" onClick={onDone}>
      <div className="frame fade-in">
        <Art k="story_landing" alt="The lander touching down on the Sea of Tranquility at sunrise" className="panel-art ph-landing" />
        <p className="caption">
          Touchdown: the Sea of Tranquility, at sunrise. Commander Ana and {CREW[specialist].name} the {CREW[specialist].role} begin four months on the Moon.
        </p>
      </div>
      <div className="story-buttons">
        <button className="primary" data-testid="landing-go" onClick={onDone} autoFocus>Start the mission</button>
      </div>
    </section>
  );
}
