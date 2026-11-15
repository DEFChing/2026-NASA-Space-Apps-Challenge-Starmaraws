/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The main menu: the CraterQuest banner over the team's Moon background, Play, a
// mission-code box, the Datasets page and the credits page, each one click away.

import { useState } from "react";
import { Art, SiTag } from "./Art";
import { artUrl } from "./artFiles";
import { Datasets } from "./Datasets";
import { SettingsButton } from "./SettingsPanel";
import { isSiArt } from "./siArt";

export const GAME_NAME = "CraterQuest";
export const TEAM_NAME = "Starmaraws";

// ?datasets opens the Datasets page straight away (a link for judges and teachers).
const openDatasets = () => typeof location !== "undefined" && new URLSearchParams(location.search).has("datasets");

interface Props { error: string | null; onPlay: () => void; onCode: (code: string) => void; onIntro: () => void }

export function Title({ error, onPlay, onCode, onIntro }: Props) {
  const [datasets, setDatasets] = useState(openDatasets);
  const [code, setCode] = useState("");
  const bg = artUrl("bg_title");
  return (
    <div className="title-screen" style={bg ? { backgroundImage: `url(${bg})` } : undefined} data-testid="title-screen">
      {datasets ? <Datasets onClose={() => setDatasets(false)} /> : (
        <section className="panel title" aria-label="Main menu" data-testid="title">
          <h1 className="sr-only">{GAME_NAME}</h1>
          <Art k="logo_title" alt={GAME_NAME} className="logo">
            <span className="logo-text">{GAME_NAME}</span>
          </Art>
          <p className="team-line" data-testid="team-line">A game by <strong>Team {TEAM_NAME}</strong></p>
          <p className="tagline">Four months on the Moon. Real NASA space weather. Every choice costs something.</p>
          <button className="primary big" data-testid="play" onClick={onPlay}>Play</button>
          <form className="code" onSubmit={e => { e.preventDefault(); onCode(code); }}>
            <label htmlFor="code">Got a mission code from a friend?</label>
            <div>
              <input id="code" data-testid="code-input" value={code} onChange={e => setCode(e.target.value)}
                placeholder="MOON-E7Q4K2X" autoComplete="off" spellCheck={false} maxLength={20} />
              <button type="submit" data-testid="code-go">Go</button>
            </div>
          </form>
          {error && <p className="error" role="alert" data-testid="title-error">{error}</p>}
          <div className="links">
            <button className="link" data-testid="open-datasets" onClick={() => setDatasets(true)}>Where our data comes from</button>
            <button className="link" data-testid="watch-intro" onClick={onIntro}>Watch the intro</button>
            <a className="link" data-testid="open-credits" href="credits.html">Credits</a>
            <SettingsButton className="link" />
          </div>
        </section>
      )}
      {bg && isSiArt("bg_title") && <span className="corner-tag"><SiTag /> background</span>}
    </div>
  );
}
