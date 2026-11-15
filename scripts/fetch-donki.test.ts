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
import { type Deps, fetchAll, fetchMonth, formatArchive, lastFullMonthEnd, months, redact, StopError } from "./fetch-donki";

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
});
