/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { badgeColour } from "../engine/rules";
import { badgeText } from "./text";

/** 12 squares filling green, yellow, red. */
export function RadiationBadge({ pips, limit }: { pips: number; limit: number }) {
  return (
    <div className="badge" data-testid="badge" aria-label={`Radiation Badge ${pips} of ${limit} pips`}>
      <div className="badge-title">Radiation Badge</div>
      <div className="badge-pips">
        {Array.from({ length: limit }, (_, i) => (
          <span key={i} className={`pip ${i < pips ? `pip-${badgeColour(i + 1)}` : ""}`} />
        ))}
      </div>
      <div className={`badge-text badge-${badgeColour(pips)}`}>{pips} of {limit} · {badgeText(pips)}</div>
    </div>
  );
}
