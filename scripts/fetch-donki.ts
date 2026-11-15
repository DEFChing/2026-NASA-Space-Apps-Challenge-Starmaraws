/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 *
 * fetch-donki: downloads NASA's DONKI space weather records (SEP events, flares and
 * CME analyses) month by month, keeps what the game uses, and writes
 * src/data/donki.json and src/data/forecast-odds.json.
 *
 *   npm run fetch-donki                      # 2010-01-01 to the end of last month
 *   npm run fetch-donki -- --from 2014-01-01 --to 2025-12-31
 *   npm run fetch-donki -- --offline         # rebuild from the downloaded months only
 *
 * The key comes from NASA_API_KEY in .env and is never printed. Downloaded months are
 * cached in node_modules/.cache/donki, so if the run stops (network, rate limit) just
 * run it again and it carries on. The last 60 days are always downloaded fresh,
 * because DONKI keeps revising recent records.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { buildArchive, type DonkiArchive } from "../src/engine/donki";
import { buildForecastOdds, oddsWarnings } from "../src/engine/forecast";

type Raw = Record<string, unknown>;
export type Kind = "sep" | "flr" | "cme";

export const API = "https://api.nasa.gov/DONKI";
export const ENDPOINT: Record<Kind, string> = { sep: "SEP", flr: "FLR", cme: "CMEAnalysis" };
// One most-accurate analysis per CME, from the main catalogue (ALL would add copies from other catalogues).
const EXTRA: Record<Kind, string> = { sep: "", flr: "", cme: "&mostAccurateOnly=true&catalog=M2M_CATALOG" };

export const DEFAULT_FROM = "2010-01-01";
const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The last day of the month before `now` (UTC). */
export function lastFullMonthEnd(now: Date): string {
  return iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)));
}

/** Calendar months covering [from, to], each clipped to that range. */
export function months(from: string, to: string): { key: string; start: string; end: string }[] {
  const out = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  let d = new Date(`${from}T00:00:00Z`);
  while (d.getTime() <= end) {
    const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    out.push({ key: iso(d).slice(0, 7), start: iso(d), end: iso(new Date(Math.min(monthEnd.getTime(), end))) });
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
  return out;
}

export const redact = (text: string, key: string) => (key ? text.split(key).join("***") : text);

export interface Deps {
  fetch: (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string>; headers: { get(name: string): string | null } }>;
  key: string;
  cacheDir: string;
  now: Date;
  offline?: boolean;
  refresh?: boolean;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

export class StopError extends Error {}

const RETRY_MS = [2000, 5000, 15000];

/** One month of one record type, from the cache or from NASA. */
export async function fetchMonth(kind: Kind, m: { key: string; start: string; end: string }, deps: Deps): Promise<Raw[]> {
  const sleep = deps.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  const file = `${deps.cacheDir}/${kind}-${m.key}.json`;
  const recent = deps.now.getTime() - Date.parse(`${m.end}T00:00:00Z`) < 60 * DAY_MS;
  if (existsSync(file) && (deps.offline || (!deps.refresh && !recent))) return JSON.parse(readFileSync(file, "utf8"));
  if (deps.offline) throw new StopError(`--offline: ${kind} ${m.key} hasn't been downloaded yet`);

  const url = `${API}/${ENDPOINT[kind]}?startDate=${m.start}&endDate=${m.end}${EXTRA[kind]}&api_key=${deps.key}`;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await deps.fetch(url);
    } catch (err) {
      if (attempt >= RETRY_MS.length) throw new StopError(`network error on ${kind} ${m.key}: ${redact(String(err), deps.key)}`);
      await sleep(RETRY_MS[attempt]);
      continue;
    }
    if (res.status === 403 || res.status === 401) throw new StopError("NASA refused the key (HTTP " + res.status + "). Check NASA_API_KEY in .env: no spaces or quotes.");
    if (!res.ok) {
      if ([429, 500, 502, 503, 504].includes(res.status) && attempt < RETRY_MS.length) { await sleep(RETRY_MS[attempt]); continue; }
      throw new StopError(`HTTP ${res.status} on ${kind} ${m.key}${res.status === 429 ? " (rate limit: wait an hour, then run again)" : ""}`);
    }
    const body = (await res.text()).trim();
    let records: unknown;
    try { records = body ? JSON.parse(body) : []; } catch { throw new StopError(`${kind} ${m.key}: NASA sent something that isn't JSON`); }
    if (!Array.isArray(records)) throw new StopError(`${kind} ${m.key}: expected a list of records`);
    mkdirSync(deps.cacheDir, { recursive: true });
    writeFileSync(file, JSON.stringify(records));
    const left = Number(res.headers.get("x-ratelimit-remaining"));
    if (Number.isFinite(left) && res.headers.get("x-ratelimit-remaining") !== null && left < 10) {
      throw new StopError(`Only ${left} requests left this hour. Wait an hour and run again; the months downloaded so far are kept.`);
    }
    await sleep(250); // be polite to the API
    return records as Raw[];
  }
}

