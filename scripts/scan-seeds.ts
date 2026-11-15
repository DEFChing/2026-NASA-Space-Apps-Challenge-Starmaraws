/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 *
 * scan-seeds: checks a spread of seeds with the real archive and prints how they fall into
 * the difficulty bands, how storms spread across them, and Rookie codes that make good demos
 * (a real storm, a gamble that can come back, a close call). Use it to retune
 * DIFFICULTY_BANDS in src/engine/solver.ts or to pick new codes for DEMO.md:
 *
 *   npm run scan-seeds              # 150 seeds per specialist (2 to 3 minutes)
 *   npm run scan-seeds -- 400       # more seeds, steadier numbers
 */
import { encode } from "../src/engine/codes";
import { donkiArchive, startRun } from "../src/engine/data";
import { resolveTurn } from "../src/engine/rules";
import { analyse, DIFFICULTY_BANDS, QUICK_LIMIT } from "../src/engine/solver";
import type { Specialist } from "../src/engine/types";

if (!donkiArchive) {
  console.error("scan-seeds: src/data/donki.json has no records yet (practice weather). Run npm run fetch-donki first.");
  process.exit(1);
}
const perWho = Number(process.argv[2] ?? 150);
const WHO: Specialist[] = ["engineer", "botanist", "doctor"];
const MAX = 31 ** 5 - 1000;

interface Row { code: string; share: number; band: string; storms: { turn: number; date?: string; forecast: string }[]; demo: boolean }
const rows: Row[] = [];
for (const who of WHO) {
  for (let i = 0; i < perWho; i++) {
    const seed = (777 + i * 104_729) % MAX;
    const { state, ctx } = startRun(seed, who);
    const a = analyse(state, ctx, 1000, QUICK_LIMIT);
    const storms = ctx.weather.flatMap((w, t) => (w.storm ? [{ turn: t + 1, date: w.date, forecast: w.forecast }] : []));
    let delayed = false, closeCall = false;
    if (a.winnable) {
      let s = state;
      for (const m of a.path) {
        const r = resolveTurn(s, ctx, m.plan, m.choice, { gambles: "fail" });
        delayed ||= r.events.some(e => e.type === "delayed");
        closeCall ||= r.events.some(e => e.type === "emergency");
        s = r.state;
      }
    }
    const band = a.winnable === null ? "not checked" : a.winnable ? a.difficulty! : "can't be won";
    rows.push({ code: encode(who, seed), share: a.winShare, band, storms, demo: band === "rookie" && storms.length > 0 && delayed && closeCall });
  }
  process.stdout.write(`  ${who} done\n`);
}

const pct = (n: number) => `${Math.round((100 * n) / rows.length)}%`;
console.log(`\n${rows.length} seeds; bands: Rookie ≥ ${DIFFICULTY_BANDS.rookie}, Pilot ≥ ${DIFFICULTY_BANDS.pilot} (random-play win share)`);
for (const band of ["rookie", "pilot", "commander", "not checked", "can't be won"]) {
  const r = rows.filter(x => x.band === band);
  if (!r.length) continue;
  const shares = r.map(x => x.share).sort((a, b) => a - b);
  const withStorm = r.filter(x => x.storms.length).length;
  console.log(`  ${band.padEnd(12)} ${pct(r.length).padStart(4)} of seeds, typical share ${shares[Math.floor(shares.length / 2)].toFixed(2)}, ${Math.round((100 * withStorm) / r.length)}% with a storm`);
}
const demos = rows.filter(r => r.demo).sort((a, b) => b.share - a.share);
console.log(`\nDemo candidates (Rookie, real storm, a gamble that comes back, a close call): ${demos.length}`);
for (const d of demos.slice(0, 15)) {
  console.log(`  ${d.code}  share ${d.share.toFixed(2)}  ${d.storms.map(s => `storm ${s.date} on turn ${s.turn} (forecast ${s.forecast})`).join(", ")}`);
}
console.log("\nPrefer a share well above the Rookie line, so a small balance change doesn't move the code.");
