/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The Datasets page: every source the game uses, built from the data files, so a new
// card source, fact or credit shows up here without anyone editing this page.

import { donkiArchive, forecastOdds, moonCards, moonCredits, moonFacts } from "../engine/data";
import { hasFlares, type DonkiArchive } from "../engine/donki";
import type { Credit, Fact } from "../engine/facts";
import type { ForecastOdds } from "../engine/forecast";
import type { Card, Odds } from "../engine/types";
import { formatDate } from "./text";

interface Props {
  /** Left out on the credits page, where the sources are part of the page. */
  onClose?: () => void;
  /** The art and sound table (left out on the credits page, which lists them itself). */
  showArt?: boolean;
  archive?: DonkiArchive | null;
  odds?: ForecastOdds;
  cards?: Card[];
  facts?: Fact[];
  credits?: Credit[];
}

const n = (x: number) => x.toLocaleString("en-US");

export const DONKI_URL = "https://ccmc.gsfc.nasa.gov/tools/DONKI/";

const SIGNS: Record<Odds, (o: ForecastOdds) => string> = {
  low: o => (o.rule.flares === false ? "No fast CME in the week before" : "No big flare or fast CME in the week before"),
  medium: o => {
    const cme = `a CME of ${n(o.rule.medium.cmeSpeed)} km/s or more`;
    return o.rule.flares === false ? `A${cme.slice(1)}` : `An ${o.rule.medium.flare}-class flare or ${cme}`;
  },
  high: o => {
    const cme = `a CME of ${n(o.rule.high.cmeSpeed)} km/s or more`;
    return o.rule.flares === false ? `A${cme.slice(1)}` : `An ${o.rule.high.flare}-class flare or ${cme}`;
  },
};

export function Datasets({ showArt = true, onClose, archive = donkiArchive, odds = forecastOdds, cards = moonCards, facts = moonFacts, credits = moonCredits }: Props) {
  const sourced = cards.filter(c => c.sources.length);
  return (
    <section className="panel datasets" aria-label="Datasets" data-testid="datasets">
      <h1>Where our data comes from</h1>
      <p>The storms, the forecasts and the facts in this game come from real sources. Here they all are.</p>

      <h2>Space weather: NASA DONKI</h2>
      <p>
        The solar storms and forecasts come from NASA's{" "}
        <a href={DONKI_URL} target="_blank" rel="noreferrer">DONKI</a> database (Space Weather Database Of
        Notifications, Knowledge, Information), kept by the Community Coordinated Modeling Center at NASA Goddard.
      </p>
      {archive ? (
        <>
          <p data-testid="datasets-archive">
            We downloaded its records from {formatDate(archive.range!.start)} to {formatDate(archive.range!.end)}:{" "}
            {n(archive.storms.length)} solar particle storms measured near Earth (by GOES, SOHO or ACE), plus{" "}
            {hasFlares(archive)
              ? <>{n(archive.flares.length)} big flares (M and X class) and {n(archive.cmes.length)} fast coronal mass ejections (500 km/s or more), which we use as warning signs.</>
              : <>{n(archive.cmes.length)} fast coronal mass ejections (500 km/s or more), which we use as warning signs. (We couldn't download DONKI's flare records, so the warning signs use CMEs only.)</>}
            {" "}Each mission uses a real 16-week stretch, and a turn has a storm only if one really happened in its 14 days.
          </p>
          {odds.tiers && (
            <table className="odds" data-testid="datasets-odds">
              <thead><tr><th>Warning signs</th><th>Forecast says</th><th>How we know</th></tr></thead>
              <tbody>
                {(["low", "medium", "high"] as Odds[]).map(k => (
                  <tr key={k}>
                    <td>{SIGNS[k](odds)}</td>
                    <td>{odds.tiers![k].label}</td>
                    <td>A storm followed in {n(odds.tiers![k].withStorm)} of {n(odds.tiers![k].windows)} two-week stretches</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <p data-testid="datasets-archive">
          This copy of the game hasn't downloaded the records yet, so it uses practice weather and placeholder odds.
        </p>
      )}

      <h2>Real NASA facts</h2>
      {facts.length ? (
        <ul data-testid="datasets-facts">
          {facts.map(f => (
            <li key={f.id}>{f.text} <a href={f.source.url} target="_blank" rel="noreferrer">{f.source.name} ({f.source.refId})</a></li>
          ))}
        </ul>
      ) : <p data-testid="datasets-facts">Coming soon: the docs team is adding facts from NASA and CSA sources.</p>}

      <h2>What the event cards are based on</h2>
      <ul data-testid="datasets-cards">
        {sourced.map(c => (
          <li key={c.id}>
            <strong>{c.title}</strong>:{" "}
            {c.sources.map((s, i) => (
              <span key={s.url}>{i > 0 && ", "}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
            ))}
          </li>
        ))}
      </ul>

      {showArt && (<>
      <h2>Art and sound</h2>
      {credits.length ? (
        <table className="credits" data-testid="datasets-credits">
          <thead><tr><th>File</th><th>What</th><th>By</th><th>Licence</th><th>Changes</th><th>Made with SI</th></tr></thead>
          <tbody>
            {credits.map(c => (
              <tr key={c.file}>
                <td>{c.file}</td>
                <td>{c.source_url ? <a href={c.source_url} target="_blank" rel="noreferrer">{c.title}</a> : c.title}</td>
                <td>{c.author}</td><td>{c.licence}</td><td>{c.changes}</td><td>{c.si || "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p data-testid="datasets-credits">Coming soon: the game still uses placeholder shapes and sounds.</p>}
      </>)}

      {onClose && <button className="primary" data-testid="datasets-close" onClick={onClose}>Back</button>}
    </section>
  );
}
