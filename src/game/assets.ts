/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The asset manifest: every image and sound the game uses, by the exact file name the
// assets team delivers (see the Art & Audio Asset Guide). A delivered file replaces its
// placeholder automatically; a missing file never breaks anything.
//
// Sizes are in stage units (the 960 × 540 stage). Delivered images are 2× that, so a
// 220 × 140 module arrives as a 440 × 280 px file (per frame).

export type Priority = "must" | "should" | "nice";
export type Shape =
  | "rect" | "circle" | "spark" | "star" | "ground" | "hills" | "crew" | "frost"
  | "mound" | "bags" | "pit" | "spots" | "crack" | "glow";

export interface ImageAsset {
  key: string;
  ext: "webp" | "svg" | "png";
  /** "scene": loaded by Phaser. "ui": used by React (icons, portraits, story panels). */
  use: "scene" | "ui";
  w: number; h: number;          // one frame, in stage units
  frames?: number;               // horizontal strip of equal frames
  placeholder: { shape: Shape; color: number };
  priority: Priority;
}

export interface AudioAsset {
  key: string;
  kind: "music" | "amb" | "sfx";
  loop: boolean;
  priority: Priority;
}

/** Stage sizes of the module overlays (their rectangles in the outpost picture). */
const OVERLAY_SIZE = { power: [213, 129], warmth: [259, 121], food: [227, 126] } as const;

const img = (key: string, w: number, h: number, shape: Shape, color: number, priority: Priority,
  extra: Partial<ImageAsset> = {}): ImageAsset =>
  ({ key, ext: "webp", use: "scene", w, h, placeholder: { shape, color }, priority, ...extra });
const ui = (key: string, priority: Priority, ext: ImageAsset["ext"] = "svg", w = 24, h = 24): ImageAsset =>
  ({ key, ext, use: "ui", w, h, placeholder: { shape: "rect", color: 0x888888 }, priority });

export const IMAGES: ImageAsset[] = [
  // The delivered outpost: one top-down picture of the whole base per look (Step 8 art
  // drop). With these, the scene draws the picture instead of the shell and modules below.
  img("outpost_day", 960, 540, "rect", 0x5a5a60, "must"),
  img("outpost_night", 960, 540, "rect", 0x1d2438, "must"),
  img("outpost_day_buried", 960, 540, "rect", 0x6a645c, "should"),
  img("outpost_night_buried", 960, 540, "rect", 0x262b3a, "should"),
  // Module looks laid over the picture, cut from the warning / emergency versions of it.
  ...(["power", "warmth", "food"] as const).flatMap(res => {
    const [w, h] = OVERLAY_SIZE[res];
    return ["warning", "emergency"].flatMap(state => [
      img(`outpost_${res}_${state}`, w, h, "rect", 0x000000, "should"),
      img(`outpost_${res}_${state}_night`, w, h, "rect", 0x000000, "should"),
    ]);
  }),
  img("outpost_storm_closed", 213, 210, "rect", 0x2a4d8f, "should"),
  img("prop_rover_night", 63, 52, "rect", 0xc9a227, "should"),
  img("fx_radiator_dust", 112, 60, "spots", 0x6b5a44, "should"),
  img("fx_solar_damage", 187, 101, "crack", 0xeaf6ff, "should"),
  // Placeholder look (used only without the outpost picture above, so now "nice": the
  // backdrops, shell, modules, regolith, radiator, solar panel and Earth are all in it).
  // Backdrops
  img("bg_day_far", 960, 540, "rect", 0x26262b, "nice"),
  img("bg_day_mid", 960, 540, "hills", 0x8f8f8f, "nice"),
  img("bg_day_near", 960, 540, "ground", 0xb5b5b5, "nice"),
  img("bg_night_far", 960, 540, "rect", 0x0b0f1a, "nice"),
  img("bg_night_mid", 960, 540, "hills", 0x3a4560, "nice"),
  img("bg_night_near", 960, 540, "ground", 0x4b5672, "nice"),
  img("prop_earth", 120, 120, "circle", 0x4a90d9, "nice"),
  // Habitat and modules
  img("habitat_shell", 700, 380, "rect", 0x2f3747, "nice"),
  img("module_power", 220, 140, "rect", 0x3d6fa8, "nice", { frames: 3 }),
  img("module_heater", 220, 140, "rect", 0xb8692a, "nice", { frames: 3 }),
  img("module_greenhouse", 220, 140, "rect", 0x2f7a42, "nice", { frames: 3 }),
  img("module_lab", 220, 140, "rect", 0x5a4ea0, "nice", { frames: 2 }),
  img("module_stormroom", 220, 140, "rect", 0x6d7380, "nice", { frames: 2 }),
  img("fx_heater_glow", 220, 140, "glow", 0xff8a2a, "must"),
  img("fx_frost_window", 128, 128, "frost", 0xe8f4ff, "must"),
  img("fx_growlights", 220, 140, "glow", 0xff6ad5, "should"),
  img("habitat_regolith", 700, 380, "mound", 0x8a8378, "nice"),
  img("habitat_sandbags", 233, 230, "bags", 0xa89a7a, "should"),   // a ring around the storm room
  // Props and event visuals
  img("prop_radiator", 120, 60, "rect", 0xa9b6c8, "nice", { frames: 4 }),
  img("prop_solar_panel", 160, 80, "rect", 0x24477d, "nice", { frames: 2 }),
  img("prop_rover", 63, 52, "rect", 0xc9a227, "should"),
  img("prop_pit", 150, 70, "pit", 0x111318, "should"),
  img("prop_cave_mouth", 75, 40, "pit", 0x111318, "should"),
  img("fx_seal_crack", 60, 60, "crack", 0xe8f4ff, "should"),
  img("fx_frost_battery", 100, 70, "frost", 0xe8f4ff, "should"),
  img("fx_mold", 100, 70, "spots", 0x9aa08a, "should"),
  img("prop_lander", 90, 80, "rect", 0xbfc3c9, "nice"),
  img("prop_telescope", 40, 50, "rect", 0xdcdcdc, "nice"),
  // Characters: one standing pose and one talking pose each, 70 stage units tall (Step 8
  // art drop). The scene bobs them and switches to the talking pose to cheer or work.
  ...(["ana", "kai", "mei", "sol"] as const).flatMap(who => {
    const color = { ana: 0xe6ebf3, kai: 0xf28c28, mei: 0x3fbf6f, sol: 0x3fa7e0 }[who];
    return [img(`crew_${who}`, 32, 70, "crew", color, "must"), img(`crew_${who}_talk`, 40, 70, "crew", color, "should")];
  }),
  // Effect textures
  img("fx_star", 32, 32, "star", 0xffd84a, "must"),
  img("fx_spark", 16, 16, "spark", 0xfff2a8, "must"),
  img("fx_storm_streak", 64, 8, "rect", 0xe9d8ff, "must"),
  img("fx_dust", 16, 16, "circle", 0xb7b0a3, "should"),
  img("fx_flare", 64, 64, "circle", 0xfff2c4, "nice"),
  // Used by React (icons, portraits, story panels, photos)
  ...["icon_power", "icon_warmth", "icon_food", "icon_star", "icon_radiation",
    "icon_ok", "icon_warning", "icon_emergency",
    "icon_heater", "icon_greenhouse", "icon_experiments", "icon_shelter", "ui_power_cell",
    "icon_forecast_low", "icon_forecast_medium", "icon_forecast_high", "icon_day", "icon_night",
    "icon_crisis", "icon_dilemma", "icon_opportunity", "icon_storm_alert"].map(k => ui(k, "nice")),
  ...["icon_gamble_2", "icon_gamble_3", "icon_gamble_4", "ui_badge_stamp",
    "patch_win", "patch_storm"].map(k => ui(k, "nice")),
  ui("logo_title", "must", "webp", 800, 260),        // the CraterQuest banner
  ui("bg_title", "must", "webp", 960, 640),          // main menu background
  ui("favicon", "nice", "png", 32, 32), ui("app_icon_512", "nice", "png", 256, 256),
  ui("mentor_amara", "must", "webp", 300, 360), // 4 frames, used by the story screens (Step 7)
  ...["portrait_ana", "portrait_kai", "portrait_mei", "portrait_sol"].map(k => ui(k, "must", "webp", 256, 256)),
  ...["story_intro_1", "story_intro_2", "story_intro_3", "story_intro_4", "story_mask_1", "story_mask_2",
    "story_mask_3", "photo_finale_1", "photo_finale_2", "photo_finale_3"]
    .map(k => ui(k, "must", "webp", 960, 540)),
  ui("story_finale", "nice", "webp", 960, 540),   // the finale shows the three NASA photos instead
  ui("story_landing", "should", "webp", 960, 540),
];

