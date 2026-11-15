/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
// Windows and macOS ignore letter case in file names, so "./Art" can find art.ts there
// while Linux finds Art.tsx (that broke the story screens on Windows in Step 7). This
// test fails if two files in one folder have names that differ only by case.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

function clashes(dir: string): string[] {
  const out: string[] = [];
  const seen = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { out.push(...clashes(p)); continue; }
    const key = name.replace(/\.[^.]+$/, "").toLowerCase();   // "Art.tsx" and "art.ts" both → "art"
    const had = seen.get(key);
    if (had && had !== name) out.push(`${join(dir, had)} and ${p}`);
    else seen.set(key, name);
  }
  return out;
}

test("no two files in a folder differ only by letter case (they'd clash on Windows and macOS)", () => {
  expect([...clashes("src"), ...clashes("scripts"), ...clashes("vite")]).toEqual([]);
});
