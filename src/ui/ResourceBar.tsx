/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import type { Res } from "../engine/types";
import { RES_LABEL } from "./text";

/** Status icons, so a status never depends on colour alone. */
export const STATUS_ICON = { ok: "\u2713", warning: "\u25b2", emergency: "\u26a0" } as const;

/** One bar: label, number, coloured width and a status mark (an icon and a word, as well as the colour). */
export function ResourceBar({ res, value, max, emergency }: { res: Res; value: number; max: number; emergency: boolean }) {
  const status = value === 0 ? "empty" : value <= 2 ? "low" : "ok";
  return (
    <div className={`bar bar-${status}`} data-testid={`bar-${res}`} aria-label={`${RES_LABEL[res]} ${value} of ${max}`}>
      <span className="bar-label">{RES_LABEL[res]}</span>
      <span className="bar-track"><span className="bar-fill" style={{ width: `${(100 * value) / max}%` }} /></span>
      <span className="bar-value">{value}</span>
      <span className="bar-status">{emergency || status === "empty"
        ? <><span aria-hidden="true" className="icon">{STATUS_ICON.emergency}</span> {emergency ? "Emergency!" : "Empty"}</>
        : status === "low" ? <><span aria-hidden="true" className="icon">{STATUS_ICON.warning}</span> Low</> : ""}</span>
    </div>
  );
}