export async function fetchAll(from: string, to: string, deps: Deps): Promise<Record<Kind, Raw[]>> {
  const out: Record<Kind, Raw[]> = { sep: [], flr: [], cme: [] };
  const list = months(from, to);
  for (const [i, m] of list.entries()) {
    for (const kind of Object.keys(ENDPOINT) as Kind[]) out[kind].push(...await fetchMonth(kind, m, deps));
    if (i % 12 === 11 || i === list.length - 1) deps.log?.(`  ${m.key} done (${i + 1}/${list.length} months)`);
  }
  return out;
}

/** donki.json with one record per line, so a re-download shows a readable diff. */
export function formatArchive(a: DonkiArchive): string {
  const list = (xs: unknown[]) => (xs.length ? `[\n    ${xs.map(x => JSON.stringify(x)).join(",\n    ")}\n  ]` : "[]");
  return `{
  "source": ${JSON.stringify(a.source)},
  "fetched": ${JSON.stringify(a.fetched)},
  "range": ${JSON.stringify(a.range)},
  "skipped": ${JSON.stringify(a.skipped ?? null)},
  "storms": ${list(a.storms)},
  "flares": ${list(a.flares)},
  "cmes": ${list(a.cmes)}
}
`;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/** Refuse to run if .env could end up on GitHub. */
function checkEnvIgnored() {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
  } catch {
    return; // not a Git checkout (e.g. a copy): nothing can be committed from here
  }
  try {
    execFileSync("git", ["check-ignore", "-q", ".env"], { stdio: "ignore" });
  } catch {
    throw new StopError(".env isn't in .gitignore, so the NASA key could be committed. Add it first:\n  echo .env >> .gitignore");
  }
}

async function main() {
  const offline = process.argv.includes("--offline");
  const from = arg("from") ?? DEFAULT_FROM;
  const to = arg("to") ?? lastFullMonthEnd(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new StopError(`bad range ${from} → ${to}`);

  let key = "";
  if (!offline) {
    checkEnvIgnored();
    if (existsSync(".env")) process.loadEnvFile(".env");
    key = (process.env.NASA_API_KEY ?? "").trim();
    if (!key) throw new StopError("NASA_API_KEY is missing. Put NASA_API_KEY=<your key> in .env (see Step 0.11).");
  }

  console.log(`fetch-donki: ${from} → ${to}${offline ? " (offline)" : ""}`);
  const raw = await fetchAll(from, to, {
    fetch: (u: string) => fetch(u), key, offline, refresh: process.argv.includes("--refresh"),
    cacheDir: "node_modules/.cache/donki", now: new Date(), log: m => console.log(m),
  });
  for (const kind of Object.keys(raw) as Kind[]) {
    const first = raw[kind][0];
    console.log(`  ${ENDPOINT[kind]}: ${raw[kind].length} records; fields: ${first ? Object.keys(first).join(", ") : "(none)"}`);
  }

  const archive = buildArchive(raw, { start: from, end: to }, new Date().toISOString());
  writeFileSync("src/data/donki.json", formatArchive(archive));
  const odds = buildForecastOdds(archive);
  writeFileSync("src/data/forecast-odds.json", JSON.stringify(odds, null, 2) + "\n");

  const s = archive.skipped!;
  console.log(`\nWrote src/data/donki.json: ${archive.storms.length} storms (SEP events measured near Earth), ${archive.flares.length} M/X flares, ${archive.cmes.length} CMEs of 500 km/s or more.`);
  console.log(`  Not counted as storms: ${s.sepFarFromEarth} SEP records seen only far from Earth (STEREO), ${s.sepModel} model predictions, ${s.sepNoInstrument} with no instrument.`);
  console.log("Wrote src/data/forecast-odds.json:");
  for (const [k, t] of Object.entries(odds.tiers!)) console.log(`  ${k.padEnd(6)} ${t.label.padEnd(18)} (${t.withStorm} of ${t.windows} windows had a storm)`);
  for (const w of oddsWarnings(odds)) console.log(`  WARNING: ${w}`);
  console.log("\nNext: npm run check-weather, then commit both files.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(`fetch-donki: ${err instanceof StopError ? err.message : err}`);
    process.exit(1);
  });
}
