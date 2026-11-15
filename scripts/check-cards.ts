/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 *
 * check-cards: checks src/data/cards.json against the card-writing (truth) rules in
 * src/engine/cardRules.ts. Runs in CI; run it locally with `npm run check-cards`.
 */
import { readFileSync, existsSync } from "node:fs";
import { checkCards, kidOdds } from "../src/engine/cardRules";
import { loadCards } from "../src/engine/content";

const FILE = "src/data/cards.json";

if (!existsSync(FILE)) {
  console.error(`check-cards: ${FILE} is missing`);
  process.exit(1);
}

let cards;
try {
  const json = JSON.parse(readFileSync(FILE, "utf8"));
  if (!json._meta?.si) throw new Error(`${FILE}: missing _meta.si (SI disclosure)`);
  cards = loadCards(json, FILE);
} catch (err) {
  console.error(`check-cards: ${(err as Error).message}`);
  process.exit(1);
}

const problems = checkCards(cards);
if (problems.length) {
  console.error(`check-cards: ${problems.length} problem(s) in ${FILE}\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

const count = (f: (c: (typeof cards)[number]) => boolean) => cards.filter(f).length;
const who = ["engineer", "botanist", "doctor"]
  .map(w => `${w} ${count(c => c.specialist?.who === w)}`).join(", ");
const gambles = cards.flatMap(c => [...c.options, ...(c.specialist ? [c.specialist] : [])]
  .filter(o => o.gamble).map(o => `${c.id} ${kidOdds(o.gamble!.chance)}`));
console.log(`check-cards: ${cards.length} cards OK`);
console.log(`  piles: opener ${count(c => c.pile === "opener")}, day ${count(c => c.pile === "day")}, night ${count(c => c.pile === "night")}`);
console.log(`  specialist options: ${who}`);
console.log(`  gambles: ${gambles.join(", ")}`);
