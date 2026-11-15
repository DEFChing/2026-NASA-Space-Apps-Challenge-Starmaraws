/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Mini-moments (Spec: optional, about 10 seconds, only for jobs really done by hand).
// D2: scrub the dust off the radiators. N3: sweep the leak detector along the wall after
// a moonquake. Doing well means no Star lost; skipping or running out of time just means
// the Star cost happens as the option said. Mouse, touch and keyboard all work.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { sendSfx } from "../store/game";

export const MINI_SECONDS = 10;
export const DUST_SPOTS = 10;
export const JOINTS = 8;

/** Small seeded random numbers, so a run's mini-moment looks the same when replayed. */
function rng(seed: number) {
  let x = (seed ^ 0x5bd1e995) >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 2 ** 32; };
}

/** Where the dust spots sit on the radiator, in percent. */
export function dustSpots(seed: number, n = DUST_SPOTS): { x: number; y: number }[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => ({ x: 6 + ((i % 5) * 19) + r() * 8, y: 12 + Math.floor(i / 5) * 42 + r() * 24 }));
}

/** Which wall joint leaks. */
export const leakJoint = (seed: number, n = JOINTS) => Math.floor(rng(seed + 7)() * n);

/** The detector's reading at a joint: 4 bars on the leak, one fewer per joint away. */
export const leakSignal = (joint: number, leak: number) => Math.max(0, 4 - Math.abs(joint - leak));

const TEXT = {
  dust: { title: "Scrub the radiators", how: "Rub the dust spots away before time runs out. Drag across them, tap them, or Tab to each one and press Enter.", win: "Clean! No Star lost." },
  leak: { title: "Find the leak", how: "Move the detector along the wall: more bars means closer. Pick the joint that hisses. With the keyboard, Tab along the joints and press Enter.", win: "Found it! Sealed. No Star lost." },
};

interface Props { kind: "dust" | "leak"; seed: number; onDone: (done: boolean) => void }

export function MiniMoment({ kind, seed, onDone }: Props) {
  const [left, setLeft] = useState(MINI_SECONDS * 10);   // tenths of a second
  const [result, setResult] = useState<"win" | "late" | null>(null);
  const finished = useRef(false);

  const finish = (won: boolean) => {
    if (finished.current) return;
    finished.current = true;
    setResult(won ? "win" : "late");
    sendSfx(won ? "sfx_code_ok" : "sfx_locked");
    setTimeout(() => onDone(won), won ? 700 : 900);
  };

  useEffect(() => {
    const id = setInterval(() => setLeft(t => (finished.current ? t : Math.max(0, t - 1))), 100);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { if (left === 0) finish(false); }, [left]);   // eslint-disable-line react-hooks/exhaustive-deps

  const skip = () => { if (!finished.current) { finished.current = true; onDone(false); } };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); skip(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const t = TEXT[kind];
  return (
    <section className="card mini" aria-label={t.title} data-testid="mini">
      <h2>{t.title}</h2>
      <p>{t.how}</p>
      <div className="mini-timer" role="timer" aria-label={`${Math.ceil(left / 10)} seconds left`}>
        <span style={{ width: `${(left / (MINI_SECONDS * 10)) * 100}%` }} />
      </div>
      {kind === "dust" ? <Dust seed={seed} disabled={!!result} onClear={() => finish(true)} /> : <Leak seed={seed} disabled={!!result} onFound={() => finish(true)} />}
      <p className="mini-result" role="status" data-testid="mini-result">
        {result === "win" ? t.win : result === "late" ? "Time's up: the Star cost happens." : ""}
      </p>
      <button className="link" data-testid="mini-skip" onClick={skip} disabled={!!result}>Skip (the Star cost happens)</button>
    </section>
  );
}

function Dust({ seed, disabled, onClear }: { seed: number; disabled: boolean; onClear: () => void }) {
  const spots = useRef(dustSpots(seed)).current;
  const [gone, setGone] = useState<Set<number>>(() => new Set());
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);

  const clear = (i: number) => {
    if (disabled || gone.has(i)) return;
    const next = new Set(gone).add(i);
    setGone(next);
    sendSfx("sfx_click");
    if (next.size === spots.length) onClear();
  };
  // Touch keeps sending moves to the spot it started on, so find the spot under the finger.
  const rub = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && !(e.buttons & 1)) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-spot]");
    if (el) clear(Number(el.dataset.spot));
  };
  return (
    <div className="radiator" onPointerMove={rub} data-testid="radiator">
      {spots.map((p, i) => (
        <button key={i} ref={i === 0 ? first : undefined} data-spot={i} data-testid="dust-spot"
          className={`dust-spot${gone.has(i) ? " gone" : ""}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}
          aria-label={gone.has(i) ? "Clean" : `Dust spot ${i + 1}`} disabled={disabled || gone.has(i)}
          onPointerDown={() => clear(i)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); clear(i); } }} />
      ))}
      <span className="mini-count">{gone.size} of {spots.length} clean</span>
    </div>
  );
}

function Leak({ seed, disabled, onFound }: { seed: number; disabled: boolean; onFound: () => void }) {
  const leak = useRef(leakJoint(seed)).current;
  const [at, setAt] = useState<number | null>(null);
  const [wrong, setWrong] = useState<Set<number>>(() => new Set());
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);

  const pick = (j: number) => {
    if (disabled) return;
    if (j === leak) { onFound(); return; }
    setWrong(new Set(wrong).add(j));
    sendSfx("sfx_locked");
  };
  const bars = at === null ? 0 : leakSignal(at, leak);
  return (
    <div className="wall" data-testid="wall">
      <p className="detector" aria-live="polite" data-testid="detector">
        Detector: <span className="bars" aria-hidden="true">{"▮".repeat(bars)}{"▯".repeat(4 - bars)}</span>
        {" "}{at === null ? "move it along the wall" : `${bars} of 4 bars`}
      </p>
      <div className="joints">
        {Array.from({ length: JOINTS }, (_, j) => (
          <button key={j} ref={j === 0 ? first : undefined} data-testid="joint" disabled={disabled || wrong.has(j)}
            className={`joint${wrong.has(j) ? " wrong" : ""}${at === j ? " here" : ""}`}
            aria-label={`Joint ${j + 1}${wrong.has(j) ? ": no hiss" : ""}`}
            onPointerEnter={() => setAt(j)} onFocus={() => setAt(j)} onClick={() => pick(j)}>
            {wrong.has(j) ? "✗" : "▤"}
          </button>
        ))}
      </div>
    </div>
  );
}
