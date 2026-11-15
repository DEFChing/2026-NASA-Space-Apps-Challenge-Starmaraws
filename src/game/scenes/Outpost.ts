/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Greybox placeholder for the outpost scene: a dark sky, a few stars and a grey horizon.
// It flashes when a turn resolves, so you can see the EventBus link working. Step 5
// replaces it with the real living outpost.

import { Scene, Scenes } from "phaser";
import { EventBus } from "../EventBus";

export class Outpost extends Scene {
  private ground?: Phaser.GameObjects.Rectangle;
  private stars: Phaser.GameObjects.Arc[] = [];
  private note?: Phaser.GameObjects.Text;

  constructor() { super("Outpost"); }

  create() {
    this.draw();
    this.scale.on("resize", () => this.draw());
    const onTurn = () => this.cameras?.main?.flash(250, 60, 80, 120);
    EventBus.on("turn-resolved", onTurn);
    // Unhook on shutdown and on destroy: React's dev mode creates the game twice.
    const off = () => EventBus.off("turn-resolved", onTurn);
    this.events.once(Scenes.Events.SHUTDOWN, off);
    this.events.once(Scenes.Events.DESTROY, off);
    EventBus.emit("current-scene-ready", this);
  }

  private draw() {
    const { width, height } = this.scale;
    this.stars.forEach(s => s.destroy());
    this.stars = Array.from({ length: 60 }, (_, i) =>
      this.add.circle(((i * 97) % 1000) / 1000 * width, ((i * 53) % 600) / 1000 * height, 1 + (i % 2), 0xffffff, 0.5));
    this.ground?.destroy();
    this.ground = this.add.rectangle(width / 2, height * 0.86, width, height * 0.28, 0x3a3f4b);
    this.note?.destroy();
    this.note = this.add.text(width - 16, height - 16, "Outpost scene: Step 5", { color: "#8a93a8", fontSize: "14px" }).setOrigin(1, 1);
  }
}
