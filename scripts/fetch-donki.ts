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
 *   npm run fetch-donki -- --check           # show what NASA sends for two sample months
 *   npm run fetch-donki -- --no-flares       # skip flares; the warning signs use CMEs only
 *
 * The key comes from NASA_API_KEY in .env and is never printed. Downloaded months are
 * cached in node_modules/.cache/donki, so if the run stops (network, rate limit) just
 * run it again and it carries on. The last 60 days are always downloaded fresh,
 * because DONKI keeps revising recent records.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { buildArchive, type DonkiArchive } from "../src/engine/donki";
import { buildForecastOdds, oddsWarnings } from "../src/engine/forecast";

type Raw = Record<string, unknown>;
export type Kind = "sep" | "flr" | "cme";

export const API = "https://api.nasa.gov/DONKI";
/**
 * NASA CCMC's own DONKI API (docs: ccmc.gsfc.nasa.gov, "Get Solar Flares (FLR)": GET
 * /get/FLR, at most a 60-day window). api.nasa.gov forwards to it; in Nov 2026 the
 * forward for flares added a trailing slash (/DONKI-API/get/FLR/) and got 404, so the
 * script asks this address directly. No key needed.
 */
export const CCMC = "https://ccmc.gsfc.nasa.gov/DONKI-API/get";
/** CCMC's older DONKI web service address, tried last (it timed out from the Philippines). */
export const KAUAI = "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get";
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

/**
 * Node's fetch says only "fetch failed"; the reason (a certificate it can't verify, a
 * timeout, a blocked connection) is in err.cause. Show it, with the key hidden.
 */
export function describeError(err: unknown, key: string): string {
  const e = err as { message?: string; cause?: { code?: string; message?: string; cause?: { code?: string; message?: string } } };
  const parts = [e?.message ?? String(err)];
  for (let c = e?.cause, depth = 0; c && depth < 3; c = (c as { cause?: typeof c }).cause, depth++) {
    parts.push([c.code, c.message].filter(Boolean).join(": "));
  }
  return redact(parts.filter(Boolean).join(" ← "), key);
}

export interface Deps {
  fetch: (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string>; headers: { get(name: string): string | null } }>;
  key: string;
  cacheDir: string;
  now: Date;
  offline?: boolean;
  refresh?: boolean;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
  notFound?: string[];   // months nobody had records for (fetchAll fills this)
  direct?: Map<Kind, Source>;  // where a record type is being fetched from this run (fetchAll fills this)
  down?: Set<Source>;          // addresses that couldn't be reached this run: stop asking them
  skip?: Set<Kind>;      // record types not to download at all (--no-flares)
}

export class StopError extends Error {}

const RETRY_MS = [2000, 5000, 15000];

type Month = { key: string; start: string; end: string };
export type Source = "nasa" | "ccmc" | "kauai";
export const SOURCE_LABEL: Record<Source, string> = { nasa: "api.nasa.gov", ccmc: "CCMC DONKI API", kauai: "CCMC old service" };
/** Where to ask, in order, when api.nasa.gov answers 404. */
const FALLBACKS: Source[] = ["ccmc", "kauai"];

/** The request for one month: api.nasa.gov (needs the key), or CCMC's own DONKI addresses (no key). */
export function urlFor(kind: Kind, m: Month, source: Source, key: string): string {
  const q = `startDate=${m.start}&endDate=${m.end}${EXTRA[kind]}`;
  if (source === "nasa") return `${API}/${ENDPOINT[kind]}?${q}&api_key=${key}`;
  return `${source === "ccmc" ? CCMC : KAUAI}/${ENDPOINT[kind]}?${q}`;
}

type Answer = { notFound: true; body: string } | { notFound: false; records: Raw[]; left: number | null };

/** One request with retries: busy servers and dropped connections are tried again; 404 is reported, not retried. */
async function ask(url: string, what: string, deps: Deps): Promise<Answer> {
  const sleep = deps.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await deps.fetch(url);
    } catch (err) {
      if (attempt >= RETRY_MS.length) throw new StopError(`network error on ${what}: ${describeError(err, deps.key)}`);
      await sleep(RETRY_MS[attempt]);
      continue;
    }
    if (res.status === 403 || res.status === 401) throw new StopError("NASA refused the key (HTTP " + res.status + "). Check NASA_API_KEY in .env: no spaces or quotes.");
    if (res.status === 404) return { notFound: true, body: redact((await res.text()).trim().slice(0, 500), deps.key) };
    if (!res.ok) {
      if ([429, 500, 502, 503, 504].includes(res.status) && attempt < RETRY_MS.length) { await sleep(RETRY_MS[attempt]); continue; }
      throw new StopError(`HTTP ${res.status} on ${what}${res.status === 429 ? " (rate limit: wait an hour, then run again)" : ""}`);
    }
    const body = (await res.text()).trim();
    let records: unknown;
    try { records = body ? JSON.parse(body) : []; } catch { throw new StopError(`${what}: NASA sent something that isn't JSON`); }
    if (!Array.isArray(records)) throw new StopError(`${what}: expected a list of records`);
    const header = res.headers.get("x-ratelimit-remaining");
    const left = header !== null && Number.isFinite(Number(header)) ? Number(header) : null;
    return { notFound: false, records: records as Raw[], left };
  }
}

