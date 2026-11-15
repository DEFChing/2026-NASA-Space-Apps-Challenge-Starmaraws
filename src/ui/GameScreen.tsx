/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The React overlay over the Phaser canvas: the HUD, plus one panel for the current phase.

import { shelterCost } from "../engine/rules";
import type { Res } from "../engine/types";
import { useGame } from "../store/game";
import { CardView } from "./CardView";
import { CrewPick } from "./CrewPick";
import { Debrief } from "./Debrief";
import { FirstRunTip } from "./FirstRunTip";
import { Forecast } from "./Forecast";
import { PowerSplit } from "./PowerSplit";
import { RadiationBadge } from "./RadiationBadge";
import { ResourceBar } from "./ResourceBar";
import { StormAlert } from "./StormAlert";
import { TurnReport } from "./TurnReport";
import { TurnTracker } from "./TurnTracker";
import { nextForecast, turnLabel } from "./text";

const BARS: Res[] = ["power", "warmth", "food"];

export function GameScreen() {
  const g = useGame();
  const { phase, state, ctx } = g;

  if (phase === "crewPick" || phase === "checking" || !state || !ctx || !g.specialist) {
    return (
      <div className="overlay center">
        <CrewPick difficulty={g.difficulty} checking={phase === "checking"} error={g.error}
          onDifficulty={g.setDifficulty} onPick={s => void g.pickCrew(s)} />
      </div>
    );
  }

  const turn = Math.min(state.turn, ctx.level.turns - 1);
  const storm = ctx.weather[turn].storm;
  const card = ctx.cards[state.deck[turn]];
  const lastRecord = g.history[g.history.length - 1];

  return (
    <div className="overlay">
      <header className="hud">
        <div className="hud-left">
          {BARS.map(r => (
            <ResourceBar key={r} res={r} value={state.res[r]} max={ctx.level.max[r]} emergency={state.emergencies.includes(r)} />
          ))}
          <div className="stars" data-testid="stars">Stars: {state.stars} of {ctx.level.starTarget}</div>
          <TurnTracker ctx={ctx} turn={phase === "over" ? ctx.level.turns : turn} />
        </div>
        <RadiationBadge pips={state.badge} limit={ctx.level.radiation.limit} />
      </header>

      <main className="stage">
        {phase === "briefing" && (
          <section className="briefing" aria-label="Morning briefing">
            <h2 data-testid="turn-label">{turnLabel(ctx, turn)}</h2>
            <Forecast odds={nextForecast(ctx, turn)} />
            {g.firstRun && turn === 0 && <FirstRunTip onDismiss={g.dismissTip} />}
            {storm
              ? <StormAlert shelterCells={shelterCost(state, ctx.level)} onAnswer={s => g.toSplit(s)} />
              : <button className="primary" data-testid="start-day" onClick={() => g.toSplit(false)}>Plan the day</button>}
          </section>
        )}

        {phase === "split" && (
          <div className="split-wrap">
            <PowerSplit state={state} ctx={ctx} plan={g.plan} error={g.error} onSlot={g.setSlot} onLock={g.lockSplit} />
            <Forecast odds={nextForecast(ctx, turn)} />
          </div>
        )}

        {phase === "card" && (
          <CardView card={card} choices={g.choices} specialist={g.specialist} onChoose={c => void g.choose(c)} />
        )}

        {phase === "report" && lastRecord && (
          <TurnReport record={lastRecord} ctx={ctx} busy={g.busy} onNext={g.nextTurn} />
        )}

        {phase === "over" && g.seed !== null && (
          <Debrief history={g.history} ctx={ctx} seed={g.seed} specialist={g.specialist}
            difficulty={g.difficulty} onAgain={g.playAgain} />
        )}
      </main>
    </div>
  );
}
