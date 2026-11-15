/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { RAW_SEP } from "../src/engine/__fixtures__/donkiRaw";
import { buildArchive, loadArchive } from "../src/engine/donki";
import { checkApi, describeError, type Deps, fetchAll, fetchMonth, formatArchive, lastFullMonthEnd, months, redact, StopError } from "./fetch-donki";

const KEY = "SECRET-KEY-123";

type Reply = { status?: number; body?: string; remaining?: string; throws?: boolean };
function fakeDeps(replies: Reply[] | ((url: string) => Reply), extra: Partial<Deps> = {}) {
  const urls: string[] = [];
  let i = 0;
  const deps: Deps = {
    key: KEY, cacheDir: mkdtempSync(join(tmpdir(), "donki-")), now: new Date("2026-11-15T00:00:00Z"),
    sleep: async () => {},
    fetch: async (url: string) => {
      urls.push(url);
      const r = typeof replies === "function" ? replies(url) : replies[Math.min(i++, replies.length - 1)];
      if (r.throws) throw new Error(`connect failed for ${url}`);
      const status = r.status ?? 200;
      return {
        ok: status < 400, status, text: async () => r.body ?? "[]",
        headers: { get: (h: string) => (h === "x-ratelimit-remaining" ? r.remaining ?? null : null) },
      };
    },
    ...extra,
  };
  return { deps, urls };
}

const MAY = { key: "2024-05", start: "2024-05-01", end: "2024-05-31" };

