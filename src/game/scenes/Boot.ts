/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Loads every delivered art and audio file, then draws a placeholder texture for each
// image that hasn't arrived yet, under the same key. The rest of the game never needs
// to know which is which, except to pick frames (real) or tints (placeholder).

import { Math as PMath, Scene } from "phaser";
import files from "virtual:asset-files";
import { deliveredStatus, IMAGES, type ImageAsset } from "../assets";

/** Keys of images that loaded from real files (the rest are placeholders). */
export const realImages = new Set<string>();

export class Boot extends Scene {
  constructor() { super("Boot"); }

  preload() {
    const status = deliveredStatus(files);
    this.load.setPath("");
    this.load.on("loaderror", (file: Phaser.Loader.File) => realImages.delete(file.key));
    for (const { asset, real } of status.images) {
      if (!real || asset.use !== "scene") continue;
      realImages.add(asset.key);
      const url = `art/${asset.key}.${asset.ext}`;
      if (asset.frames && asset.frames > 1) {
        this.load.spritesheet(asset.key, url, { frameWidth: asset.w * 2, frameHeight: asset.h * 2 });
      } else {
        this.load.image(asset.key, url);
      }
    }
    for (const { asset, ogg, mp3 } of status.audio) {
      const urls = [ogg && `audio/${asset.key}.ogg`, mp3 && `audio/${asset.key}.mp3`].filter(Boolean) as string[];
      if (urls.length) this.load.audio(asset.key, urls);
    }
  }

  create() {
    for (const a of IMAGES) {
      if (a.use === "scene" && !this.textures.exists(a.key)) drawPlaceholder(this, a);
    }
    // A power cell for the split animation (made in code, not an asset).
    const g = this.add.graphics();
    g.fillStyle(0xffe066, 1).fillRoundedRect(0, 0, 14, 20, 4).fillStyle(0xfff6c4, 1).fillRect(5, 0, 4, 3);
    g.generateTexture("cell", 14, 20);
    // Night-sky stars for the placeholder backdrop, baked into one texture so
    // the GPU draws one image instead of 70 shapes.
    g.clear();
    for (let i = 0; i < 70; i++) g.fillStyle(0xffffff, 0.8).fillCircle((i * 137) % 960, (i * 61) % 324, i % 3 === 0 ? 1.5 : 1);
    g.generateTexture("night_stars", 960, 324);
    g.destroy();
    this.scene.start("Outpost");
  }
}

/** Simple shapes in each asset's size and colour, so every animation works before the art. */
function drawPlaceholder(scene: Scene, a: ImageAsset) {
  const { w, h } = a;
  const c = a.placeholder.color;
  const g = scene.add.graphics();
  switch (a.placeholder.shape) {
    case "circle":
      g.fillStyle(c, 1).fillCircle(w / 2, h / 2, Math.min(w, h) / 2);
      break;
    case "spark":
      g.fillStyle(c, 1).fillCircle(w / 2, h / 2, w / 4).fillStyle(0xffffff, 0.8).fillCircle(w / 2, h / 2, w / 8);
      break;
    case "star": {
      const pts: PMath.Vector2[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? w * 0.22 : w * 0.5, ang = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(new PMath.Vector2(w / 2 + r * Math.cos(ang), h / 2 + r * Math.sin(ang)));
      }
      g.fillStyle(c, 1).fillPoints(pts, true);
      break;
    }
    case "ground":
      g.fillStyle(c, 1).fillRect(0, h * 0.82, w, h * 0.18);
      for (let i = 0; i < 14; i++) g.fillStyle(0x000000, 0.12).fillEllipse((i * 71) % w, h * 0.86 + (i % 3) * 14, 30 + (i % 4) * 10, 8);
      break;
    case "hills":
      g.fillStyle(c, 1).beginPath().moveTo(0, h);
      for (let x = 0; x <= w; x += 40) g.lineTo(x, h * 0.66 + Math.sin(x / 90) * 18 + Math.cos(x / 37) * 8);
      g.lineTo(w, h).closePath().fillPath();
      break;
    case "crew":
      g.fillStyle(c, 1).fillRoundedRect(w * 0.25, h * 0.38, w * 0.5, h * 0.5, 8);          // body
      g.fillStyle(c, 1).fillCircle(w / 2, h * 0.24, w * 0.24);                            // helmet
      g.fillStyle(0x1b2a44, 1).fillRoundedRect(w * 0.34, h * 0.17, w * 0.32, h * 0.12, 4); // visor
      g.fillStyle(0x222222, 1).fillRect(w * 0.3, h * 0.86, w * 0.15, h * 0.12).fillRect(w * 0.55, h * 0.86, w * 0.15, h * 0.12);
      break;
    case "frost":
      g.fillStyle(c, 0.85).fillTriangle(0, 0, w, 0, 0, h);
      g.lineStyle(2, 0xffffff, 0.9);
      for (let i = 1; i < 5; i++) g.lineBetween(0, (h * i) / 5, (w * i) / 5, 0);
      break;
    case "mound":
      g.fillStyle(c, 1).fillEllipse(w / 2, h * 0.32, w * 1.05, h * 0.62).fillRect(0, h * 0.3, w * 0.04, h * 0.7).fillRect(w * 0.96, h * 0.3, w * 0.04, h * 0.7);
      break;
    case "bags":
      for (let i = 0; i < 6; i++) g.fillStyle(c, 1).fillRoundedRect(10 + i * 40, h - 34, 36, 22, 8).fillRoundedRect(30 + i * 40, h - 52, 36, 20, 8);
      break;
    case "pit":
      g.fillStyle(0x6d6d6d, 1).fillEllipse(w / 2, h / 2, w, h * 0.7).fillStyle(c, 1).fillEllipse(w / 2, h * 0.55, w * 0.8, h * 0.5);
      break;
    case "spots":
      for (let i = 0; i < 9; i++) g.fillStyle(c, 0.9).fillCircle((i * 37) % w, (i * 23) % h, 4 + (i % 3) * 3);
      break;
    case "crack":
      g.lineStyle(3, c, 1).beginPath().moveTo(4, 4).lineTo(w * 0.4, h * 0.35).lineTo(w * 0.3, h * 0.6).lineTo(w - 4, h - 4).strokePath();
      break;
    case "glow":
      for (let i = 0; i < 6; i++) g.fillStyle(c, 0.12).fillEllipse(w / 2, h / 2, w * (1 - i * 0.12), h * (1 - i * 0.12));
      break;
    default: // rect
      g.fillStyle(c, 1).fillRoundedRect(0, 0, w, h, Math.min(10, w / 6, h / 6));
      g.lineStyle(2, 0x000000, 0.35).strokeRoundedRect(1, 1, w - 2, h - 2, Math.min(10, w / 6, h / 6));
  }
  g.generateTexture(a.key, w, h);
  g.destroy();
}
