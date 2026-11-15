/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// What the game remembers between visits: whether the intro was seen, how many runs
// were finished (the first one gets its own mentor line) and the last few mentor lines
// (so Amara doesn't repeat herself). Uses localStorage when the browser allows it and
// plain memory when it doesn't (private windows, some school computers, tests).

export interface Progress { introSeen: boolean; runs: number; recentLines: string[] }

const KEY = "junior-astronaut.progress.v1";
const RECENT = 3;
const fresh = (): Progress => ({ introSeen: false, runs: 0, recentLines: [] });
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
      };
    }
  } catch { /* unreadable: fall back to memory */ }
  return { ...memory, recentLines: [...memory.recentLines] };
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

/** Tests only: forget everything. */
export function resetProgress() {
  memory = fresh();
  try { storage()?.removeItem(KEY); } catch { /* ignore */ }
}
