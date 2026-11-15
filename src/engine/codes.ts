/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Mission codes: "MOON-E7Q4K2X" says who's on the crew and which checked seed to play,
// so a friend (or a judge) can play the exact same mission.
//
//   MOON- E 7Q4K2 X
//         │   │   └ check character: catches any single typo and any two swapped neighbours
//         │   └──── the seed, 5 characters in base 31 (more only for seeds past 31^5)
//         └──────── the specialist: D doctor, B botanist, E engineer
//
// The alphabet leaves out 0/O and 1/I/L, which kids mix up. 31 is prime, which is what
// makes the check character catch every single-character typo.

import type { Specialist } from "./types";

export const ALPHA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const BASE = ALPHA.length; // 31
const WHO: Record<Specialist, string> = { doctor: "D", botanist: "B", engineer: "E" };
const SEED_DIGITS = 5;
const MAX_DIGITS = 7; // plenty of room above 31^5; longer codes are typos

const mod = (n: number) => ((n % BASE) + BASE) % BASE;
const inverse = (n: number) => { for (let x = 1; x < BASE; x++) if (mod(n * x) === 1) return x; throw new Error("no inverse"); };

/** The check character that makes the position-weighted sum of the whole code 0 (mod 31). */
function checkChar(core: string): string {
  const sum = [...core].reduce((a, c, i) => a + (i + 1) * ALPHA.indexOf(c), 0);
  return ALPHA[mod(-sum * inverse(core.length + 1))];
}

export function encode(specialist: Specialist, seed: number): string {
  if (!Number.isInteger(seed) || seed < 0) throw new Error(`Seed must be a whole number ≥ 0, got ${seed}`);
  let body = "";
  for (let n = seed; n > 0; n = Math.floor(n / BASE)) body = ALPHA[n % BASE] + body;
  const core = WHO[specialist] + body.padStart(SEED_DIGITS, ALPHA[0]);
  return `MOON-${core}${checkChar(core)}`;
}

export type Decoded = { ok: true; specialist: Specialist; seed: number } | { ok: false; why: string };

/** Read a code the way a kid might type it: any case, with or without "MOON-", spaces or dashes. */
export function decode(input: string): Decoded {
  const text = input.toUpperCase().replace(/[\s-]+/g, "").replace(/^MOON/, "");
  if (!text) return { ok: false, why: "Type a mission code, like MOON-E7Q4K2X." };
  const bad = [...text].find(c => !ALPHA.includes(c));
  if (bad) {
    return { ok: false, why: /[01ILO]/.test(bad)
      ? `Mission codes never use ${bad}. Check that letter: it may be a ${{ "0": "Q or D", O: "Q or D", "1": "7 or J", I: "J or T", L: "E or K" }[bad] ?? "different character"}.`
      : `"${bad}" can't be in a mission code.` };
  }
  const who = (Object.keys(WHO) as Specialist[]).find(s => WHO[s] === text[0]);
  if (!who) return { ok: false, why: "That code doesn't start with D, B or E after MOON-." };
  const core = text.slice(0, -1), digits = core.slice(1);
  if (digits.length < SEED_DIGITS || digits.length > MAX_DIGITS) return { ok: false, why: "That code is the wrong length. Mission codes look like MOON-E7Q4K2X." };
  if (checkChar(core) !== text.slice(-1)) return { ok: false, why: "That code has a typo. Check each letter and try again." };
  return { ok: true, specialist: who, seed: [...digits].reduce((a, c) => a * BASE + ALPHA.indexOf(c), 0) };
}
