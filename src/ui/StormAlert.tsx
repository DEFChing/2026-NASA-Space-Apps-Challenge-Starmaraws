/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { realStormLine } from "./text";

interface Props {
  shelterCells: number;
  date?: string;           // real DONKI storms only
  link?: string;
  onAnswer: (shelter: boolean) => void;
}

/** The storm alert card: shelter or keep working. Answered before the power split. */
export function StormAlert({ shelterCells, date, link, onAnswer }: Props) {
  return (
    <div className="storm" role="alertdialog" aria-label="Storm alert">
      <h2>Storm alert!</h2>
      <p>A solar storm is heading for the Moon. It will hit this turn.</p>
      {date && (
        <p className="real-data" data-testid="storm-date">
          {realStormLine(date)}{" "}
          {link && <a href={link} target="_blank" rel="noreferrer" data-testid="storm-link">See NASA's record</a>}
          <small>NASA's DONKI database records space weather near Earth. The Moon, about 384,000 km away, gets most of the same storms.</small>
        </p>
      )}
      <div className="choices">
        <button data-testid="shelter-yes" onClick={() => onAnswer(true)}>
          <strong>Shelter in the inner storm room</strong>
          <span>+1 pip · {shelterCells === 0 ? "free in the cave" : `${shelterCells} Power cells`} · no Stars from experiments this turn</span>
        </button>
        <button data-testid="shelter-no" onClick={() => onAnswer(false)}>
          <strong>Keep working</strong>
          <span>+5 pips</span>
        </button>
      </div>
    </div>
  );
}
