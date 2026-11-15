/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The credits page (credits.html): who made the game, where the data comes from, every
// art and sound credit (credits.json) and "Made with help from AI", built from
// si-manifest.json so it can never fall behind the project. Text only: no logos anywhere.

import manifestJson from "../../si-manifest.json";
import teamJson from "../data/team.json";
import { moonCredits } from "../engine/data";
import type { Credit } from "../engine/facts";
import { DONKI_URL } from "./Datasets";
import { isSiCredit } from "./siArt";

export interface TeamMember { name: string; role: string }
export interface SiEntry { path: string; type: string; tool: string; how: string; humanReviewed: boolean }

/** Team rows with a name; a role is optional. Anything else is skipped rather than shown broken. */
export function readTeam(json: unknown): TeamMember[] {
  const list = (json as { team?: unknown })?.team;
  if (!Array.isArray(list)) return [];
  return list
    .filter((m): m is Partial<TeamMember> => !!m && typeof m === "object" && typeof (m as TeamMember).name === "string" && !!(m as TeamMember).name.trim())
    .map(m => ({ name: m.name!.trim(), role: typeof m.role === "string" ? m.role.trim() : "" }));
}

const TYPE_WORDS: Record<string, [string, string]> = {
  code: ["code file", "code files"], data: ["data file", "data files"], doc: ["document", "documents"],
  image: ["image", "images"], audio: ["sound", "sounds"], video: ["video", "videos"],
};
const word = (type: string, n: number) => {
  const [one, many] = TYPE_WORDS[type] ?? [`${type} file`, `${type} files`];
  return `${n} ${n === 1 ? one : many}`;
};

/** "Claude (Anthropic) helped make 81 code files, 4 data files and 1 document." */
export function siSummary(entries: SiEntry[]): string[] {
  const byTool = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const types = byTool.get(e.tool) ?? new Map<string, number>();
    types.set(e.type, (types.get(e.type) ?? 0) + 1);
    byTool.set(e.tool, types);
  }
  return [...byTool].map(([tool, types]) => {
    const order = Object.keys(TYPE_WORDS);
    const rank = (t: string) => (order.includes(t) ? order.indexOf(t) : order.length);
    const parts = [...types].sort((a, b) => rank(a[0]) - rank(b[0])).map(([t, n]) => word(t, n));
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
    return `${tool} helped make ${list}.`;
  });
}

const isSi = isSiCredit;

interface Props {
  /** In the game: back to the title. On the credits page: a link back to the game instead. */
  onClose?: () => void;
  /** In the game: open the Datasets page. On the credits page the sources follow below. */
  onDatasets?: () => void;
  team?: TeamMember[];
  credits?: Credit[];
  manifest?: SiEntry[];
}

export function Credits({ onClose, onDatasets, team = readTeam(teamJson), credits = moonCredits, manifest = manifestJson as SiEntry[] }: Props) {
  const media = manifest.filter(e => ["image", "audio", "video"].includes(e.type));
  const pictures = credits.filter(c => c.file.startsWith("art/")), sounds = credits.filter(c => c.file.startsWith("audio/"));
  const notSi = pictures.filter(c => !isSi(c));
  const row = (c: Credit) => (
    <li key={c.file}>
      {c.source_url ? <a href={c.source_url} target="_blank" rel="noreferrer">{c.title}</a> : c.title}: {c.author}
      {!c.licence.startsWith(`Made by ${c.author}`) && <> ({c.licence})</>}
      {c.changes && <>. {c.changes}</>}
      {isSi(c) && <span className="si-tag inline"> · SI-generated{/^yes:\s*\S/i.test(c.si) ? ` (${c.si.replace(/^yes:\s*/i, "")})` : ""}</span>}
    </li>
  );
  return (
    <section className="panel datasets credits-screen" aria-label="Credits" data-testid="credits">
      <h1>{onClose ? "Credits" : "CraterQuest · Credits"}</h1>

      <h2>Made by Team Starmaraws</h2>
      <p>CraterQuest is our entry for the NASA Space Apps Challenge 2026 (challenge: "Build a Junior Astronaut Mission Trainer").</p>
      {team.length ? (
        <ul className="team" data-testid="credits-team">
          {team.map(m => <li key={m.name}><strong>{m.name}</strong>{m.role && <> · {m.role}</>}</li>)}
        </ul>
      ) : <p data-testid="credits-team">A team entry for the NASA Space Apps Challenge 2026.</p>}

      <h2>Space data</h2>
      <p>
        The solar storms and forecasts come from NASA's <a href={DONKI_URL} target="_blank" rel="noreferrer">DONKI</a> database,
        kept by the Community Coordinated Modeling Center at NASA Goddard. The event cards and facts link to their NASA and
        Canadian Space Agency sources.
      </p>
      {onDatasets && <button className="link" data-testid="credits-datasets" onClick={onDatasets}>See every source</button>}

      <h2>Art and sound</h2>
      {credits.length ? (
        <div data-testid="credits-assets">
          <p className="si-ack" data-testid="credits-art-ack">
            {pictures.length - notSi.length} of the {pictures.length} pictures and {sounds.length === 1 ? "the 1 sound" : `all ${sounds.length} sounds`} in the game were made with SI (AI) tools,
            and each SI picture shows an "SI-generated" label where it appears.
            {notSi.length > 0 && <> The {notSi.length === 1 ? "only picture" : `${notSi.length} pictures`} not made with SI {notSi.length === 1 ? "is" : "are"} real NASA photo{notSi.length === 1 ? "" : "s"}: {notSi.map(c => c.title).join("; ")}.</>}
          </p>
          <h3>Pictures</h3>
          <ul>{pictures.map(row)}</ul>
          {sounds.length > 0 && <><h3>Sounds</h3><ul>{sounds.map(row)}</ul></>}
        </div>
      ) : <p data-testid="credits-assets">Placeholder shapes and sounds for now, all made by the team.</p>}

      <h2 data-testid="credits-si-heading">Made with help from AI</h2>
      <div data-testid="credits-si">
        {siSummary(manifest).map(line => <p key={line}>{line}</p>)}
        <p>
          The team checks, tests and edits everything the AI helps with. The real data and facts come from the sources
          above, never from the AI. {media.length
            ? <>Pictures and videos made with AI carry an "SI-generated" label, and sounds carry a tag in the file.</>
            : <>No pictures, sounds or videos in the game were made with AI.</>}
        </p>
        <details>
          <summary>Every file the AI helped with ({manifest.length})</summary>
          <ul className="si-files">
            {manifest.map(e => <li key={e.path}><code>{e.path}</code>: {e.how}</li>)}
          </ul>
        </details>
      </div>

      {onClose
        ? <button className="primary" data-testid="credits-close" onClick={onClose}>Back</button>
        : <a className="primary button-link" data-testid="credits-close" href="./">Back to CraterQuest</a>}
    </section>
  );
}
