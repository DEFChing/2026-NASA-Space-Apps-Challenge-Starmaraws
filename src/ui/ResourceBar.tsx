/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import type { Res } from "../engine/types";
import { RES_LABEL } from "./text";

/** One bar: label, number, coloured width and a status mark. Greybox; Step 5 adds icons. */
export function ResourceBar({ res, value, max, emergency }: { res: Res; value: number; max: number; emergency: boolean }) {
  const status = value === 0 ? "empty" : value <= 2 ? "low" : "ok";
  return (
    <div className={`bar bar-${status}`} data-testid={`bar-${res}`} aria-label={`${RES_LABEL[res]} ${value} of ${max}`}>
      <span className="bar-label">{RES_LABEL[res]}</span>
      <span className="bar-track"><span className="bar-fill" style={{ width: `${(100 * value) / max}%` }} /></span>
      <span className="bar-value">{value}</span>
      <span className="bar-status">{emergency ? "Emergency!" : status === "low" ? "Low" : ""}</span>
    </div>
  );
}
