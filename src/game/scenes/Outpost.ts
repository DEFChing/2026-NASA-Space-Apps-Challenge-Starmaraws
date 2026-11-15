/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The living outpost. It only shows what the engine decided: after each turn it plays
// the planned animation steps (animations/plan.ts), snaps to the new state, and tells
// React "animations-done" so the next panel appears only after the kid has seen what
// happened. Everything works on placeholders; delivered art swaps in by key. With the
// delivered outpost picture (Step 8), the scene draws it instead of the shell and modules,
// and lays the module warning / emergency looks over it.

import { Display, GameObjects, Scene, Scenes } from "phaser";
import type { DailyPlan, Flag, GameEvent, GameState, Res, Specialist } from "../../engine/types";
import { beats, planTurn, type Step } from "../animations/plan";
import { EventBus } from "../EventBus";
import { realImages } from "./Boot";

const STAGE = { w: 960, h: 540 };
/** Each kind of sound's own level; the player's volume settings multiply these. */
const MUSIC_LEVEL = 0.5, EFFECT_LEVEL = 0.9, AMBIENCE_LEVEL = 0.3;
const SHELL = { x: 130, y: 105, w: 828, h: 420 };   // placeholder habitat behind the modules
type ModuleId = "power" | "heater" | "greenhouse" | "lab" | "stormroom";
/** Module rectangles on the stage, measured on the delivered outpost picture; placeholders use the same places. */
const MODULES: Record<ModuleId, { key: string; x: number; y: number; w: number; h: number; label: string }> = {
  power:      { key: "module_power", x: 141, y: 115, w: 213, h: 129, label: "Power" },
  heater:     { key: "module_heater", x: 144, y: 259, w: 259, h: 121, label: "Heater" },
  greenhouse: { key: "module_greenhouse", x: 491, y: 172, w: 227, h: 126, label: "Greenhouse" },
  lab:        { key: "module_lab", x: 514, y: 391, w: 290, h: 126, label: "Science lab" },
  stormroom:  { key: "module_stormroom", x: 735, y: 141, w: 213, h: 210, label: "Storm room" },
};
/** Module overlays (outpost_<res>_<state>[_night]) by module. */
const OVERLAY: Partial<Record<ModuleId, string>> = { power: "power", heater: "warmth", greenhouse: "food" };
/** Places on the stage, from the outpost picture: things drawn in it, and open ground for props. */
const SPOT = {
  rover: { x: 430, y: 467 },               // parked in the garage (bottom centre of the sprite)
  garageDoor: { x: 430, y: 530 },          // just outside the garage, below the lab's row
  radiator: { x: 546, y: 322 }, solar: { x: 534, y: 60 },
  antenna: { x: 276, y: 63 },
  hub: { x: 428, y: 244 },                 // the corridor crossing
  pit: { x: 882, y: 505 }, cave: { x: 48, y: 345 }, lander: { x: 95, y: 532 }, telescope: { x: 862, y: 134 },
};
const MUSIC_FALLBACK: Record<string, string> = { music_night: "music_day", music_finale: "music_title" };
const RES_MODULE: Record<Res, ModuleId> = { power: "power", warmth: "heater", food: "greenhouse" };
const HOME: Record<Specialist | "ana", ModuleId> = { ana: "lab", engineer: "power", botanist: "greenhouse", doctor: "heater" };
const CREW_KEY: Record<Specialist, string> = { engineer: "crew_kai", botanist: "crew_mei", doctor: "crew_sol" };
const CREW_ANIMS: [string, number, number, number, number][] = [   // name, first, last, fps, repeat
  ["idle", 0, 3, 6, -1], ["walk", 4, 9, 10, -1], ["work", 10, 13, 8, -1], ["worried", 14, 15, 4, -1],
  ["cold", 16, 17, 6, -1], ["cheer", 18, 21, 10, 0], ["role", 22, 25, 8, -1],
];
const TINT = { warning: 0xffc46b, emergency: 0xff7a7a };
const HUD_STARS = { x: 150, y: 118 };     // where the Stars line sits in the React HUD (screen px)
const HUD_BADGE = { x: -110, y: 70 };     // badge, measured from the right edge

export interface TurnPayload {
  turn: number; events: GameEvent[]; state: GameState; cardId: string; cardTitle: string;
  plan: DailyPlan; isDay: boolean; nextIsDay: boolean | null;
}
export interface RunPayload { state: GameState; specialist: Specialist; isDay: boolean }

type Visual = GameObjects.Image | GameObjects.Sprite;
interface Module { id: ModuleId; img: Visual; dark: GameObjects.Rectangle; frost: Visual; pips: GameObjects.Container; x: number; y: number; w: number; h: number }
type Status = "normal" | "warning" | "emergency";

/** Drop-in art is drawn at half size (it's made at 2x); placeholders at full size. */
const baseScale = (key: string) => (realImages.has(key) ? 0.5 : 1);

export class Outpost extends Scene {
  private back!: GameObjects.Container;     // backdrop, scaled to cover the window
  private stage!: GameObjects.Container;    // the outpost, scaled to fit the window
  private fxLayer!: GameObjects.Container;  // screen-space effects (stars flying to the HUD)
  private bgDay: Visual[] = [];
  private bgNight: Visual[] = [];
  private earth!: Visual;
  private modules = {} as Record<ModuleId, Module>;
  private glow!: Visual;
  private growlights!: Visual;
  private plants: GameObjects.Arc[] = [];
  private props = {} as Record<"rover" | "radiator" | "solar" | "regolith" | "sandbags" | "cave" | "pit" | "lander" | "telescope" | "crack" | "frostBattery" | "mold", Visual>;
  private crew: { ana?: GameObjects.Sprite; spec?: GameObjects.Sprite; specialist?: Specialist } = {};
  private banner!: GameObjects.Text;
  private night = false;
  private reduce = false;
  private musicVol = 0.7;   // player settings (0–1), times each sound's own level
  private sfxVol = 0.8;
  private music?: Phaser.Sound.BaseSound;
  private musicKey = "";
  private running = false;
  /** The delivered outpost picture is in: draw it instead of the placeholder habitat. */
  private art = false;
  private bases = {} as Record<"day" | "night" | "dayBuried" | "nightBuried", Visual>;
  private buried = false;
  private overlays: Partial<Record<ModuleId, Record<"warning" | "emergency", { day: Visual; night: Visual }>>> = {};
  private moduleStatus: Partial<Record<ModuleId, Status>> = {};
  private stormDoor?: Visual;
  private siLabel?: GameObjects.Text;

