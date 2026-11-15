/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Player settings: music and effects volume, mute, reduce motion and large text.
// A change is saved, applied to the page (large text, reduced motion) and sent to the
// outpost scene (volumes, mute, reduced motion).

import { create } from "zustand";
import { sendSettings } from "../store/game";
import { readSettings, saveSettings, type Settings } from "./progress";

/** Put the settings into effect: classes on <html> for the page, a message for the scene. */
export function applySettings(s: Settings) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("large-text", s.largeText);
    document.documentElement.classList.toggle("reduce-motion", s.reduceMotion);
  }
  sendSettings(s);
}

interface SettingsStore {
  settings: Settings;
  open: boolean;
  change(patch: Partial<Settings>): void;
  show(open: boolean): void;
}

export const useSettings = create<SettingsStore>()((set, get) => ({
  settings: readSettings(),
  open: false,
  change(patch) {
    const settings = { ...get().settings, ...patch };
    saveSettings(settings);
    applySettings(settings);
    set({ settings });
  },
  show(open) { set({ open }); },
}));
