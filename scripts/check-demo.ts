/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 *
 * check-demo: the demo mission codes in DEMO.md still give the run we rehearsed. Each
 * must decode, be winnable at Rookie, and keep its real storm. A code's weather comes
 * from src/data/donki.json, so re-run this after changing cards, level numbers or the
 * archive (a fresh download with a later end date moves every seed's window):
 *
 *   npm run check-demo
 */
import { decode } from "../src/engine/codes";
import { donkiArchive, startRun } from "../src/engine/data";
import { analyse, QUICK_LIMIT } from "../src/engine/solver";

export const DEMO_CODES = [
  { code: "MOON-EG9RJXS", storm: "2012-01-23" },
  { code: "MOON-D3FGWUX", storm: "2026-01-18" },
  { code: "MOON-BGZ43XM", storm: "2012-07-12" },
];

if (!donkiArchive) {
  console.error("check-demo: src/data/donki.json has no records, so the demo codes would use practice weather. Run npm run fetch-donki first.");
  process.exit(1);
}
let bad = 0;
for (const { code, storm } of DEMO_CODES) {
  const d = decode(code);
  if (!d.ok) { console.log(`✗ ${code}: ${d.why}`); bad++; continue; }
  const { state, ctx } = startRun(d.seed, d.specialist);
  const a = analyse(state, ctx, 1000, QUICK_LIMIT);
  const stormTurn = ctx.weather.findIndex(w => w.date === storm);
  const problems = [
    a.difficulty !== "rookie" && `now ${a.winnable ? a.difficulty : "not winnable"}`,
    stormTurn < 0 && `no longer has the ${storm} storm`,
  ].filter(Boolean);
  if (problems.length) bad++;
  console.log(`${problems.length ? "✗" : "✓"} ${code} (${d.specialist}): ${problems.length ? problems.join(", ") : `Rookie, random-play win share ${a.winShare.toFixed(2)}, storm of ${storm} on turn ${stormTurn + 1}`}`);
}
if (bad) { console.error(`check-demo: ${bad} code(s) changed. Pick new ones (see DEMO.md) before the demo.`); process.exit(1); }
console.log("check-demo: all demo codes OK");
