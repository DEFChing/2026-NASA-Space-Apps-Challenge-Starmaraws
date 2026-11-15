/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The DONKI archive: NASA's space weather records, cut down to what the game uses.
// scripts/fetch-donki.ts downloads the raw records and calls buildArchive(); the game
// reads the result from src/data/donki.json.
//
// Field names checked against real DONKI responses (Nov 2026):
//   SEP:         sepID, eventTime "2026-01-18T22:55Z", instruments[{displayName}], link
//   FLR:         flrID, beginTime, peakTime, classType "X1.9", link
//   CMEAnalysis: associatedCMEID, time21_5, speed (km/s), isMostAccurate, link
// linkedEvents can be null rather than [], and an empty month can come back as an
// empty body, so nothing here assumes a field is present.

/** A solar energetic particle (SEP) event measured near Earth: a storm in the game. */
export interface DonkiStorm {
  id: string;          // DONKI activity ID, e.g. "2026-01-18T22:55:00-SEP-001"
  date: string;        // UTC day, "2026-01-18"
  link: string;        // the DONKI record (kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/...)
  instrument: string;  // first near-Earth instrument, e.g. "GOES-P: SEISS >10 MeV"
}
/** An M- or X-class flare (smaller flares aren't warning signs in the game). */
export interface DonkiFlare { date: string; cls: string }
/** A CME of 500 km/s or faster (slower ones aren't warning signs in the game). */
export interface DonkiCme { date: string; speed: number }

export interface DonkiArchive {
  source: string;
  fetched: string | null;                          // when the script ran (ISO time)
  range: { start: string; end: string } | null;    // UTC days covered, both included
  storms: DonkiStorm[];
  flares: DonkiFlare[];
  cmes: DonkiCme[];
  skipped?: { sepFarFromEarth: number; sepModel: number; sepNoInstrument: number };
  /**
   * False if flare records couldn't be downloaded (Nov 2026: api.nasa.gov's flare route
   * answered 404 and CCMC's DONKI site timed out from the Philippines). The warning signs
   * then use CMEs only. Missing means true (older files).
   */
  flaresAvailable?: boolean;
}

export const hasFlares = (a: Pick<DonkiArchive, "flaresAvailable">) => a.flaresAvailable !== false;

export const DONKI_SOURCE = "NASA CCMC Space Weather Database Of Notifications, Knowledge, Information (DONKI)";
export const MIN_FLARE = /^[MX]/;    // flare classes kept
export const MIN_CME_SPEED = 500;    // km/s

const TIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/;

