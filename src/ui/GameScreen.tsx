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
import { Cutscene } from "./Cutscene";
import { Debrief } from "./Debrief";
import { FirstRunTip } from "./FirstRunTip";
import { Forecast } from "./Forecast";
import { Intro } from "./Intro";
import { Landing } from "./Landing";
import { PowerSplit } from "./PowerSplit";
import { RadiationBadge } from "./RadiationBadge";
import { ResourceBar } from "./ResourceBar";
import { StormAlert } from "./StormAlert";
import { Title } from "./Title";
import { TurnReport } from "./TurnReport";
import { TurnTracker } from "./TurnTracker";
import { nextForecast, turnLabel } from "./text";

const BARS: Res[] = ["power", "warmth", "food"];

export function GameScreen() {
  const g = useGame();
  const { phase, state, ctx } = g;

  if (phase === "title") {
    return (
      <div className="overlay center">
        <Title error={g.error} onPlay={g.play} onCode={c => void g.startCode(c)} onIntro={g.watchIntro} />
      </div>
    );
  }
  if (phase === "intro") return <div className="overlay center story-layer"><Intro onDone={g.finishIntro} /></div>;
  if (phase === "crewPick" || phase === "checking" || !state || !ctx || !g.specialist) {
    return (
      <div className="overlay center">
        <CrewPick difficulty={g.difficulty} checking={phase === "checking"} error={g.error}
          onDifficulty={g.setDifficulty} onPick={s => void g.pickCrew(s)} onBack={g.toTitle} />
      </div>
    );
  }
  if (g.landing && phase === "briefing") return <div className="overlay center story-layer"><Landing specialist={g.specialist} onDone={g.land} /></div>;
  if (phase === "over" && !g.animating && !g.debriefOpen && g.ending) {
    return <div className="overlay center story-layer"><Cutscene ending={g.ending} onDebrief={g.openDebrief} /></div>;
  }

  const turn = Math.min(state.turn, ctx.level.turns - 1);
  const storm = ctx.weather[turn].storm;
  const card = ctx.cards[state.deck[turn]];
  const lastRecord = g.history[g.history.length - 1];
  // While the outpost animates a turn, the HUD keeps showing the state before it,
  // so the bars change after the kids have seen why.
  const hud = g.hudState ?? state;
  const hudTurn = g.hudState ? g.hudState.turn : phase === "over" ? ctx.level.turns : turn;

  return (
    <div className="overlay">
      <header className="hud">
        <div className="hud-left">
          {BARS.map(r => (
            <ResourceBar key={r} res={r} value={hud.res[r]} max={ctx.level.max[r]} emergency={hud.emergencies.includes(r)} />
          ))}
          <div className="stars" data-testid="stars">Stars: {hud.stars} of {ctx.level.starTarget}</div>
          <TurnTracker ctx={ctx} turn={hudTurn} />
        </div>
        <RadiationBadge pips={hud.badge} limit={ctx.level.radiation.limit} />
      </header>

      <main className="stage">
        {g.animating && (
          <button className="skip" data-testid="skip-anim" onClick={g.skipAnimations} aria-label="Speed up the animation">
            Skip ▸
          </button>
        )}

        {!g.animating && phase === "briefing" && (
          <section className="briefing" aria-label="Morning briefing">
            <h2 data-testid="turn-label">{turnLabel(ctx, turn)}</h2>
            <Forecast odds={nextForecast(ctx, turn)} />
            {g.firstRun && turn === 0 && <FirstRunTip onDismiss={g.dismissTip} />}
            {storm
              ? <StormAlert shelterCells={shelterCost(state, ctx.level)} date={ctx.weather[turn].date} link={ctx.weather[turn].link} onAnswer={s => g.toSplit(s)} />
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

        {!g.animating && phase === "report" && lastRecord && (
          <TurnReport record={lastRecord} ctx={ctx} busy={g.busy} onNext={g.nextTurn} />
        )}

        {!g.animating && phase === "over" && g.seed !== null && (
          <Debrief history={g.history} ctx={ctx} seed={g.seed} specialist={g.specialist}
            difficulty={g.difficulty} onAgain={g.playAgain} onTitle={g.toTitle} />
        )}
      </main>
    </div>
  );
}