describe("fetch-donki", () => {
  test("months are cut at the range ends; the default range ends with last month", () => {
    expect(months("2024-01-15", "2024-03-10")).toEqual([
      { key: "2024-01", start: "2024-01-15", end: "2024-01-31" },
      { key: "2024-02", start: "2024-02-01", end: "2024-02-29" },
      { key: "2024-03", start: "2024-03-01", end: "2024-03-10" },
    ]);
    expect(lastFullMonthEnd(new Date("2026-11-15T12:00:00Z"))).toBe("2026-10-31");
    expect(lastFullMonthEnd(new Date("2026-01-03T00:00:00Z"))).toBe("2025-12-31");
  });

  test("asks the right endpoints, with one most-accurate analysis per CME", async () => {
    const { deps, urls } = fakeDeps([{ body: "[]" }]);
    await fetchAll("2024-05-01", "2024-05-31", deps);
    expect(urls.map(u => u.replace(KEY, "KEY"))).toEqual([
      "https://api.nasa.gov/DONKI/SEP?startDate=2024-05-01&endDate=2024-05-31&api_key=KEY",
      "https://api.nasa.gov/DONKI/FLR?startDate=2024-05-01&endDate=2024-05-31&api_key=KEY",
      "https://api.nasa.gov/DONKI/CMEAnalysis?startDate=2024-05-01&endDate=2024-05-31&mostAccurateOnly=true&catalog=M2M_CATALOG&api_key=KEY",
    ]);
  });

  test("an empty body (DONKI's answer for a quiet month) is an empty list", async () => {
    const { deps } = fakeDeps([{ body: "" }]);
    expect(await fetchMonth("sep", MAY, deps)).toEqual([]);
  });

  test("finished months are cached; recent months are downloaded again", async () => {
    const { deps, urls } = fakeDeps([{ body: JSON.stringify(RAW_SEP.slice(0, 1)) }]);
    expect((await fetchMonth("sep", MAY, deps)).length).toBe(1);
    expect(existsSync(join(deps.cacheDir, "sep-2024-05.json"))).toBe(true);
    await fetchMonth("sep", MAY, deps);
    expect(urls.length).toBe(1);
    const recent = { key: "2026-10", start: "2026-10-01", end: "2026-10-31" };
    await fetchMonth("sep", recent, deps);
    await fetchMonth("sep", recent, deps);
    expect(urls.length).toBe(3);
    await fetchMonth("sep", MAY, { ...deps, refresh: true });
    expect(urls.length).toBe(4);
  });

  test("busy servers and dropped connections are retried, then it stops", async () => {
    const ok = fakeDeps([{ status: 503 }, { throws: true }, { status: 429 }, { body: "[]" }]);
    expect(await fetchMonth("flr", MAY, ok.deps)).toEqual([]);
    expect(ok.urls.length).toBe(4);
    const bad = fakeDeps([{ status: 503 }]);
    await expect(fetchMonth("flr", MAY, bad.deps)).rejects.toThrow(/HTTP 503/);
  });

  test("a refused key stops at once and points at .env, without printing the key", async () => {
    const { deps } = fakeDeps([{ status: 403 }]);
    const err = await fetchMonth("sep", MAY, deps).catch(e => e);
    expect(err).toBeInstanceOf(StopError);
    expect(err.message).toMatch(/NASA_API_KEY in \.env/);
    expect(err.message).not.toContain(KEY);
  });

  test("a network error never shows the key, even though the URL holds it", async () => {
    const { deps } = fakeDeps([{ throws: true }]);
    const err = await fetchMonth("sep", MAY, deps).catch(e => e);
    expect(err.message).toMatch(/network error/);
    expect(err.message).not.toContain(KEY);
    expect(redact(`https://x?api_key=${KEY}`, KEY)).toBe("https://x?api_key=***");
  });

  test("stops before the hourly limit runs out; the month it got is kept", async () => {
    const { deps } = fakeDeps([{ body: "[]", remaining: "5" }]);
    await expect(fetchMonth("sep", MAY, deps)).rejects.toThrow(/Wait an hour/);
    expect(existsSync(join(deps.cacheDir, "sep-2024-05.json"))).toBe(true);
  });

  test("--offline uses only downloaded months", async () => {
    const { deps, urls } = fakeDeps([{ body: "[]" }]);
    await expect(fetchMonth("sep", MAY, { ...deps, offline: true })).rejects.toThrow(/hasn't been downloaded/);
    await fetchMonth("sep", MAY, deps);
    await fetchMonth("sep", { ...MAY }, { ...deps, offline: true, now: new Date("2024-06-01T00:00:00Z") });
    expect(urls.length).toBe(1);
  });

  test("anything that isn't a list of records stops the run", async () => {
    await expect(fetchMonth("sep", MAY, fakeDeps([{ body: "<html>" }]).deps)).rejects.toThrow(/isn't JSON/);
    await expect(fetchMonth("sep", MAY, fakeDeps([{ body: '{"error":"x"}' }]).deps)).rejects.toThrow(/list of records/);
  });

  test("the written archive loads back exactly", () => {
    const a = buildArchive({ sep: RAW_SEP, flr: [], cme: [] }, { start: "2024-01-01", end: "2026-10-31" }, "2026-11-15T00:00:00Z");
    const text = formatArchive(a);
    expect(loadArchive(JSON.parse(text))).toEqual(a);
    expect(text.split("\n").filter(l => l.includes('"SEP"') || l.includes("-SEP-")).length).toBe(a.storms.length); // one storm per line
  });

  test("the cache file is the raw response, so --offline can rebuild it", async () => {
    const body = JSON.stringify(RAW_SEP);
    const { deps } = fakeDeps([{ body }]);
    await fetchMonth("sep", MAY, deps);
    expect(JSON.parse(readFileSync(join(deps.cacheDir, "sep-2024-05.json"), "utf8"))).toEqual(RAW_SEP);
  });

  test("a month no service has counts as empty, and is asked again next run", async () => {
    const notFound: string[] = [];
    const { deps, urls } = fakeDeps([{ status: 404, body: "" }, { status: 404, body: "" }, { status: 404, body: "" }, { body: "[]" }],
      { notFound, direct: new Map(), down: new Set() });
    expect(await fetchMonth("flr", MAY, deps)).toEqual([]);
    expect(urls.map(u => new URL(u).host)).toEqual(["api.nasa.gov", "ccmc.gsfc.nasa.gov", "kauai.ccmc.gsfc.nasa.gov"]);
    expect(notFound).toEqual(["flr 2024-05"]);
    expect(existsSync(join(deps.cacheDir, "flr-2024-05.json.404"))).toBe(true);
    await fetchMonth("flr", MAY, deps);                   // not trusted from the cache: asked again
    expect(urls.length).toBe(4);
    expect(existsSync(join(deps.cacheDir, "flr-2024-05.json.404"))).toBe(false);
    expect(await fetchMonth("flr", MAY, { ...deps, offline: true })).toEqual([]);
  });

  test("a 404 from api.nasa.gov is asked from CCMC's DONKI API (the address in its docs), without the key", async () => {
    const direct = new Map<"sep" | "flr" | "cme", "nasa" | "ccmc" | "kauai">();
    const logs: string[] = [];
    const { deps, urls } = fakeDeps([{ status: 404, body: '{"status":404,"error":"Not Found","path":"/DONKI-API/get/FLR/"}' }, { body: JSON.stringify([{ flrID: "x" }]) }],
      { direct, down: new Set(), log: m => logs.push(m) });
    expect(await fetchMonth("flr", MAY, deps)).toEqual([{ flrID: "x" }]);
    expect(urls[1]).toBe("https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR?startDate=2024-05-01&endDate=2024-05-31");
    expect(direct.get("flr")).toBe("ccmc");
    expect(logs.join()).toMatch(/getting it from the CCMC DONKI API/);
  });

  test("the Nov 2026 case: api.nasa.gov's flare route is broken, the old CCMC address is blocked, the DONKI API works", async () => {
    const logs: string[] = [];
    const { deps, urls } = fakeDeps(url =>
      url.startsWith("https://api.nasa.gov/DONKI/FLR") ? { status: 404, body: '{"status":404,"error":"Not Found","path":"/DONKI-API/get/FLR/"}' }
      : url.includes("kauai") ? { throws: true }
      : url.includes("ccmc.gsfc.nasa.gov/DONKI-API/get/FLR?") ? { body: JSON.stringify([{ flrID: url.slice(-10) }]) }
      : { body: "[]" }, { log: m => logs.push(m) });
    const raw = await fetchAll("2024-01-01", "2024-06-30", deps);
    expect(raw.flaresAvailable).toBe(true);
    expect(raw.flr.length).toBe(6);
    const flr = urls.filter(u => u.includes("/FLR"));
    expect(flr.filter(u => u.startsWith("https://api.nasa.gov")).length).toBe(1);   // asked once, then straight to CCMC
    expect(flr.filter(u => u.startsWith("https://ccmc.gsfc.nasa.gov/DONKI-API/")).length).toBe(6);
    expect(urls.some(u => u.includes("kauai"))).toBe(false);
    expect(urls.filter(u => u.includes("/SEP")).every(u => u.startsWith("https://api.nasa.gov"))).toBe(true);
  });

  test("a 404 error from the api.nasa.gov gateway stops the run", async () => {
    const { deps } = fakeDeps([{ status: 404, body: '{"error":{"code":"NOT_FOUND","message":"No api found"}}' }]);
    await expect(fetchMonth("flr", MAY, deps)).rejects.toThrow(/gateway said NOT_FOUND .*--check/);
  });

  test("a few empty early months are fine; many 404s stop the run instead of building a hollow archive", async () => {
    const logs: string[] = [];
    const few = fakeDeps(url => (/FLR\?startDate=2010-0[12]/.test(url) ? { status: 404, body: "" } : { body: "[]" }), { log: m => logs.push(m) });
    await fetchAll("2010-01-01", "2010-12-31", few.deps);
    expect(logs.join("\n")).toMatch(/FLR: no records \(HTTP 404\) for 2010-01, 2010-02/);
    const many = fakeDeps(url => (/CMEAnalysis/.test(url) ? { status: 404, body: "" } : { body: "[]" }));
    await expect(fetchAll("2010-01-01", "2010-12-31", many.deps)).rejects.toThrow(/"not found" for 12 of 12 months of CMEAnalysis/);
  });

  test("--check asks every address and shows status and a sample, with the key hidden", async () => {
    const logs: string[] = [];
    const { deps } = fakeDeps(url => (url.startsWith("https://api.nasa.gov/DONKI/FLR") ? { status: 404, body: `nothing for ${KEY}` } : { body: "[]" }));
    await checkApi({ ...deps, log: m => logs.push(m) });
    expect(logs.length).toBe(18);
    expect(logs.find(l => l.startsWith("api.nasa.gov FLR") && l.includes("2010-01"))).toMatch(/HTTP 404 {2}not JSON {2}nothing for \*\*\*/);
    expect(logs.find(l => l.startsWith("CCMC DONKI API FLR") && l.includes("2024-05"))).toMatch(/HTTP 200 {2}0 records/);
    expect(logs.join("\n")).not.toContain(KEY);
  });

  test("network errors show Node's hidden reason, never the key", () => {
    const err = new TypeError("fetch failed", { cause: Object.assign(new Error(`unable to verify the first certificate for ${KEY}`), { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" }) });
    expect(describeError(err, KEY)).toBe("fetch failed ← UNABLE_TO_VERIFY_LEAF_SIGNATURE: unable to verify the first certificate for ***");
    expect(describeError("plain", KEY)).toBe("plain");
  });

  describe("when flares can't be had (your network, Nov 2026)", () => {
    const BROKEN = '{"status":404,"error":"Not Found","path":"/DONKI-API/get/FLR/"}';
    const network = (url: string): Reply =>
      url.startsWith("https://api.nasa.gov/DONKI/FLR") ? { status: 404, body: BROKEN }
      : url.includes("ccmc.gsfc.nasa.gov") ? { throws: true }    // both CCMC addresses unreachable
      : url.includes("/SEP") ? { body: JSON.stringify(RAW_SEP.slice(0, 1)) }
      : { body: "[]" };

    test("api.nasa.gov 404 and both CCMC addresses unreachable: built without flares, each address tried only once", async () => {
      const logs: string[] = [];
      const { deps, urls } = fakeDeps(network, { log: m => logs.push(m) });
      const raw = await fetchAll("2024-01-01", "2024-12-31", deps);
      expect(raw.flaresAvailable).toBe(false);
      expect(raw.flr).toEqual([]);
      expect(raw.sep.length).toBe(12);
      expect(urls.filter(u => u.includes("kauai")).length).toBe(4);   // one month, with its retries
      expect(urls.filter(u => u.startsWith("https://ccmc.gsfc.nasa.gov")).length).toBe(4);
      expect(logs.join("\n")).toMatch(/can't be reached from this network/);
      expect(logs.join("\n")).toMatch(/warning signs will use CMEs only/);
      const a = buildArchive(raw, { start: "2024-01-01", end: "2024-12-31" }, "x", { flaresAvailable: raw.flaresAvailable });
      expect(loadArchive(JSON.parse(formatArchive(a)))).toEqual(a);
      expect(JSON.parse(formatArchive(a)).flaresAvailable).toBe(false);
    });

    test("a rebuild from the cache remembers the flares were missing", async () => {
      const { deps } = fakeDeps(network);
      await fetchAll("2024-01-01", "2024-03-31", deps);
      const again = await fetchAll("2024-01-01", "2024-03-31", { ...deps, offline: true });
      expect(again.flaresAvailable).toBe(false);
    });

    test("--no-flares doesn't ask for flares at all", async () => {
      const { deps, urls } = fakeDeps(network, { skip: new Set(["flr"]) });
      const raw = await fetchAll("2024-01-01", "2024-03-31", deps);
      expect(raw.flaresAvailable).toBe(false);
      expect(urls.some(u => u.includes("/FLR"))).toBe(false);
    });

    test("storms or CMEs missing still stop the run; so do flares missing for only some months", async () => {
      const noSep = fakeDeps(url => (url.includes("/SEP") ? { status: 404, body: "" } : url.includes("ccmc.gsfc.nasa.gov") ? { throws: true } : { body: "[]" }));
      await expect(fetchAll("2024-01-01", "2024-12-31", noSep.deps)).rejects.toThrow(/months of SEP/);
      const someFlr = fakeDeps(url => (/FLR\?startDate=2024-0[1-4]/.test(url) ? { status: 404, body: "" } : url.includes("ccmc.gsfc.nasa.gov") ? { throws: true } : { body: "[]" }));
      await expect(fetchAll("2024-01-01", "2024-12-31", someFlr.deps)).rejects.toThrow(/4 of 12 months of FLR/);
    });
  });
});
