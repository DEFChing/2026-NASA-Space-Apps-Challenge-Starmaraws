/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 *
 * build-forecast: measures the forecast odds from src/data/donki.json and writes
 * src/data/forecast-odds.json. fetch-donki already does this after every download;
 * run it on its own only if you change the warning-sign rule in src/engine/weather.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadArchive } from "../src/engine/donki";
import { buildForecastOdds, oddsWarnings } from "../src/engine/forecast";

const archive = loadArchive(JSON.parse(readFileSync("src/data/donki.json", "utf8")));
if (!archive) {
  console.error("build-forecast: src/data/donki.json has no data yet. Run npm run fetch-donki first.");
  process.exit(1);
}
const odds = buildForecastOdds(archive);
writeFileSync("src/data/forecast-odds.json", JSON.stringify(odds, null, 2) + "\n");
console.log(`build-forecast: measured from ${archive.range!.start} to ${archive.range!.end}`);
for (const [k, t] of Object.entries(odds.tiers!)) console.log(`  ${k.padEnd(6)} ${t.label.padEnd(18)} (${t.withStorm} of ${t.windows} windows had a storm)`);
for (const w of oddsWarnings(odds)) console.log(`  WARNING: ${w}`);
