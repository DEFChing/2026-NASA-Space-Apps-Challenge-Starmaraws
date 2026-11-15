/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
/** The storm alert card: shelter or keep working. Answered before the power split. */
export function StormAlert({ shelterCells, onAnswer }: { shelterCells: number; onAnswer: (shelter: boolean) => void }) {
  return (
    <div className="storm" role="alertdialog" aria-label="Storm alert">
      <h2>Storm alert!</h2>
      <p>A solar storm is heading for the Moon. It will hit this turn.</p>
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
