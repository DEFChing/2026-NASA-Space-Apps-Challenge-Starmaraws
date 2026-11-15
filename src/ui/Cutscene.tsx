/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The mask cutscene after every run (Game Design Spec v2): the screen glitches and
// "SIMULATION ENDED" appears (0.5 s), hands lift the mask off (1 s), then Flight Director
// Amara, smiling after a win or thoughtful after a loss, says one line and the Debrief
// button appears. A click skips to Amara; with reduced motion there's no flicker.
// After a win, three real NASA photos follow her line ("You're ready, cadet"): the
// place the simulation was practising for.

import { useEffect, useState } from "react";
import { playSfx } from "../store/game";
import { useSettings } from "./settings";
import { Art, SiTag } from "./Art";
import { artUrl } from "./artFiles";
import { isSiArt } from "./siArt";
import type { Ending } from "./story";

/** The finale photos (real NASA images, resized only) and what each one shows. */
export const FINALE_PHOTOS = [
  { key: "photo_finale_1", caption: "The Apollo 11 landing site, seen from orbit by NASA's Lunar Reconnaissance Orbiter" },
  { key: "photo_finale_2", caption: "A real pit in the Sea of Tranquility, like the lava tube in the game" },
  { key: "photo_finale_3", caption: "The Moon, photographed on NASA's Artemis II mission" },
];
const isWin = (e: Ending) => e.outcome.startsWith("win");

export const GLITCH_MS = 500, LIFT_MS = 1000;
type Stage = "glitch" | "lift" | "amara";

/** The player's reduce-motion setting (it starts from the computer's own setting). */
const reduced = () => useSettings.getState().settings.reduceMotion;

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
        <div className={`frame fade-in${isWin(ending) && FINALE_PHOTOS.some(p => artUrl(p.key)) ? " has-finale" : ""}`}>
          <div className="art-holder">
          <Art k="story_mask_3" alt="Back in the simulation room" className="panel-art ph-room" />
          {amara
            ? <div className={`amara mood-${ending.mood}`} role="img" aria-label={`Flight Director Amara, ${ending.mood === "smile" ? "smiling" : "thoughtful"}`}
                data-frame={frame} style={{ backgroundImage: `url(${amara})`, backgroundPosition: `${(frame * 100) / 3}% 0` }}>
                {isSiArt("mentor_amara") && <SiTag short />}
              </div>
            : <div className={`amara ph mood-${ending.mood}`} role="img" aria-label={`Flight Director Amara, ${ending.mood === "smile" ? "smiling" : "thoughtful"}`}
                data-frame={frame} data-placeholder="true"><span className="face">{ending.mood === "smile" ? "◡" : "–"}</span></div>}
          </div>
          <p className="caption mentor" data-testid="mentor-line" data-outcome={ending.outcome}>
            <strong>Flight Director Amara: </strong>{"“"}{ending.text}{"”"}
          </p>
          {isWin(ending) && FINALE_PHOTOS.some(p => artUrl(p.key)) && (
            <div className="finale" data-testid="finale">
              <p className="finale-title">You’re ready, cadet. Here’s the real Moon you trained for:</p>
              <div className="postcards">
                {FINALE_PHOTOS.filter(p => artUrl(p.key)).map(p => (
                  <figure key={p.key} className="postcard">
                    <img src={artUrl(p.key)!} alt={p.caption} />
                    <figcaption>{p.caption}. Photo: NASA</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
          <div className="story-buttons" onClick={e => e.stopPropagation()}>
            <button className="primary" data-testid="cutscene-debrief" onClick={onDebrief} autoFocus>Debrief</button>
          </div>
        </div>
      )}
    </section>
  );
}