  constructor() { super("Outpost"); }

  create() {
    this.reduce = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.back = this.add.container(0, 0);
    this.stage = this.add.container(0, 0);
    this.fxLayer = this.add.container(0, 0).setDepth(10);
    this.art = realImages.has("outpost_day");
    this.buildBackdrop();
    this.buildHabitat();
    this.buildProps();
    this.banner = this.add.text(STAGE.w / 2, 24, "", { fontFamily: "Arial", fontSize: "18px", color: "#ffffff", stroke: "#000000", strokeThickness: 4 })
      .setOrigin(0.5, 0).setAlpha(0);
    this.stage.add(this.banner);
    if (this.art) {
      // The outpost picture was made with SI, so it carries a visible label (AI_USAGE.md).
      this.siLabel = this.add.text(0, 0, "SI-generated art", { fontFamily: "Arial", fontSize: "13px", color: "#ffffff", backgroundColor: "#000000aa", padding: { x: 6, y: 3 } })
        .setOrigin(0, 1).setDepth(12).setAlpha(0.85);
    }
    this.layout();
    this.scale.on("resize", () => this.layout());

    const onRun = (p: RunPayload) => this.startRun(p);
    const onTurn = (p: TurnPayload) => void this.playTurn(p);
    const onSkip = () => this.setSpeed(6);
    const onSfx = (key: string) => this.sfx(key);
    const onPhase = (phase: string) => { if (phase === "crewPick" || phase === "title") this.playMusic("music_title"); };
    const onSettings = (st: { music: number; effects: number; mute: boolean; reduceMotion: boolean }) => {
      this.musicVol = st.music; this.sfxVol = st.effects; this.reduce = st.reduceMotion;
      this.sound.mute = st.mute;
      if (this.music) (this.music as unknown as { volume: number }).volume = MUSIC_LEVEL * this.musicVol;
      const amb = this.sound.get("amb_hum") as unknown as { volume: number } | null;
      if (amb) amb.volume = AMBIENCE_LEVEL * this.sfxVol;
    };
    EventBus.on("settings", onSettings);
    EventBus.on("run-started", onRun);
    EventBus.on("turn-resolved", onTurn);
    EventBus.on("skip-animations", onSkip);
    EventBus.on("sfx", onSfx);
    EventBus.on("phase", onPhase);
    // React may subscribe after this scene has already announced itself (a built game
    // boots fast); it then pings, and the scene answers again.
    const onPing = () => EventBus.emit("current-scene-ready", this);
    EventBus.on("scene-ping", onPing);
    const off = () => {
      EventBus.off("run-started", onRun); EventBus.off("turn-resolved", onTurn);
      EventBus.off("skip-animations", onSkip); EventBus.off("sfx", onSfx); EventBus.off("phase", onPhase); EventBus.off("scene-ping", onPing); EventBus.off("settings", onSettings);
    };
    this.events.once(Scenes.Events.SHUTDOWN, off);
    this.events.once(Scenes.Events.DESTROY, off);
    this.input.on("pointerdown", () => { if (this.running) this.setSpeed(6); });
    this.playMusic("music_title");
    // Dev only: lets playtest scripts call effects directly (window.__outpost.storm(true, 1)).
    if (import.meta.env.DEV) (window as unknown as { __outpost: Outpost }).__outpost = this;
    EventBus.emit("current-scene-ready", this);
  }

  // ---------------------------------------------------------------------------------
  // Building the scene
  // ---------------------------------------------------------------------------------

  /** An image or sprite from a manifest key; delivered art is 2×, so it's drawn at half size. */
  private put(key: string, x: number, y: number, ox = 0, oy = 0, sprite = false): Visual {
    const v = sprite ? this.add.sprite(x, y, key) : this.add.image(x, y, key);
    v.setOrigin(ox, oy);
    if (realImages.has(key)) v.setScale(0.5);
    return v;
  }

  private buildBackdrop() {
    if (this.art) {
      // Letterbox colour behind the picture; the picture itself lives on the stage, so the
      // modules, crew and props always line up with it.
      this.back.add(this.add.rectangle(0, 0, STAGE.w, STAGE.h, 0x0b0f1a).setOrigin(0));
      this.bases = {
        day: this.put("outpost_day", 0, 0), night: this.put("outpost_night", 0, 0).setAlpha(0),
        dayBuried: this.put("outpost_day_buried", 0, 0).setAlpha(0), nightBuried: this.put("outpost_night_buried", 0, 0).setAlpha(0),
      };
      this.stage.add(Object.values(this.bases));
      this.earth = this.put("prop_earth", 860, 70, 0.5, 0.5).setAlpha(0).setVisible(false);   // already in the picture
      return;
    }
    for (const [list, prefix] of [[this.bgDay, "bg_day"], [this.bgNight, "bg_night"]] as const) {
      for (const layer of ["far", "mid", "near"]) list.push(this.put(`${prefix}_${layer}`, 0, 0));
    }
    // Stars for the night sky (placeholder backdrops only), one baked image.
    if (!realImages.has("bg_night_far")) this.bgNight.splice(1, 0, this.add.image(0, 0, "night_stars").setOrigin(0));
    // The hidden set is switched off, not just transparent, so it costs nothing to draw.
    this.bgNight.forEach(v => v.setAlpha(0).setVisible(false));
    this.back.add([...this.bgDay, ...this.bgNight]);
    this.earth = this.put("prop_earth", 860, 70, 0.5, 0.5).setAlpha(0);
    this.stage.add(this.earth);
  }

