/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// What the game remembers between visits: whether the intro was seen, how many runs
// were finished (the first one gets its own mentor line) and the last few mentor lines
// (so Amara doesn't repeat herself). Uses localStorage when the browser allows it and
// plain memory when it doesn't (private windows, some school computers, tests).

export interface Progress { introSeen: boolean; runs: number; recentLines: string[]; seenWords: string[] }

const KEY = "junior-astronaut.progress.v1";
const RECENT = 3;
const fresh = (): Progress => ({ introSeen: false, runs: 0, recentLines: [], seenWords: [] });
let memory: Progress = fresh();

function storage(): Storage | null {
  // Only in a browser: Node 26 has its own experimental localStorage that warns when touched.
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

export function readProgress(): Progress {
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      return {
        introSeen: p.introSeen === true,
        runs: Number.isInteger(p.runs) && p.runs! >= 0 ? p.runs! : 0,
        recentLines: Array.isArray(p.recentLines) ? p.recentLines.filter(x => typeof x === "string").slice(-RECENT) : [],
        seenWords: Array.isArray(p.seenWords) ? p.seenWords.filter(x => typeof x === "string") : [],
      };
    }
  } catch { /* unreadable: fall back to memory */ }
  return { ...memory, recentLines: [...memory.recentLines], seenWords: [...memory.seenWords] };
}

function save(p: Progress) {
  memory = p;
  try { storage()?.setItem(KEY, JSON.stringify(p)); } catch { /* full or blocked: memory still works */ }
}

export function markIntroSeen() { save({ ...readProgress(), introSeen: true }); }

/** A finished run: count it and remember the mentor line it got. */
export function recordRun(lineId: string) {
  const p = readProgress();
  save({ ...p, runs: p.runs + 1, recentLines: [...p.recentLines, lineId].slice(-RECENT) });
}

/** A new word's explanation was shown; don't show it again. */
export function markWordSeen(word: string) {
  const p = readProgress();
  if (!p.seenWords.includes(word)) save({ ...p, seenWords: [...p.seenWords, word] });
}

// --- Settings --------------------------------------------------------------------

export interface Settings {
  music: number;          // 0–1
  effects: number;        // 0–1
  mute: boolean;
  reduceMotion: boolean;  // starts from the computer's own setting
  largeText: boolean;
}

const SETTINGS_KEY = "junior-astronaut.settings.v1";
const systemReducedMotion = () => {
  try { return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};
export const defaultSettings = (): Settings => ({ music: 0.7, effects: 0.8, mute: false, reduceMotion: systemReducedMotion(), largeText: false });
let memorySettings: Settings | null = null;
const unit = (x: unknown, d: number) => (typeof x === "number" && x >= 0 && x <= 1 ? x : d);

export function readSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = storage()?.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      return {
        music: unit(s.music, d.music), effects: unit(s.effects, d.effects), mute: s.mute === true,
        reduceMotion: typeof s.reduceMotion === "boolean" ? s.reduceMotion : d.reduceMotion, largeText: s.largeText === true,
      };
    }
  } catch { /* unreadable: defaults */ }
  return memorySettings ? { ...memorySettings } : d;
}

export function saveSettings(s: Settings) {
  memorySettings = { ...s };
  try { storage()?.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* memory still works */ }
}

/** Tests only: forget everything. */
export function resetProgress() {
  memory = fresh();
  memorySettings = null;
  try { storage()?.removeItem(KEY); storage()?.removeItem(SETTINGS_KEY); } catch { /* ignore */ }
}
