/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
/** Shown on Turn 1 of a player's first run. */
export function FirstRunTip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="tip" role="note">
      Tip: keep a few cells spare. You won't know what's coming.
      <button data-testid="tip-ok" onClick={onDismiss}>Got it</button>
    </div>
  );
}
