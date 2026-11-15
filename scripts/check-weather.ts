/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 *
 * check-weather: how the committed DONKI archive plays. Reports the archive, the
 * measured odds, how many turns get storms, and what share of seeds the run checker
 * can win for each specialist (with practice weather alongside, for comparison).
 *
 *   npm run check-weather              # 150 seeds per specialist (a minute or two)
 *   npm run check-weather -- 400       # more seeds, steadier numbers
 */
import { readFileSync } from "node:fs";
import { runMaker } from "../src/engine/data";
import { loadArchive } from "../src/engine/donki";
import { loadForecastOdds, oddsWarnings } from "../src/engine/forecast";
import { isWinnable, QUICK_LIMIT } from "../src/engine/solver";
import type { Specialist } from "../src/engine/types";
import { indexArchive, startDays } from "../src/engine/weather";

const seeds = Number(process.argv[2] ?? 150);
const archive = loadArchive(JSON.parse(readFileSync("src/data/donki.json", "utf8")));
const odds = loadForecastOdds(JSON.parse(readFileSync("src/data/forecast-odds.json", "utf8")));
let problems = 0;

if (!archive) {
  console.log("check-weather: src/data/donki.json has no data yet, so the game uses practice weather. Run npm run fetch-donki.");
} else {
  const ix = indexArchive(archive);
  console.log(`Archive: ${archive.range!.start} to ${archive.range!.end} (fetched ${archive.fetched})`);
  console.log(`  ${archive.storms.length} storms, ${archive.flares.length} M/X flares, ${archive.cmes.length} fast CMEs; ${startDays(ix, 8).count} possible start days`);
  if (JSON.stringify(odds.archive) !== JSON.stringify(archive.range)) {
    console.log("  PROBLEM: forecast-odds.json wasn't measured from this archive. Run npm run build-forecast.");
    problems++;
  }
  if (odds.tiers) for (const [k, t] of Object.entries(odds.tiers)) console.log(`  forecast ${k.padEnd(6)} ${t.label.padEnd(18)} (${t.withStorm}/${t.windows} windows)`);
  for (const w of oddsWarnings(odds)) console.log(`  WARNING: ${w}`);
}

const table = (label: string, make: ReturnType<typeof runMaker>) => {
  let stormTurns = 0, turns = 0;
  const cells: string[] = [];
  for (const sp of ["engineer", "botanist", "doctor"] as Specialist[]) {
    let won = 0, unsure = 0;
    for (let seed = 0; seed < seeds; seed++) {
      const { state, ctx } = make(seed, sp);
      if (sp === "engineer") { stormTurns += ctx.weather.filter(w => w.storm).length; turns += ctx.weather.length; }
      const r = isWinnable(state, ctx, QUICK_LIMIT).winnable;
      if (r) won++; else if (r === null) unsure++;
    }
    cells.push(`${sp} ${Math.round((100 * won) / seeds)}%${unsure ? ` (+${unsure} too slow to check)` : ""}`);
  }
  console.log(`${label.padEnd(16)} storms on ${Math.round((100 * stormTurns) / turns)}% of turns · winnable: ${cells.join(" · ")}`);
};

console.log(`\nChecking ${seeds} seeds per specialist…`);
table("Practice weather", runMaker(null));
if (archive) table("DONKI weather", runMaker(archive));
console.log("\nThe game only hands out seeds the checker can win, so a lower share means a longer search, not unwinnable missions.");
process.exit(problems ? 1 : 0);
