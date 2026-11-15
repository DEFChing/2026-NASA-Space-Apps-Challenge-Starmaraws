/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 *
 * import-credits: copies the rows of incoming/credits.csv into src/data/credits.json,
 * which builds the Credits screen and the Datasets page. A row for a file that's
 * already listed replaces it; other rows are kept. Run it at each asset drop:
 *
 *   npm run import-credits
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { checkCredits, creditsFromCsv } from "../src/engine/facts";

const CSV = "incoming/credits.csv", JSON_FILE = "src/data/credits.json";
if (!existsSync(CSV)) {
  console.error(`import-credits: ${CSV} doesn't exist yet. The assets team adds it with their first files.`);
  process.exit(1);
}
const incoming = creditsFromCsv(readFileSync(CSV, "utf8"));
if (incoming.problems.length) {
  console.error(`import-credits: fix ${CSV} first:\n- ${incoming.problems.join("\n- ")}`);
  process.exit(1);
}
const json = JSON.parse(readFileSync(JSON_FILE, "utf8"));
const current = checkCredits(json);
if (current.problems.length) {
  console.error(`import-credits: ${JSON_FILE} has problems:\n- ${current.problems.join("\n- ")}`);
  process.exit(1);
}
for (const f of incoming.replaced) console.log(`  ${f} has more than one row in ${CSV}; using the last one`);
const byFile = new Map(current.credits.map(c => [c.file, c]));
let added = 0, replaced = 0;
for (const c of incoming.credits) { if (byFile.has(c.file)) replaced++; else added++; byFile.set(c.file, c); }
json.credits = [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file));
writeFileSync(JSON_FILE, JSON.stringify(json, null, 2) + "\n");
const si = json.credits.filter((c: { si: string }) => /^yes/i.test(c.si)).map((c: { file: string }) => c.file);
console.log(`import-credits: ${added} added, ${replaced} updated, ${json.credits.length} in ${JSON_FILE}`);
if (si.length) console.log(`  SI-made files (need the visible label or audio tag, and an si-manifest.json row): ${si.join(", ")}`);
