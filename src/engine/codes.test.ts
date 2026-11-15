/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { describe, expect, test } from "vitest";
import { ALPHA, decode, encode } from "./codes";
import type { Specialist } from "./types";

const CREW: Specialist[] = ["doctor", "botanist", "engineer"];

describe("mission codes", () => {
  test("decode(encode(x)) gives x back, for every specialist and seeds across the range", () => {
    for (const sp of CREW) {
      for (const seed of [0, 1, 30, 31, 1003, 123456, 31 ** 5 - 1, 31 ** 5 + 250]) {
        expect(decode(encode(sp, seed))).toEqual({ ok: true, specialist: sp, seed });
      }
    }
  });

  test("codes look the same every time: MOON-, the crew letter, 5 seed characters, a check character", () => {
    expect(encode("engineer", 1003)).toMatch(/^MOON-E[2-9A-Z]{5}[2-9A-Z]$/);
    expect(encode("doctor", 0)).toMatch(/^MOON-D22222.$/);
    expect(encode("botanist", 7)).toBe(encode("botanist", 7));
    expect(encode("doctor", 31 ** 5 + 1).length).toBe("MOON-".length + 8);   // past 31^5 it just grows
  });

  test("changing any one character is rejected", () => {
    for (const sp of CREW) {
      const code = encode(sp, 123456).slice(5);
      for (let i = 0; i < code.length; i++) {
        for (const c of ALPHA) {
          if (c === code[i]) continue;
          const typo = code.slice(0, i) + c + code.slice(i + 1);
          const d = decode(typo);
          // A typo in the crew letter that lands on another crew letter is still caught by the check character.
          expect(d.ok, `${code} → ${typo}`).toBe(false);
        }
      }
    }
  });

  test("swapping two neighbouring characters is rejected", () => {
    for (let seed = 0; seed < 3000; seed += 37) {
      const code = encode("botanist", seed).slice(5);
      for (let i = 0; i + 1 < code.length; i++) {
        if (code[i] === code[i + 1]) continue;
        const swapped = code.slice(0, i) + code[i + 1] + code[i] + code.slice(i + 2);
        expect(decode(swapped).ok, `${code} → ${swapped}`).toBe(false);
      }
    }
  });

  test("kids can type it loosely: any case, with or without MOON-, spaces or extra dashes", () => {
    const code = encode("engineer", 4242);
    for (const typed of [code, code.toLowerCase(), code.slice(5), ` ${code.slice(0, 5)} ${code.slice(5, 8)} ${code.slice(8)} `, code.replace("-", "--")]) {
      expect(decode(typed)).toEqual({ ok: true, specialist: "engineer", seed: 4242 });
    }
  });

  test("mistakes get a helpful message", () => {
    expect(decode("").ok).toBe(false);
    expect(decode("MOON-E7Q4K0X")).toMatchObject({ ok: false, why: expect.stringMatching(/never use 0/) });
    expect(decode("MOON-Z7Q4K2X")).toMatchObject({ ok: false, why: expect.stringMatching(/start with D, B or E/) });
    expect(decode("MOON-E7Q")).toMatchObject({ ok: false, why: expect.stringMatching(/wrong length/) });
    expect(decode("MOON-E7Q4K2X?")).toMatchObject({ ok: false, why: expect.stringMatching(/can't be in a mission code/) });
  });
});