  private buildHabitat() {
    if (!this.art) this.stage.add(this.put("habitat_shell", SHELL.x, SHELL.y).setDisplaySize(SHELL.w, SHELL.h));
    for (const id of Object.keys(MODULES) as ModuleId[]) {
      const { x, y, w, h, key, label: name } = MODULES[id];
      const img = this.put(key, x, y, 0, 0, true);
      if (this.art) img.setVisible(false);                       // the picture shows the module
      else if (!realImages.has(key)) img.setDisplaySize(w, h);
      const parts: GameObjects.GameObject[] = [img];
      const ov = OVERLAY[id];
      if (this.art && ov) {
        const look = (state: string, night: boolean) => {
          const v = this.put(`outpost_${ov}_${state}${night ? "_night" : ""}`, x, y).setAlpha(0);
          parts.push(v);
          return v;
        };
        this.overlays[id] = {
          warning: { day: look("warning", false), night: look("warning", true) },
          emergency: { day: look("emergency", false), night: look("emergency", true) },
        };
      }
      const dark = this.add.rectangle(x, y, w, h, 0x000000, 0).setOrigin(0, 0);
      const frost = this.put("fx_frost_window", x, y).setAlpha(0).setDisplaySize(this.art ? w : 70, this.art ? h : 70);
      parts.push(dark, frost);
      if (!this.art) parts.push(this.add.text(x + 8, y + 6, name, { fontFamily: "Arial", fontSize: "12px", color: "#ffffff", stroke: "#000000", strokeThickness: 3 }));
      const pips = this.add.container(x + w - 10, y + 10);
      parts.push(pips);
      this.stage.add(parts);
      this.modules[id] = { id, img, dark, frost, pips, x, y, w, h };
    }
    const sr = this.modules.stormroom;
    if (this.art) { this.stormDoor = this.put("outpost_storm_closed", sr.x, sr.y).setAlpha(0); this.stage.add(this.stormDoor); }
    const h = this.modules.heater, gh = this.modules.greenhouse;
    this.glow = this.put("fx_heater_glow", h.x, h.y).setAlpha(0).setDisplaySize(h.w, h.h);
    this.growlights = this.put("fx_growlights", gh.x, gh.y).setAlpha(0).setDisplaySize(gh.w, gh.h);
    this.stage.add([this.glow, this.growlights]);
    if (!this.art && !realImages.has("module_greenhouse")) {
      for (let i = 0; i < 5; i++) {
        const p = this.add.circle(gh.x + 30 + i * 40, gh.y + gh.h - 26, 14, 0x5fd27a);
        this.plants.push(p);
        this.stage.add(p);
      }
    }
  }

  private buildProps() {
    const P = this.props;
    const pw = this.modules.power, gh = this.modules.greenhouse, sr = this.modules.stormroom;
    P.regolith = this.put("habitat_regolith", SHELL.x, SHELL.y).setAlpha(0);
    if (!realImages.has("habitat_regolith")) P.regolith.setDisplaySize(SHELL.w, SHELL.h);
    P.sandbags = this.put("habitat_sandbags", sr.x - 10, sr.y - 10).setAlpha(0);
    if (this.art) {
      // The radiators and solar panels are part of the picture; dust and damage go on top.
      P.radiator = this.put("fx_radiator_dust", SPOT.radiator.x, SPOT.radiator.y).setAlpha(0);
      P.solar = this.put("fx_solar_damage", SPOT.solar.x, SPOT.solar.y).setAlpha(0);
    } else {
      P.radiator = this.put("prop_radiator", SHELL.x + 30, SHELL.y - 4, 0, 1, true);
      P.solar = this.put("prop_solar_panel", SHELL.x + SHELL.w - 190, SHELL.y - 4, 0, 1, true);
    }
    P.rover = this.put("prop_rover", SPOT.rover.x, SPOT.rover.y, 0.5, 1, true);
    P.cave = this.put("prop_cave_mouth", SPOT.cave.x, SPOT.cave.y, 0.5, 1).setAlpha(0);
    P.pit = this.put("prop_pit", SPOT.pit.x, SPOT.pit.y, 0.5, 1).setAlpha(0);
    P.lander = this.put("prop_lander", SPOT.lander.x, SPOT.lander.y, 0.5, 1, true).setAlpha(0);
    P.telescope = this.put("prop_telescope", SPOT.telescope.x, SPOT.telescope.y, 0.5, 1, true).setAlpha(0);
    P.crack = this.put("fx_seal_crack", SPOT.hub.x, SPOT.hub.y, 0.5, 0.5).setAlpha(0);
    P.frostBattery = this.put("fx_frost_battery", pw.x + pw.w * 0.3, pw.y + pw.h * 0.6, 0.5, 0.5).setAlpha(0);
    P.mold = this.put("fx_mold", gh.x + gh.w * 0.62, gh.y + gh.h * 0.6, 0.5, 0.5).setAlpha(0);
    this.stage.add([P.regolith, P.sandbags, P.radiator, P.solar, P.rover, P.cave, P.pit, P.lander, P.telescope, P.crack, P.frostBattery, P.mold]);
  }

  private layout() {
    const { width: w, height: h } = this.scale;
    const cover = Math.max(w / STAGE.w, h / STAGE.h);
    this.back.setScale(cover).setPosition((w - STAGE.w * cover) / 2, (h - STAGE.h * cover) / 2);
    const fit = Math.min(w / STAGE.w, h / STAGE.h);
    this.stage.setScale(fit).setPosition((w - STAGE.w * fit) / 2, (h - STAGE.h * fit) / 2);
    this.siLabel?.setPosition(8, h - 8);
  }

  /** Where a crew member stands at home: inside their module, Ana left of centre, the specialist right. */
  private homeOf(id: Specialist | "ana") {
    const m = this.modules[HOME[id]];
    return { x: m.x + m.w * (id === "ana" ? 0.3 : 0.7), y: m.y + m.h - 10 };
  }

  /** A crew sheet (26 frames) plays its animations; a single delivered picture swaps poses instead. */
  private isSheet = (s: GameObjects.Sprite) => realImages.has(s.texture.key) && s.texture.frameTotal > 2;

  private crewPose(s: GameObjects.Sprite, pose: "idle" | "walk" | "work" | "worried" | "cold" | "cheer") {
    const key = s.getData("key") as string;
    if (realImages.has(key) && this.textures.get(key).frameTotal > 2) { s.play(`${key}_${pose}`, true); return; }
    const talk = pose === "cheer" || pose === "work";
    s.setTexture(talk && this.textures.exists(`${key}_talk`) && realImages.has(`${key}_talk`) ? `${key}_talk` : key);
    if (pose === "worried") s.setTint(0xffd6c8); else if (pose === "cold") s.setTint(0xcfe6ff); else s.clearTint();
  }

