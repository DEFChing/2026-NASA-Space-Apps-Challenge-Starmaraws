/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Real NASA facts for the debrief (src/data/facts.json) and the art and sound credits
// (src/data/credits.json). The docs team writes the facts; the credits come from
// incoming/credits.csv through scripts/import-credits.ts. Both feed the Datasets page.

export const FACT_TAGS = ["radiation", "power", "warmth", "food", "moon", "general"] as const;
export type FactTag = (typeof FACT_TAGS)[number];

export interface Fact {
  id: string;
  text: string;                                         // one or two kid-level sentences
  tags: FactTag[];                                      // which debriefs it suits
  source: { name: string; url: string; refId: string }; // e.g. "NASA OSDR", its page, its dataset ID
}

export interface Credit {
  file: string; title: string; author: string; source_url: string; licence: string; changes: string; si: string;
}

const https = (u: unknown) => typeof u === "string" && /^https:\/\/\S+$/.test(u);

/** Check facts.json; every fact needs a real link and reference ID, never an invented number. */
export function checkFacts(json: unknown, file = "src/data/facts.json"): { facts: Fact[]; problems: string[] } {
  const problems: string[] = [];
  const list = (json as { facts?: unknown })?.facts;
  if (!Array.isArray(list)) return { facts: [], problems: [`${file}: needs a "facts" list`] };
  const seen = new Set<string>();
  list.forEach((f: Partial<Fact>, i) => {
    const at = `${file}: fact ${f?.id ?? `#${i + 1}`}`;
    if (!f?.id || typeof f.id !== "string") problems.push(`${at}: needs an id`);
    else if (seen.has(f.id)) problems.push(`${at}: id used twice`);
    else seen.add(f.id);
    if (typeof f?.text !== "string" || !f.text.trim()) problems.push(`${at}: needs text`);
    else if (f.text.length > 240) problems.push(`${at}: text is ${f.text.length} characters; keep it under 240 so it fits the debrief`);
    if (!Array.isArray(f?.tags) || !f.tags.length) problems.push(`${at}: needs at least one tag (${FACT_TAGS.join(", ")})`);
    else for (const t of f.tags) if (!FACT_TAGS.includes(t)) problems.push(`${at}: unknown tag "${t}"`);
    if (!f?.source?.name?.trim()) problems.push(`${at}: source needs a name`);
    if (!https(f?.source?.url)) problems.push(`${at}: source needs an https link`);
    if (!f?.source?.refId?.trim()) problems.push(`${at}: source needs a reference ID (dataset or page ID)`);
  });
  return { facts: problems.length ? [] : (list as Fact[]), problems };
}

/** A fact for this debrief: one tagged for what mattered most, else a general one; the seed picks among them. */
export function pickFact(facts: Fact[], want: FactTag[], seed: number): Fact | null {
  for (const tag of [...want, "general" as const]) {
    const fit = facts.filter(f => f.tags.includes(tag));
    if (fit.length) return fit[seed % fit.length];
  }
  return facts.length ? facts[seed % facts.length] : null;
}

export const CREDIT_COLUMNS: (keyof Credit)[] = ["file", "title", "author", "source_url", "licence", "changes", "si"];

/** Check credits.json rows (the incoming/credits.csv columns from the Art & Audio Asset Guide). */
export function checkCredits(json: unknown, file = "src/data/credits.json"): { credits: Credit[]; problems: string[] } {
  const problems: string[] = [];
  const list = (json as { credits?: unknown })?.credits;
  if (!Array.isArray(list)) return { credits: [], problems: [`${file}: needs a "credits" list`] };
  const seen = new Set<string>();
  list.forEach((c: Partial<Credit>, i) => {
    const at = `${file}: ${c?.file || `row ${i + 1}`}`;
    for (const k of ["file", "title", "author", "licence"] as const) if (!c?.[k]?.trim()) problems.push(`${at}: needs ${k}`);
    if (c?.file) { if (seen.has(c.file)) problems.push(`${at}: listed twice`); seen.add(c.file); }
    if (c?.source_url && !https(c.source_url)) problems.push(`${at}: source_url must be an https link`);
    if (c?.si && !/^(no|yes(:.*)?)$/i.test(c.si.trim())) problems.push(`${at}: si must be "no" or "yes: <tool>"`);
  });
  return { credits: problems.length ? [] : (list as Credit[]), problems };
}

/** Parse incoming/credits.csv (quoted fields may hold commas, and "" is a quote). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(c => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim())) rows.push(row);
  return rows;
}

/**
 * credits.csv text → credit rows; the header line names the columns. If a file has more
 * than one row (a corrected row added at the bottom), the last one wins and is reported.
 */
export function creditsFromCsv(text: string): { credits: Credit[]; problems: string[]; replaced: string[] } {
  const [head, ...body] = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!head) return { credits: [], problems: ["credits.csv is empty"], replaced: [] };
  const cols = head.map(h => h.trim().toLowerCase());
  const missing = CREDIT_COLUMNS.filter(c => !cols.includes(c));
  if (missing.length) {
    return { credits: [], problems: [`credits.csv: missing column(s) ${missing.join(", ")}; the first line must be ${CREDIT_COLUMNS.join(",")}`], replaced: [] };
  }
  const byFile = new Map<string, Credit>();
  const replaced: string[] = [];
  body.forEach((r, i) => {
    const c = Object.fromEntries(CREDIT_COLUMNS.map(k => [k, (r[cols.indexOf(k)] ?? "").trim()])) as unknown as Credit;
    const key = c.file || `(row ${i + 2})`;
    if (byFile.has(key)) replaced.push(key);
    byFile.set(key, c);
  });
  return { ...checkCredits({ credits: [...byFile.values()] }, "incoming/credits.csv"), replaced };
}