/**
 * One month of one record type, from the cache or from NASA. api.nasa.gov is asked
 * first. If it answers 404 (in Nov 2026 its flare route did, for every month), the same
 * month is asked from CCMC's own DONKI API, then its older address; once one works, the
 * rest of the run asks it directly for that record type.
 */
export async function fetchMonth(kind: Kind, m: Month, deps: Deps): Promise<Raw[]> {
  const sleep = deps.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  const file = `${deps.cacheDir}/${kind}-${m.key}.json`;
  const marker = `${file}.404`;   // nobody had this month last time: ask again next run
  const recent = deps.now.getTime() - Date.parse(`${m.end}T00:00:00Z`) < 60 * DAY_MS;
  const what = `${kind} ${m.key}`;
  if (deps.skip?.has(kind)) { deps.notFound?.push(what); return []; }
  if (existsSync(file) && (deps.offline || (!deps.refresh && !recent && !existsSync(marker)))) {
    if (existsSync(marker)) deps.notFound?.push(what);   // still missing from last time
    return JSON.parse(readFileSync(file, "utf8"));
  }
  if (deps.offline) throw new StopError(`--offline: ${kind} ${m.key} hasn't been downloaded yet`);

  const first: Source = deps.direct?.get(kind) ?? "nasa";
  let answer = await ask(urlFor(kind, m, first, deps.key), what, deps);
  if (answer.notFound && first === "nasa") {
    // A gateway error object ({"error":{"code":...}}) means a problem with the key or account, not the route.
    let code = "";
    try { code = (JSON.parse(answer.body) as { error?: { code?: string } })?.error?.code ?? ""; } catch { /* not JSON */ }
    if (code) throw new StopError(`NASA's gateway said ${code} (HTTP 404) on ${what}. Run npm run fetch-donki -- --check and send Claude the output.`);
    for (const alt of FALLBACKS) {
      if (deps.down?.has(alt)) continue;
      try {
        const viaAlt = await ask(urlFor(kind, m, alt, deps.key), `${what} (${SOURCE_LABEL[alt]})`, deps);
        if (viaAlt.notFound) continue;
        if (deps.direct && !deps.direct.has(kind)) {
          deps.direct.set(kind, alt);
          deps.log?.(`  api.nasa.gov answers 404 for ${ENDPOINT[kind]}; getting it from the ${SOURCE_LABEL[alt]} instead`);
        }
        answer = viaAlt;
        break;
      } catch (err) {
        // Can't reach that address at all (a timeout or a blocked network): note it once and stop asking it.
        if (!(err instanceof StopError) || !err.message.startsWith("network error") || !deps.down) throw err;
        deps.down.add(alt);
        deps.log?.(`  The ${SOURCE_LABEL[alt]} can't be reached from this network (${err.message.replace(/^network error on [^:]+: /, "")})`);
      }
    }
  }

  mkdirSync(deps.cacheDir, { recursive: true });
  if (answer.notFound) {
    deps.notFound?.push(what);
    writeFileSync(file, "[]");
    writeFileSync(marker, answer.body);
    await sleep(250);
    return [];
  }
  writeFileSync(file, JSON.stringify(answer.records));
  if (existsSync(marker)) rmSync(marker);
  if (answer.left !== null && answer.left < 10) {
    throw new StopError(`Only ${answer.left} requests left this hour. Wait an hour and run again; the months downloaded so far are kept.`);
  }
  await sleep(250); // be polite to the API
  return answer.records;
}

/** More "not found" months than this for one record type means something is wrong, not quiet months. */
export const MAX_NOT_FOUND_SHARE = 0.1;

export type Downloaded = Record<Kind, Raw[]> & { flaresAvailable: boolean };