const snd = (key: string, kind: AudioAsset["kind"], loop: boolean, priority: Priority): AudioAsset =>
  ({ key, kind, loop, priority });

export const AUDIO: AudioAsset[] = [
  snd("music_title", "music", true, "must"), snd("music_day", "music", true, "must"),
  snd("music_night", "music", true, "must"), snd("music_storm", "music", true, "should"),
  snd("music_finale", "music", false, "should"),
  snd("amb_hum", "amb", true, "must"), snd("amb_radio", "amb", false, "must"),
  snd("amb_heaters", "amb", true, "should"), snd("amb_greenhouse", "amb", true, "nice"),
  ...["sfx_click", "sfx_card_reveal", "sfx_option_select", "sfx_cell_pick", "sfx_cell_snap", "sfx_locked",
    "sfx_warning", "sfx_emergency", "sfx_star_gain", "sfx_star_lose", "sfx_badge_tick", "sfx_forecast",
    "sfx_storm", "sfx_shelter_door", "sfx_glitch", "sfx_mask_lift", "sfx_page_turn"]
    .map(k => snd(k, "sfx", false, "must")),
  ...["sfx_quake", "sfx_frost", "sfx_plant_grow", "sfx_regolith", "sfx_meteoroid", "sfx_lander",
    "sfx_code_ok", "sfx_code_bad"].map(k => snd(k, "sfx", false, "should")),
  snd("sfx_brush", "sfx", true, "nice"), snd("sfx_leak_beep", "sfx", false, "nice"),
];

export const fileOf = (a: ImageAsset) => `${a.key}.${a.ext}`;

/** Which assets have real files, given the lists of delivered files. */
export function deliveredStatus(files: { art: string[]; audio: string[] }) {
  const art = new Set(files.art), audio = new Set(files.audio);
  return {
    images: IMAGES.map(a => ({ asset: a, real: art.has(fileOf(a)) })),
    audio: AUDIO.map(a => {
      const ogg = audio.has(`${a.key}.ogg`), mp3 = audio.has(`${a.key}.mp3`);
      return { asset: a, ogg, mp3, real: ogg || mp3 };
    }),
  };
}
