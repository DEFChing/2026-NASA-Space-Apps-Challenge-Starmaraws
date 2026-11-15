/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The Credits screen: who made the game, where the data comes from, every art and sound
// credit (credits.json) and "Made with help from AI", built from si-manifest.json so it
// can never fall behind the project. Text only: no logos anywhere (Build Guide, Step 8).

import manifestJson from "../../si-manifest.json";
import teamJson from "../data/team.json";
import { moonCredits } from "../engine/data";
import type { Credit } from "../engine/facts";
import { DONKI_URL } from "./Datasets";

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

const isSi = (c: Credit) => /^yes/i.test(c.si?.trim() ?? "");

interface Props {
  onClose: () => void;
  onDatasets: () => void;
  team?: TeamMember[];
  credits?: Credit[];
  manifest?: SiEntry[];
}

export function Credits({ onClose, onDatasets, team = readTeam(teamJson), credits = moonCredits, manifest = manifestJson as SiEntry[] }: Props) {
  const media = manifest.filter(e => ["image", "audio", "video"].includes(e.type));
  return (
    <section className="panel datasets credits-screen" aria-label="Credits" data-testid="credits">
      <h1>Credits</h1>

      <h2>Made by</h2>
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
      <button className="link" data-testid="credits-datasets" onClick={onDatasets}>See every source</button>

      <h2>Art and sound</h2>
      {credits.length ? (
        <ul data-testid="credits-assets">
          {credits.map(c => (
            <li key={c.file}>
              {c.source_url ? <a href={c.source_url} target="_blank" rel="noreferrer">{c.title}</a> : c.title} by {c.author} ({c.licence})
              {c.changes && <>, {c.changes}</>}
              {isSi(c) && <span className="si-tag"> · made with AI help ({c.si.replace(/^yes:?\s*/i, "") || "SI"})</span>}
            </li>
          ))}
        </ul>
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

      <button className="primary" data-testid="credits-close" onClick={onClose}>Back</button>
    </section>
  );
}
