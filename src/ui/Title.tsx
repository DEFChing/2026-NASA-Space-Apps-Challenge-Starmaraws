/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The title screen: Play, a mission-code box, the Datasets page and the Credits, each one click away.

import { useState } from "react";
import { Art } from "./Art";
import { Credits } from "./Credits";
import { Datasets } from "./Datasets";
import { SettingsButton } from "./SettingsPanel";

// ?datasets or ?credits opens that page straight away (links for judges and teachers).
type Page = "title" | "datasets" | "credits";
const firstPage = (): Page => {
  if (typeof location === "undefined") return "title";
  const q = new URLSearchParams(location.search);
  return q.has("datasets") ? "datasets" : q.has("credits") ? "credits" : "title";
};

interface Props { error: string | null; onPlay: () => void; onCode: (code: string) => void; onIntro: () => void }

export function Title({ error, onPlay, onCode, onIntro }: Props) {
  const [page, setPage] = useState<Page>(firstPage);
  const [code, setCode] = useState("");
  if (page === "datasets") return <Datasets onClose={() => setPage("title")} />;
  if (page === "credits") return <Credits onClose={() => setPage("title")} onDatasets={() => setPage("datasets")} />;
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
        <button className="link" data-testid="open-datasets" onClick={() => setPage("datasets")}>Where our data comes from</button>
        <button className="link" data-testid="watch-intro" onClick={onIntro}>Watch the intro</button>
        <button className="link" data-testid="open-credits" onClick={() => setPage("credits")}>Credits</button>
        <SettingsButton className="link" />
      </div>
    </section>
  );
}