  private makeCrew(key: string, id: Specialist | "ana"): GameObjects.Sprite {
    const home = this.homeOf(id);
    const s = this.put(key, home.x, home.y, 0.5, 1, true) as GameObjects.Sprite;
    s.setData("key", key);
    if (this.isSheet(s)) {
      for (const [name, a, b, fps, repeat] of CREW_ANIMS) {
        const k = `${key}_${name}`;
        if (!this.anims.exists(k)) this.anims.create({ key: k, frames: this.anims.generateFrameNumbers(key, { start: a, end: b }), frameRate: fps, repeat });
      }
      s.play(`${key}_idle`);
    } else if (!this.reduce) {
      // Breathing: a tiny stretch, so it never fights a walk (which moves x and y).
      this.tweens.add({ targets: s, scaleY: s.scaleY * 1.03, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
    this.stage.add(s);
    return s;
  }

  // ---------------------------------------------------------------------------------
  // State → visuals
  // ---------------------------------------------------------------------------------

  private startRun(p: RunPayload) {
    this.crew.ana?.destroy(); this.crew.spec?.destroy();
    this.crew = { specialist: p.specialist, ana: this.makeCrew("crew_ana", "ana"), spec: this.makeCrew(CREW_KEY[p.specialist], p.specialist) };
    this.setNight(!p.isDay, true);
    this.syncTo(p.state);
    this.playMusic(p.isDay ? "music_day" : "music_night");
    this.loopAmbience("amb_hum");
  }

  /** Snap every visual to the state (also corrects any drift after an animation). */
  private syncTo(s: GameState) {
    for (const r of ["power", "warmth", "food"] as Res[]) this.setModuleStatus(RES_MODULE[r], s.res[r]);
    this.setLights(s.res.power, false);
    this.setFrost(s.res.warmth, false);
    this.setPlants(s.res.food, false);
    this.setFrame(this.modules.lab.img, 0); this.setFrame(this.modules.stormroom.img, 0);
    this.stormDoor?.setAlpha(0);
    if (this.art) {
      this.buried = s.flags.includes("buried");
      this.showBase(true);
      this.props.radiator.setAlpha(0);
      this.props.rover.setPosition(SPOT.rover.x, SPOT.rover.y).clearTint();
    }
    this.glow.setAlpha(0); this.growlights.setAlpha(0);
    Object.values(this.modules).forEach(m => m.pips.removeAll(true));
    this.props.regolith.setAlpha(!this.art && s.flags.includes("buried") ? 1 : 0).setY(SHELL.y);
    this.props.sandbags.setAlpha(s.flags.includes("sandbagged") ? 1 : 0);
    this.props.cave.setAlpha(s.flags.includes("cave") ? 1 : 0);
    this.propState(this.props.solar, s.mods.some(m => m.delta < 0) ? 1 : 0);
    for (const k of ["pit", "lander", "telescope", "crack", "frostBattery", "mold"] as const) this.props[k].setAlpha(0);
    this.props.mold.setScale(baseScale("fx_mold"));
    this.crewHome();
    this.crewMood(s);
  }

  /** Art mode: show the outpost picture for the time of day and whether it's buried. */
  private showBase(instant: boolean) {
    const want = this.night ? (this.buried ? "nightBuried" : "night") : (this.buried ? "dayBuried" : "day");
    for (const [k, v] of Object.entries(this.bases) as [keyof typeof this.bases, Visual][]) {
      this.tweens.killTweensOf(v);
      if (instant) v.setAlpha(k === want ? 1 : 0);
      else this.tweens.add({ targets: v, alpha: k === want ? 1 : 0, duration: 1200 });
    }
    this.props.rover?.setTexture(this.night && realImages.has("prop_rover_night") ? "prop_rover_night" : "prop_rover");
    this.refreshOverlays(instant);
  }

  /** Art mode: each module's warning / emergency look, lit for the time of day. */
  private refreshOverlays(instant: boolean) {
    for (const id of Object.keys(this.overlays) as ModuleId[]) {
      const looks = this.overlays[id]!, st = this.moduleStatus[id] ?? "normal";
      for (const state of ["warning", "emergency"] as const) {
        for (const time of ["day", "night"] as const) {
          const v = looks[state][time];
          const alpha = st === state && (time === "night") === this.night ? 1 : 0;
          this.tweens.killTweensOf(v);
          if (instant) v.setAlpha(alpha); else this.tweens.add({ targets: v, alpha, duration: 400 });
        }
      }
    }
  }

  private setNight(night: boolean, instant: boolean) {
    this.night = night;
    if (this.art) { this.showBase(instant); return; }
    const d = instant ? 0 : 1200;
    // Both sets are drawn only while they cross-fade; afterwards the covered set
    // is switched off (the far layers are opaque, so nothing shows through).
    const covered = night ? this.bgDay : this.bgNight;
    [...this.bgDay, ...this.bgNight].forEach(v => v.setVisible(true));
    this.tweens.killTweensOf(this.bgNight);
    this.tweens.add({ targets: this.bgNight, alpha: night ? 1 : 0, duration: d, onComplete: () => { if (this.night === night) covered.forEach(v => v.setVisible(false)); } });
    if (!this.art) this.tweens.add({ targets: this.earth, alpha: night ? 1 : 0, duration: d });
  }

  private statusOf = (v: number) => (v <= 0 ? "emergency" : v <= 2 ? "warning" : "normal") as Status;

  private setModuleStatus(id: ModuleId, value: number, animate = false) {
    const st = this.statusOf(value);
    if (this.art) { this.moduleStatus[id] = st; this.refreshOverlays(!animate); return; }
    const img = this.modules[id].img;
    if (realImages.has(MODULES[id].key)) this.setFrame(img, st === "normal" ? 0 : st === "warning" ? 1 : 2);
    else if (st === "normal") img.clearTint();
    else img.setTint(TINT[st]);
  }

  private setFrame(v: Visual, frame: number) {
    if (v instanceof GameObjects.Sprite && realImages.has(v.texture.key) && v.texture.frameTotal > frame + 1) v.setFrame(frame);
    else if (frame === 0) v.clearTint();
    else v.setTint(frame === 1 ? 0xd8e6ff : 0x9a9a9a);
  }

  /** A prop's look: a frame or tint on placeholders, an overlay shown or hidden in art mode. */
  private propState(v: Visual, frame: number) {
    if (this.art && (v === this.props.radiator || v === this.props.solar)) v.setAlpha(frame > 0 ? 1 : 0);
    else this.setFrame(v, frame);
  }

  private setLights(power: number, animate: boolean) {
    const alpha = (this.art ? 0.45 : 0.7) * (1 - Math.min(10, power) / 10);
    const darks = Object.values(this.modules).map(m => m.dark);
    if (animate) return this.tween({ targets: darks, fillAlpha: alpha, duration: 400 });
    darks.forEach(d => d.setFillStyle(0x000000, alpha));
    return Promise.resolve();
  }

  private setFrost(warmth: number, animate: boolean) {
    const alpha = Math.max(0, Math.min(1, (6 - warmth) / 6)) * 0.9;
    const frosts = Object.values(this.modules).map(m => m.frost);
    if (animate) return this.tween({ targets: frosts, alpha, duration: 500 });
    frosts.forEach(f => f.setAlpha(alpha));
    return Promise.resolve();
  }

  private setPlants(food: number, animate: boolean) {
    if (!this.plants.length) return Promise.resolve();
    const scale = 0.45 + Math.min(10, food) / 10 * 0.75;
    this.plants.forEach(p => p.setFillStyle(food <= 2 ? 0x8a6b3a : 0x5fd27a));
    if (animate) return this.tween({ targets: this.plants, scale, duration: 400, ease: "Back.easeOut" });
    this.plants.forEach(p => p.setScale(scale));
    return Promise.resolve();
  }

  private crewHome() {
    const place = (s: GameObjects.Sprite | undefined, id: Specialist | "ana") => {
      if (!s) return;
      const h = this.homeOf(id);
      s.setPosition(h.x, h.y).setFlipX(false);
    };
    place(this.crew.ana, "ana");
    if (this.crew.specialist) place(this.crew.spec, this.crew.specialist);
  }

  private crewMood(s: GameState) {
    const mood = s.emergencies.length ? "worried" : s.res.warmth <= 2 ? "cold" : "idle";
    for (const c of [this.crew.ana, this.crew.spec]) if (c) this.crewPose(c, mood);
  }

  // ---------------------------------------------------------------------------------
  // Playing a turn
  // ---------------------------------------------------------------------------------

  private async playTurn(p: TurnPayload) {
    this.running = true;
    try {
      const steps = planTurn(p.events, { cardId: p.cardId, plan: p.plan, isDay: p.isDay, nextIsDay: p.nextIsDay });
      for (const beat of beats(steps)) await Promise.all(beat.map(step => this.play(step, p)));
      this.syncTo(p.state);
    } catch (err) {
      console.error("[outpost] animation failed; continuing", err);
      this.syncTo(p.state);
    } finally {
      this.setSpeed(1);
      this.running = false;
      EventBus.emit("animations-done");
    }
  }

  private play(step: Step, p: TurnPayload): Promise<void> {
    switch (step.kind) {
      case "shelter": return this.shelter();
      case "cells": return this.flowCells(step.plan, p.isDay);
      case "grow": this.sfx("sfx_plant_grow"); return Promise.all([this.floatAt("greenhouse", `Food +${step.amount}`, "#7dff9a"), this.popPlants()]).then(() => {});
      case "science": return this.flyStars(step.stars, this.modules.lab);
      case "blocked": return this.floatAt("lab", step.why === "shelter" ? "No Stars: sheltering" : "No Stars: crew strained", "#cfd6e6");
      case "card": return this.cardMoment(step.cardId, p.cardTitle);
      case "gamble": return this.floatAt("lab", step.failed ? "Bad luck: the risk came true" : "Phew! The risk didn't happen", step.failed ? "#ff9a8a" : "#9affb0", true);
      case "sun": return this.sunlight(step.amount);
      case "bar": return this.barChange(step.res, step.from, step.to, step.cause);
      case "stars": return step.amount > 0 ? this.flyStars(step.amount, this.modules.lab) : this.dropStars(-step.amount);
      case "badge": return this.badgeTick(step.amount, step.cause);
      case "storm": return this.storm(step.sheltered, step.pips);
      case "delayed": return this.showBanner(`From Turn ${step.fromTurn + 1}`, 700);
      case "mini": this.sfx("sfx_star_gain"); return this.floatAt("lab", "Star saved by hand!", "#9affb0", true);
      case "flag": return this.flag(step.flag);
      case "sunMod": this.propState(this.props.solar, 1); return this.floatAt("power", `Sunlight ${step.delta} every Day`, "#ffd27a");
      case "status": return this.status(step.status, step.res);
      case "sweep": return this.sweep(step.to);
      case "end": return this.endOfRun(step.status);
    }
  }

  // --- steps -------------------------------------------------------------------------

  private async shelter() {
    const crew = [this.crew.ana, this.crew.spec];
    if (this.props.cave.alpha > 0) {
      // With the cave found (D4), the crew shelters in the cave mouth: no Power needed.
      const { x, y } = this.props.cave;
      await Promise.all(crew.map((c, i) => c ? this.walkTo(c, x - 30 + i * 40, y) : Promise.resolve()));
      return;
    }
    this.sfx("sfx_shelter_door");
    this.setFrame(this.modules.stormroom.img, 1);
    const sr = this.modules.stormroom;
    await Promise.all(crew.map((c, i) => c ? this.walkTo(c, sr.x + sr.w * (0.35 + i * 0.3), sr.y + sr.h - 22) : Promise.resolve()));
    if (this.stormDoor) await this.tween({ targets: this.stormDoor, alpha: 1, duration: 400 });   // lockdown
  }

  private async flowCells(plan: DailyPlan, isDay: boolean) {
    const from = this.modules.power;
    const targets: [ModuleId, number][] = [["heater", plan.heater], ["greenhouse", plan.greenhouse], ["lab", plan.experiments], ["stormroom", plan.shelter ? 2 : 0]];
    const flights: Promise<void>[] = [];
    let n = 0;
    for (const [id, count] of targets) {
      const m = this.modules[id];
      for (let i = 0; i < count; i++) {
        const cell = this.add.image(from.x + from.w / 2, from.y + from.h / 2, "cell");
        this.stage.add(cell);
        const delay = (this.reduce ? 0 : n++ * 70);
        flights.push(this.tween({ targets: cell, x: m.x + m.w - 16 - i * 12, y: m.y + 16, delay, duration: this.reduce ? 1 : 420, ease: "Cubic.easeInOut" })
          .then(() => { this.sfx("sfx_cell_snap"); cell.destroy(); this.addPip(m); }));
      }
    }
    if (!flights.length) return;
    await Promise.all(flights);
    if (plan.heater > 0 && !isDay) this.tweens.add({ targets: this.glow, alpha: plan.heater / 2, duration: 300 });
    if (plan.greenhouse > 0) this.tweens.add({ targets: this.growlights, alpha: 0.6, duration: 300 });
    if (plan.experiments > 0 && !plan.shelter) this.setFrame(this.modules.lab.img, 1);
  }

  private addPip(m: Module) {
    const i = m.pips.length;
    m.pips.add(this.add.image(-i * 12, 0, "cell").setScale(0.6));
  }

  private async cardMoment(cardId: string, title: string) {
    this.sfx("amb_radio");
    const show = this.showBanner(title, 1300);
    const P = this.props;
    switch (cardId) {
      case "B0": await this.roverTrip(70, 500); break;
      case "D2": this.propState(P.radiator, 2); await this.puffs(P.radiator.x + 60, P.radiator.y + (this.art ? 20 : -30), 5); break;
      case "D3": await this.tint(0xffb36b, 600); break;
      case "D4": await Promise.all([this.fadeIn(P.pit, 600), this.roverTrip(SPOT.pit.x - 70, 525)]); break;
      case "D6": await this.roverTrip(935, 525); break;
      case "D7": this.sfx("sfx_lander"); P.lander.setAlpha(1).setY(150); await this.tween({ targets: P.lander, y: 500, duration: 1100, ease: "Quad.easeOut" }); this.setFrame(P.lander, 1); await this.puffs(880, 495, 6); break;
      case "D8": await this.meteoroid(P.solar.x + 80, P.solar.y - 40); break;
      case "N1": case "N2": this.sfx("sfx_frost"); await this.tween({ targets: Object.values(this.modules).map(m => m.frost), alpha: 0.9, duration: 500, yoyo: true }); break;
      case "N3": await this.quake(); break;
      case "N4": await this.fadeIn(P.frostBattery, 500); break;
      case "N5": await this.radioWaves(); break;
      case "N6": P.rover.setTint(0xb8d4ff); await this.wait(500); break;
      case "N7": await this.mold(); break;
      case "N8": await this.tint(0x8a6bff, 700); break;
      case "N9": await this.fadeIn(P.telescope, 600); break;
      default: break;
    }
    await show;
  }

  private async sunlight(amount: number) {
    const rays: GameObjects.Rectangle[] = [];
    for (let i = 0; i < 6; i++) {
      const r = this.add.rectangle(this.props.solar.x + 20 + i * 24, 0, 4, 60, 0xffe680, 0.8).setOrigin(0.5, 0).setAngle(-15);
      rays.push(r); this.stage.add(r);
    }
    await Promise.all([
      this.tween({ targets: rays, y: this.props.solar.y - 70, alpha: 0, duration: 650 }),
      this.floatAt("power", `Sunlight: Power +${amount}`, "#ffe680"),
    ]);
    rays.forEach(r => r.destroy());
  }

  private async barChange(res: Res, from: number, to: number, cause: string) {
    const d = to - from;
    const label = { power: "Power", warmth: "Warmth", food: "Food" }[res];
    const color = d > 0 ? "#9affb0" : "#ffb0a0";
    const why = cause === "nightCold" ? "Cold night: " : cause === "upkeep" ? "The crew ate: " : cause === "sunWarmth" ? "Sunlight: " : "";
    const visual = res === "power" ? this.setLights(to, true) : res === "warmth" ? this.setFrost(to, true) : this.setPlants(to, true);
    if (cause === "nightCold" && to < from) this.sfx("sfx_frost");
    this.setModuleStatus(RES_MODULE[res], to, true);
    await Promise.all([visual, this.floatAt(RES_MODULE[res], `${why}${label} ${d > 0 ? "+" : "−"}${Math.abs(d)}`, color)]);
  }

  private async badgeTick(amount: number, cause: string) {
    this.sfx("sfx_badge_tick");
    const crew = [this.crew.ana, this.crew.spec].filter(Boolean) as GameObjects.Sprite[];
    const rings = crew.map(c => { const r = this.add.circle(c.x, c.y - 50, 10, 0xb98cff, 0.6); this.stage.add(r); return r; });
    const label = cause === "drip" ? `Cosmic rays: +${amount} pip` : `+${amount} pip${amount > 1 ? "s" : ""}`;
    await Promise.all([
      this.tween({ targets: rings, scale: 3, alpha: 0, duration: 600 }),
      this.floatScreen(this.scale.width + HUD_BADGE.x, HUD_BADGE.y + 40, label, "#d8b8ff"),
    ]);
    rings.forEach(r => r.destroy());
  }

  private async storm(sheltered: boolean, pips: number) {
    this.sfx("sfx_storm");
    if (this.musicKey) this.playMusic("music_storm");
    void this.showBanner(sheltered ? "Solar storm! The crew is sheltering" : "Solar storm! The crew kept working", 1600);
    const { width: w, height: h } = this.scale;
    const count = this.reduce ? 10 : 46;
    const streaks: GameObjects.Image[] = [];
    for (let i = 0; i < count; i++) {
      const s = this.add.image(-80 - Math.random() * w * 0.5, Math.random() * h * 0.75, "fx_storm_streak").setAngle(12).setAlpha(0.9).setDepth(9);
      if (realImages.has("fx_storm_streak")) s.setScale(0.5);
      streaks.push(s);
    }
    await this.flash(0xe9d8ff, 200);
    await Promise.all(streaks.map((s, i) => this.tween({ targets: s, x: w + 120, y: s.y + 160, duration: 900 + (i % 5) * 120, delay: (i % 12) * 60 })));
    streaks.forEach(s => s.destroy());
    if (!sheltered) for (const c of [this.crew.ana, this.crew.spec]) c?.setTint(0xd8b8ff);
    await this.floatScreen(this.scale.width + HUD_BADGE.x, HUD_BADGE.y + 40, `+${pips} pip${pips > 1 ? "s" : ""}`, "#d8b8ff", pips > 1);
    for (const c of [this.crew.ana, this.crew.spec]) c?.clearTint();
    this.playMusic(this.night ? "music_night" : "music_day");
  }

  private async flag(flag: Flag) {
    const P = this.props;
    if (flag === "buried") await this.pileRegolith();
    if (flag === "sandbagged") await this.fadeIn(P.sandbags, 700);
    if (flag === "cave") { await this.fadeIn(P.cave, 700); await this.sparkle(P.cave.x, P.cave.y - 30); }
  }

  private async status(status: "warning" | "emergency" | "recovered", res: Res) {
    const m = this.modules[RES_MODULE[res]];
    const color = status === "recovered" ? 0x7dff9a : status === "warning" ? 0xffc46b : 0xff5d5d;
    this.sfx(status === "emergency" ? "sfx_emergency" : status === "warning" ? "sfx_warning" : "sfx_star_gain");
    if (status === "emergency" && !this.reduce) this.cameras.main.shake(250, 0.004);
    const box = this.add.rectangle(m.x, m.y, m.w, m.h).setOrigin(0, 0).setStrokeStyle(5, color);
    this.stage.add(box);
    await this.tween({ targets: box, alpha: { from: 1, to: 0.2 }, duration: 260, yoyo: true, repeat: 1 });
    box.destroy();
  }

  private async sweep(to: "day" | "night") {
    const { width: w, height: h } = this.scale;
    const band = this.add.rectangle(to === "night" ? -w : w * 2, h / 2, w, h * 2, 0x000000, 0.55).setDepth(8);
    this.setNight(to === "night", false);
    this.playMusic(to === "night" ? "music_night" : "music_day");
    await Promise.all([
      this.showBanner(to === "night" ? "Sunset: two weeks of night begin" : "Sunrise: the Sun is back", 900),
      this.tween({ targets: band, x: to === "night" ? w * 2 : -w, duration: this.reduce ? 300 : 1200, ease: "Sine.easeInOut" }),
    ]);
    band.destroy();
  }

  private async endOfRun(status: "won" | "lost") {
    if (status === "won") {
      for (const c of [this.crew.ana, this.crew.spec]) if (c) this.crewPose(c, "cheer");
      await this.flyStars(5, this.modules.lab, true);
    } else {
      await this.tween({ targets: Object.values(this.modules).map(m => m.dark), fillAlpha: 0.6, duration: 600 });
    }
  }

  // --- small effects -----------------------------------------------------------------

  private async flyStars(n: number, from: Module, celebrate = false) {
    const start = this.toScreen(from.x + from.w / 2, from.y + from.h / 2);
    const flights: Promise<void>[] = [];
    for (let i = 0; i < Math.min(n, 6); i++) {
      const s = this.add.image(start.x, start.y, "fx_star").setDepth(11);
      if (realImages.has("fx_star")) s.setScale(0.5);
      this.fxLayer.add(s);
      const target = celebrate ? { x: start.x + (i - 2) * 60, y: start.y - 160 } : HUD_STARS;
      flights.push(this.tween({ targets: s, x: target.x, y: target.y, duration: this.reduce ? 200 : 700, delay: i * 120, ease: "Cubic.easeIn" })
        .then(() => { this.sfx("sfx_star_gain"); return this.tween({ targets: s, alpha: 0, scale: 0.2, duration: 200 }); })
        .then(() => s.destroy()));
    }
    await Promise.all(flights);
  }

  private async dropStars(n: number) {
    this.sfx("sfx_star_lose");
    const stars = Array.from({ length: Math.min(n, 4) }, (_, i) => {
      const s = this.add.image(HUD_STARS.x + i * 20, HUD_STARS.y, "fx_star").setDepth(11).setTint(0x9a9a9a);
      if (realImages.has("fx_star")) s.setScale(0.5);
      this.fxLayer.add(s);
      return s;
    });
    await this.tween({ targets: stars, y: HUD_STARS.y + 120, alpha: 0, angle: 60, duration: 700, ease: "Quad.easeIn" });
    stars.forEach(s => s.destroy());
    await this.floatScreen(HUD_STARS.x + 60, HUD_STARS.y + 10, `−${n} Star${n > 1 ? "s" : ""}`, "#ffb0a0");
  }

  private async popPlants() {
    if (this.plants.length) await this.tween({ targets: this.plants, scaleY: "+=0.25", duration: 160, yoyo: true });
  }

  /** Out of the garage, along the open ground below the base, and back home (placeholders: one drive). */
  private async roverTrip(x: number, y: number) {
    if (!this.art) { await this.driveRover(x, y); return; }
    const door = SPOT.garageDoor;
    await this.driveRover(door.x, door.y);
    await this.driveRover(x, door.y);
    if (y !== door.y) await this.driveRover(x, y);
    await this.wait(300);
    if (y !== door.y) await this.driveRover(x, door.y);
    await this.driveRover(door.x, door.y);
    await this.driveRover(SPOT.rover.x, SPOT.rover.y);
  }

  private async driveRover(x: number, y: number) {
    const r = this.props.rover;
    r.setFlipX(x < r.x);
    await this.tween({ targets: r, x, y, duration: this.reduce ? 200 : Math.min(1400, Math.abs(r.x - x) * 2.2 + 200), ease: "Sine.easeInOut" });
    r.setFlipX(false);
  }

  private async walkTo(c: GameObjects.Sprite, x: number, y: number) {
    this.crewPose(c, "walk");
    c.setFlipX(x < c.x);
    await this.tween({ targets: c, x, y, duration: this.reduce ? 150 : 700, ease: "Sine.easeInOut" });
    this.crewPose(c, "idle");
  }

  private async puffs(x: number, y: number, n: number) {
    const ps = Array.from({ length: this.reduce ? 2 : n }, (_, i) => {
      const p = this.add.image(x + (i - n / 2) * 10, y, "fx_dust").setAlpha(0.9);
      if (realImages.has("fx_dust")) p.setScale(0.5);
      this.stage.add(p);
      return p;
    });
    await this.tween({ targets: ps, y: y - 30, alpha: 0, scale: 2.2, duration: 650 });
    ps.forEach(p => p.destroy());
  }

  private async sparkle(x: number, y: number) {
    const s = this.add.image(x, y, "fx_spark").setScale(0.5);
    this.stage.add(s);
    await this.tween({ targets: s, scale: 2.5, alpha: 0, duration: 600 });
    s.destroy();
  }

  private async radioWaves() {
    const from = this.art ? SPOT.antenna : { x: SHELL.x + 470, y: SHELL.y };
    const rings = [0, 1, 2].map(() => { const r = this.add.circle(from.x, from.y, 8).setStrokeStyle(3, 0x9fd3ff); this.stage.add(r); return r; });
    if (!this.art) this.tweens.add({ targets: this.earth, alpha: 1, duration: 300 });
    await Promise.all(rings.map((r, i) => this.tween({ targets: r, scale: 10, alpha: 0, duration: 900, delay: i * 250 })));
    rings.forEach(r => r.destroy());
    if (!this.night && !this.art) this.tweens.add({ targets: this.earth, alpha: 0, duration: 300 });
  }

  private async fadeIn(v: Visual, duration: number) { await this.tween({ targets: v, alpha: 1, duration }); }

  // --- Step 8 effects: regolith piling, quake shake, micrometeoroid flash, mold --------

  /** Regolith is pushed up over the shell in three loads, with dust kicked up along it. */
  private async pileRegolith() {
    const P = this.props;
    this.sfx("sfx_regolith");
    if (this.art) {
      // The buried picture fades in while loads of regolith kick up dust around the base.
      this.buried = true;
      this.showBase(false);
      if (!this.reduce) await Promise.all([0, 1, 2].map(i => this.wait(i * 300).then(() => this.puffs(200 + i * 260, 470 - (i % 2) * 300, 6))));
      await this.wait(this.reduce ? 300 : 600);
      return;
    }
    if (this.reduce) { await this.fadeIn(P.regolith, 400); return; }
    P.regolith.setY(SHELL.y + 60);
    const loads = [0, 1, 2].map(i => this.wait(i * 300).then(() => this.puffs(SHELL.x + 120 + i * 230, SHELL.y + SHELL.h - 60, 6)));
    await Promise.all([...loads, this.tween({ targets: P.regolith, alpha: 1, y: SHELL.y, duration: 1100, ease: "Quad.easeOut" })]);
  }

  /** The ground shakes, dust falls inside every module, then the seal crack shows. */
  private async quake() {
    this.sfx("sfx_quake");
    if (!this.reduce) {
      this.cameras.main.shake(1100, 0.007);
      await Promise.all([
        this.tween({ targets: this.stage, x: this.stage.x + 5, duration: 70, yoyo: true, repeat: 6 }),
        ...Object.values(this.modules).map((m, i) => this.wait(i * 90).then(() => this.puffs(m.x + m.w / 2, m.y + 30, 3))),
      ]);
    } else await this.puffs(SHELL.x + 350, SHELL.y + 40, 2);
    await this.fadeIn(this.props.crack, 300);
  }

  /** A tiny grain streaks in, flashes on the solar panel and leaves a pit. */
  private async meteoroid(x: number, y: number) {
    this.sfx("sfx_meteoroid");
    if (!this.reduce) {
      const grain = this.add.circle(x + 320, y - 260, 4, 0xffffff).setDepth(6);
      const trail = this.add.line(0, 0, x + 320, y - 260, x + 320, y - 260, 0xfff3c4).setOrigin(0, 0).setLineWidth(2).setDepth(6);
      this.stage.add([trail, grain]);
      await this.tween({
        targets: grain, x, y, duration: 240, ease: "Quad.easeIn",
        onUpdate: () => trail.setTo(x + 320, y - 260, grain.x, grain.y),
      });
      grain.destroy();
      this.tweens.add({ targets: trail, alpha: 0, duration: 300, onComplete: () => trail.destroy() });
    }
    await this.flash(0xffffff, 120);
    await Promise.all([this.puffs(x, y, 4), this.sparkle(x, y)]);
  }

  /** Mold spreads across the greenhouse wall. */
  private async mold() {
    const m = this.props.mold, full = baseScale("fx_mold");
    if (this.reduce) { await this.fadeIn(m, 400); return; }
    m.setScale(full * 0.25);
    await this.tween({ targets: m, alpha: 1, scale: full, duration: 1000, ease: "Sine.easeOut" });
  }

  private async flash(color: number, ms: number) {
    const c = Display.Color.IntegerToRGB(color);
    this.cameras.main.flash(this.reduce ? 60 : ms, c.r, c.g, c.b);
    await this.wait(ms);
  }

  private async tint(color: number, ms: number) {
    const { width: w, height: h } = this.scale;
    const r = this.add.rectangle(0, 0, w, h, color, 0).setOrigin(0, 0).setDepth(7);
    await this.tween({ targets: r, fillAlpha: 0.25, duration: ms / 2, yoyo: true });
    r.destroy();
  }

  private async showBanner(text: string, ms: number) {
    this.banner.setText(text).setAlpha(0);
    await this.tween({ targets: this.banner, alpha: 1, duration: 200 });
    await this.wait(ms);
    await this.tween({ targets: this.banner, alpha: 0, duration: 200 });
  }

  private floatAt(id: ModuleId, text: string, color: string, big = false) {
    const m = this.modules[id];
    return this.floatText(this.stage, m.x + m.w / 2, m.y + 40, text, color, big);
  }

  private floatScreen(x: number, y: number, text: string, color: string, big = false) {
    return this.floatText(this.fxLayer, x, y, text, color, big);
  }

  // The label keeps rising and fading on its own; the next step may start once
  // it has been readable for a moment (big labels stay a little longer).
  private floatText(layer: GameObjects.Container, x: number, y: number, text: string, color: string, big: boolean) {
    const t = this.add.text(x, y, text, { fontFamily: "Arial", fontSize: big ? "22px" : "16px", color, stroke: "#000000", strokeThickness: 4 }).setOrigin(0.5);
    layer.add(t);
    void this.tween({ targets: t, y: this.reduce ? y : y - 34, alpha: { from: 1, to: 0 }, duration: 1100, ease: "Quad.easeIn" }).then(() => t.destroy());
    return this.wait(big ? 900 : 650);
  }

  private toScreen(x: number, y: number) {
    return { x: this.stage.x + x * this.stage.scaleX, y: this.stage.y + y * this.stage.scaleY };
  }

  // --- timing and sound --------------------------------------------------------------

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise(resolve => this.tweens.add({ ...config, onComplete: () => resolve() }));
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => this.time.delayedCall(ms, () => resolve()));
  }

  private setSpeed(scale: number) {
    this.tweens.timeScale = scale;
    this.time.timeScale = scale;
  }

  private sfx(key: string) {
    if (this.cache.audio.exists(key)) this.sound.play(key, { volume: EFFECT_LEVEL * this.sfxVol });
  }

  private playMusic(wanted: string) {
    const key = this.cache.audio.exists(wanted) ? wanted : (MUSIC_FALLBACK[wanted] ?? wanted);   // night reuses the day track
    if (key === this.musicKey) return;
    const old = this.music;
    if (old) this.tweens.add({ targets: old, volume: 0, duration: 800, onComplete: () => old.destroy() });
    this.music = undefined;
    this.musicKey = key;
    if (!this.cache.audio.exists(key)) return;
    const m = this.sound.add(key, { loop: key !== "music_finale", volume: 0 });
    m.play();
    this.tweens.add({ targets: m, volume: MUSIC_LEVEL * this.musicVol, duration: 800 });
    this.music = m;
  }

  private loopAmbience(key: string) {
    if (this.cache.audio.exists(key) && !this.sound.get(key)?.isPlaying) this.sound.play(key, { loop: true, volume: AMBIENCE_LEVEL * this.sfxVol });
  }
}