/** "2026-01-18T22:55Z" → "2026-01-18", or null if it isn't a DONKI time. */
export function utcDay(time: unknown): string | null {
  const m = typeof time === "string" ? TIME.exec(time) : null;
  return m ? m[1] : null;
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Where the SEP was measured decides whether the Moon felt it. GOES, SOHO and ACE watch
 * near Earth (the Moon is about 384,000 km away and shares that space weather). STEREO-A
 * orbits the Sun far from Earth, and "MODEL:" entries are predictions, not measurements,
 * so neither counts as a storm.
 */
export function sepInstrument(raw: Raw): { ok: true; instrument: string } | { ok: false; why: "far" | "model" | "none" } {
  const names = (Array.isArray(raw.instruments) ? raw.instruments : [])
    .map(i => str((i as Raw)?.displayName).trim()).filter(Boolean);
  if (!names.length) return { ok: false, why: "none" };
  const near = names.find(n => /^(GOES|SOHO|ACE)\b/i.test(n));
  if (near) return { ok: true, instrument: near };
  return { ok: false, why: names.every(n => /^MODEL\b/i.test(n)) ? "model" : "far" };
}

export function normaliseSep(raw: Raw): DonkiStorm | { skip: "far" | "model" | "none" | "bad" } {
  const date = utcDay(raw.eventTime), id = str(raw.sepID), link = str(raw.link);
  if (!date || !id || !/^https:\/\//.test(link)) return { skip: "bad" };
  const where = sepInstrument(raw);
  if (!where.ok) return { skip: where.why };
  return { id, date, link, instrument: where.instrument };
}

export function normaliseFlare(raw: Raw): (DonkiFlare & { id: string }) | null {
  const cls = str(raw.classType).trim().toUpperCase();
  const date = utcDay(raw.peakTime) ?? utcDay(raw.beginTime);
  if (!date || !MIN_FLARE.test(cls)) return null;
  return { id: str(raw.flrID) || `${date}-${cls}`, date, cls };
}

export function normaliseCme(raw: Raw): (DonkiCme & { id: string }) | null {
  const speed = typeof raw.speed === "number" ? raw.speed : Number(raw.speed);
  const date = utcDay(raw.time21_5);
  if (!date || !Number.isFinite(speed) || speed < MIN_CME_SPEED) return null;
  if (raw.isMostAccurate === false) return null;
  return { id: str(raw.associatedCMEID) || `${date}-${speed}`, date, speed: Math.round(speed) };
}

const byDate = <T extends { date: string }>(a: T, b: T) => a.date.localeCompare(b.date);

/** Raw DONKI records → the archive the game reads. Duplicates (same DONKI ID) count once. */
export function buildArchive(
  raw: { sep: Raw[]; flr: Raw[]; cme: Raw[] },
  range: { start: string; end: string },
  fetched: string,
  opts: { flaresAvailable?: boolean } = {},
): DonkiArchive {
  const skipped = { sepFarFromEarth: 0, sepModel: 0, sepNoInstrument: 0 };
  const storms = new Map<string, DonkiStorm>();
  for (const r of raw.sep) {
    const s = normaliseSep(r);
    if ("skip" in s) {
      if (s.skip === "far") skipped.sepFarFromEarth++;
      else if (s.skip === "model") skipped.sepModel++;
      else if (s.skip === "none") skipped.sepNoInstrument++;
      continue;
    }
    if (s.date >= range.start && s.date <= range.end) storms.set(s.id, s);
  }
  const flares = new Map<string, DonkiFlare>();
  for (const r of raw.flr) {
    const f = normaliseFlare(r);
    if (f && f.date >= range.start && f.date <= range.end) flares.set(f.id, { date: f.date, cls: f.cls });
  }
  const cmes = new Map<string, DonkiCme>();
  for (const r of raw.cme) {
    const c = normaliseCme(r);
    if (!c || c.date < range.start || c.date > range.end) continue;
    const had = cmes.get(c.id);
    if (!had || c.speed > had.speed) cmes.set(c.id, { date: c.date, speed: c.speed });
  }
  return {
    source: DONKI_SOURCE, fetched, range,
    ...(opts.flaresAvailable === false ? { flaresAvailable: false } : {}),
    storms: [...storms.values()].sort(byDate),
    flares: [...flares.values()].sort(byDate),
    cmes: [...cmes.values()].sort(byDate),
    skipped,
  };
}

/**
 * Check a loaded donki.json. Returns the archive if it has data, null if it is the
 * empty file shipped before anyone ran fetch-donki, and throws if it is broken.
 */
export function loadArchive(json: unknown, file = "src/data/donki.json"): DonkiArchive | null {
  const a = json as Partial<DonkiArchive> | null;
  if (!a || typeof a !== "object") throw new Error(`${file}: not an archive`);
  if (!a.range) return null;
  const fail = (why: string) => { throw new Error(`${file}: ${why}`); };
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!day.test(a.range.start) || !day.test(a.range.end) || a.range.start > a.range.end) fail("bad range");
  for (const k of ["storms", "flares", "cmes"] as const) if (!Array.isArray(a[k])) fail(`${k} must be a list`);
  if (a.flaresAvailable === false && a.flares!.length) fail("flaresAvailable is false but flares are listed");
  for (const s of a.storms!) if (!day.test(s.date) || !s.id || !/^https:\/\//.test(s.link)) fail(`bad storm ${JSON.stringify(s)}`);
  for (const f of a.flares!) if (!day.test(f.date) || !MIN_FLARE.test(f.cls)) fail(`bad flare ${JSON.stringify(f)}`);
  for (const c of a.cmes!) if (!day.test(c.date) || !(c.speed >= MIN_CME_SPEED)) fail(`bad CME ${JSON.stringify(c)}`);
  return a as DonkiArchive;
}

/** The archive file written before the first download: no data, so the game uses practice weather. */
export const EMPTY_ARCHIVE: DonkiArchive = { source: DONKI_SOURCE, fetched: null, range: null, storms: [], flares: [], cmes: [] };
