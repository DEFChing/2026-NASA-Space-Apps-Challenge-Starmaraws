/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// A full-screen Phaser canvas with the React overlay on top. The store tells Phaser
// about each turn through the EventBus; the scene answers "animations-done" when the
// kid has seen what happened, and only then does the next panel appear.

import { useEffect, useRef } from "react";
import { EventBus } from "./game/EventBus";
import { IRefPhaserGame, PhaserGame } from "./PhaserGame";
import { setEmitter, useGame } from "./store/game";
import { AssetDebug } from "./ui/AssetDebug";
import { GameScreen } from "./ui/GameScreen";
import "./ui/greybox.css";

function App() {
  const phaserRef = useRef<IRefPhaserGame | null>(null);
  useEffect(() => {
    setEmitter((name, payload) => EventBus.emit(name, payload));
    const onReady = () => useGame.getState().setSceneReady(true);
    const onDone = () => useGame.getState().animationsDone();
    EventBus.on("current-scene-ready", onReady);
    EventBus.on("animations-done", onDone);
    // The scene may have announced itself before this listener existed: ask again.
    EventBus.emit("scene-ping");
    // Dev only: ?seed=1003&crew=botanist jumps straight into that run (playtests, demo rehearsal).
    // The published game ignores it, so players only ever get checked seeds.
    if (import.meta.env.DEV) {
      const q = new URLSearchParams(location.search);
      const seed = Number(q.get("seed"));
      const crew = q.get("crew");
      if (q.has("seed") && Number.isInteger(seed) && (crew === "engineer" || crew === "botanist" || crew === "doctor")) {
        useGame.getState().start(crew, seed);
      }
    }
    return () => {
      EventBus.off("current-scene-ready", onReady);
      EventBus.off("animations-done", onDone);
    };
  }, []);
  return (
    <div id="app">
      <PhaserGame ref={phaserRef} />
      <GameScreen />
      {typeof location !== "undefined" && new URLSearchParams(location.search).has("debugAssets") && <AssetDebug />}
    </div>
  );
}

export default App;
