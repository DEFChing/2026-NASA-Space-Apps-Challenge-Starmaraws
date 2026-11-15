/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The mask cutscene after every run (Game Design Spec v2): the screen glitches and
// "SIMULATION ENDED" appears (0.5 s), hands lift the mask off (1 s), then Flight Director
// Amara, smiling after a win or thoughtful after a loss, says one line and the Debrief
// button appears. A click skips to Amara; with reduced motion there's no flicker.

import { useEffect, useState } from "react";
import { playSfx } from "../store/game";
import { Art } from "./Art";
import { artUrl } from "./artFiles";
import type { Ending } from "./story";

export const GLITCH_MS = 500, LIFT_MS = 1000;
type Stage = "glitch" | "lift" | "amara";

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** mentor_amara frames: 0 smiling, 1 smiling and talking, 2 thoughtful, 3 thoughtful and talking. */
export const amaraFrame = (mood: Ending["mood"], talking: boolean) => (mood === "smile" ? 0 : 2) + (talking ? 1 : 0);

export function Cutscene({ ending, onDebrief }: { ending: Ending; onDebrief: () => void }) {
  const [stage, setStage] = useState<Stage>("glitch");
  const [talking, setTalking] = useState(true);
  useEffect(() => {
    playSfx("sfx_glitch");
    const a = setTimeout(() => { setStage(s => (s === "glitch" ? "lift" : s)); playSfx("sfx_mask_lift"); }, GLITCH_MS);
    const b = setTimeout(() => setStage("amara"), GLITCH_MS + LIFT_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  useEffect(() => {
    if (stage !== "amara") return;
    const t = setTimeout(() => setTalking(false), 1800);   // talking frame while the line appears
    return () => clearTimeout(t);
  }, [stage]);

  const amara = artUrl("mentor_amara");
  const frame = amaraFrame(ending.mood, talking);
  return (
    <section className={`story cutscene stage-${stage}${reduced() ? " reduced" : ""}`} aria-label="Simulation ended"
      data-testid="cutscene" onClick={() => setStage("amara")}>
      {stage === "glitch" && (
        <div className="frame glitch">
          <Art k="story_mask_1" alt="" className="panel-art ph-glitch" />
          <p className="sim-ended" data-text="SIMULATION ENDED">SIMULATION ENDED</p>
        </div>
      )}
      {stage === "lift" && (
        <div className="frame">
          <Art k="story_mask_2" alt="Hands lifting the simulation mask off" className="panel-art ph-lift lift-up" />
        </div>
      )}
      {stage === "amara" && (
        <div className="frame fade-in">
          <Art k="story_mask_3" alt="Back in the simulation room" className="panel-art ph-room" />
          {amara
            ? <div className={`amara mood-${ending.mood}`} role="img" aria-label={`Flight Director Amara, ${ending.mood === "smile" ? "smiling" : "thoughtful"}`}
                data-frame={frame} style={{ backgroundImage: `url(${amara})`, backgroundPosition: `${(frame * 100) / 3}% 0` }} />
            : <div className={`amara ph mood-${ending.mood}`} role="img" aria-label={`Flight Director Amara, ${ending.mood === "smile" ? "smiling" : "thoughtful"}`}
                data-frame={frame} data-placeholder="true"><span className="face">{ending.mood === "smile" ? "◡" : "–"}</span></div>}
          <p className="caption mentor" data-testid="mentor-line" data-outcome={ending.outcome}>
            <strong>Flight Director Amara: </strong>{"“"}{ending.text}{"”"}
          </p>
          <div className="story-buttons" onClick={e => e.stopPropagation()}>
            <button className="primary" data-testid="cutscene-debrief" onClick={onDebrief} autoFocus>Debrief</button>
          </div>
        </div>
      )}
    </section>
  );
}