export async function fetchAll(from: string, to: string, deps: Deps): Promise<Downloaded> {
  const out: Downloaded = { sep: [], flr: [], cme: [], flaresAvailable: true };
  const list = months(from, to);
  const notFound: string[] = [];
  deps = { ...deps, notFound, direct: deps.direct ?? new Map(), down: deps.down ?? new Set() };
  for (const [i, m] of list.entries()) {
    for (const kind of Object.keys(ENDPOINT) as Kind[]) out[kind].push(...await fetchMonth(kind, m, deps));
    if (i % 12 === 11 || i === list.length - 1) deps.log?.(`  ${m.key} done (${i + 1}/${list.length} months)`);
  }
  for (const kind of Object.keys(ENDPOINT) as Kind[]) {
    const missing = notFound.filter(n => n.startsWith(`${kind} `)).map(n => n.slice(kind.length + 1));
    if (!missing.length) continue;
    const allowed = Math.max(2, Math.floor(list.length * MAX_NOT_FOUND_SHARE));
    // No flare month at all: build the archive without flares (the warning signs use CMEs only).
    // Rerun later and, if a service has them, the flares come back.
    if (kind === "flr" && missing.length === list.length) {
      out.flaresAvailable = false;
      out.flr = [];
      deps.log?.(deps.skip?.has("flr")
        ? "  FLR: skipped (--no-flares); the forecast's warning signs will use CMEs only"
        : "  FLR: no service had flare records for any month; the forecast's warning signs will use CMEs only. Run fetch-donki again later to add flares.");
      continue;
    }
    if (missing.length > allowed) {
      throw new StopError(`NASA answered "not found" for ${missing.length} of ${list.length} months of ${ENDPOINT[kind]} (${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ", …" : ""}). That's too many to be quiet months. Run npm run fetch-donki -- --check and send Claude the output.`);
    }
    deps.log?.(`  ${ENDPOINT[kind]}: no records (HTTP 404) for ${missing.join(", ")}; counted as empty months`);
  }
  return out;
}

/** --check: ask both services for one early and one recent month of each record type and show what comes back. */
export async function checkApi(deps: Pick<Deps, "fetch" | "key" | "log">) {
  for (const month of [{ key: "2010-01", start: "2010-01-01", end: "2010-01-31" }, { key: "2024-05", start: "2024-05-01", end: "2024-05-31" }]) {
    for (const source of ["nasa", ...FALLBACKS] as Source[]) {
      for (const kind of Object.keys(ENDPOINT) as Kind[]) {
        const label = `${SOURCE_LABEL[source]} ${ENDPOINT[kind]}`.padEnd(29);
        try {
          const res = await deps.fetch(urlFor(kind, month, source, deps.key));
          const body = (await res.text()).replace(/\s+/g, " ").trim();
          const count = (() => { try { const j = JSON.parse(body); return Array.isArray(j) ? `${j.length} records` : "not a list"; } catch { return body ? "not JSON" : "empty body"; } })();
          deps.log?.(`${label} ${month.key}  HTTP ${res.status}  ${count}  ${redact(body.slice(0, 120), deps.key)}`);
        } catch (err) {
          deps.log?.(`${label} ${month.key}  network error: ${describeError(err, deps.key)}`);
        }
      }
    }
  }
}

/** donki.json with one record per line, so a re-download shows a readable diff. */
export function formatArchive(a: DonkiArchive): string {
  const list = (xs: unknown[]) => (xs.length ? `[\n    ${xs.map(x => JSON.stringify(x)).join(",\n    ")}\n  ]` : "[]");
  return `{
  "source": ${JSON.stringify(a.source)},
  "fetched": ${JSON.stringify(a.fetched)},
  "range": ${JSON.stringify(a.range)},
  "skipped": ${JSON.stringify(a.skipped ?? null)},${a.flaresAvailable === false ? '\n  "flaresAvailable": false,' : ""}
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

  if (process.argv.includes("--check")) {
    console.log("fetch-donki --check: what NASA sends back (the key is hidden)");
    await checkApi({ fetch: (u: string) => fetch(u), key, log: m => console.log(m) });
    return;
  }

  console.log(`fetch-donki: ${from} → ${to}${offline ? " (offline)" : ""}`);
  const raw = await fetchAll(from, to, {
    fetch: (u: string) => fetch(u), key, offline, refresh: process.argv.includes("--refresh"),
    cacheDir: "node_modules/.cache/donki", now: new Date(), log: m => console.log(m),
    skip: new Set<Kind>(process.argv.includes("--no-flares") ? ["flr"] : []),
  });
  for (const kind of Object.keys(ENDPOINT) as Kind[]) {
    if (kind === "flr" && !raw.flaresAvailable) continue;
    const first = raw[kind][0];
    console.log(`  ${ENDPOINT[kind]}: ${raw[kind].length} records; fields: ${first ? Object.keys(first).join(", ") : "(none)"}`);
  }

  const archive = buildArchive(raw, { start: from, end: to }, new Date().toISOString(), { flaresAvailable: raw.flaresAvailable });
  writeFileSync("src/data/donki.json", formatArchive(archive));
  const odds = buildForecastOdds(archive);
  writeFileSync("src/data/forecast-odds.json", JSON.stringify(odds, null, 2) + "\n");

  const s = archive.skipped!;
  console.log(`\nWrote src/data/donki.json: ${archive.storms.length} storms (SEP events measured near Earth), ${archive.flaresAvailable === false ? "no flare records (warning signs: CMEs only)" : `${archive.flares.length} M/X flares`}, ${archive.cmes.length} CMEs of 500 km/s or more.`);
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
