/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Seeded random numbers. Everything random in a run (the deal, storm turns, gamble
// rolls) is made once at the start from the seed and stored, so a run can be replayed
// and checked exactly.

/** mulberry32: a small, fast seeded generator returning numbers in [0, 1). */
export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const makeRolls = (seed: number, n: number) => {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => r());
};

/** Fisher–Yates shuffle driven by a seeded generator. Returns a new array. */
export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

/** Separate streams from one seed, so changing one never shifts another. */
export const STREAM = { deal: 0, weather: 0x9e3779b9, rolls: 0x5bd1e995 } as const;
export const streamSeed = (seed: number, stream: number) => (seed ^ stream) >>> 0;
