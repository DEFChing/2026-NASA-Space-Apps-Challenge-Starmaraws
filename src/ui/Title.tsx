/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The title screen: Play, a mission-code box and the Datasets page, each one click away.

import { useState } from "react";
import { Art } from "./Art";
import { Datasets } from "./Datasets";

// ?datasets opens the Datasets page straight away (a link for judges and teachers).
const openDatasets = () => typeof location !== "undefined" && new URLSearchParams(location.search).has("datasets");

interface Props { error: string | null; onPlay: () => void; onCode: (code: string) => void; onIntro: () => void }

export function Title({ error, onPlay, onCode, onIntro }: Props) {
  const [datasets, setDatasets] = useState(openDatasets);
  const [code, setCode] = useState("");
  if (datasets) return <Datasets onClose={() => setDatasets(false)} />;
  return (
    <section className="panel title" aria-label="Title screen" data-testid="title">
      <Art k="logo_title" ext="svg" alt="Junior Astronaut Mission Trainer" className="logo">
        <span className="logo-text">Junior Astronaut<br />Mission Trainer</span>
      </Art>
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
      </div>
    </section>
  );
}
