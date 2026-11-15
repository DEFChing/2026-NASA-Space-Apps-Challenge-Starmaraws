/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Phaser setup: a full-window canvas behind the React overlay. One scene for now;
// Step 5 adds the Preloader and the real outpost.

import { AUTO, Game, Scale } from "phaser";
import { Outpost } from "./scenes/Outpost";

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: "game-container",
  backgroundColor: "#0b0f1a",
  scale: { mode: Scale.RESIZE, width: "100%", height: "100%" },
  scene: [Outpost],
};

const StartGame = (parent: string) => new Game({ ...config, parent });

export default StartGame;
