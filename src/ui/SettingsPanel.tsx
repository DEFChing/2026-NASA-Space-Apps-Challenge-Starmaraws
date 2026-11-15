/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// The Settings button (bottom-left on every screen) and its dialog.

import { useEffect } from "react";
import { useSettings } from "./settings";

/** Sits in the HUD during a mission and as a link on the title and crew pick screens, never floating over a panel. */
export function SettingsButton({ className = "settings-button" }: { className?: string }) {
  const show = useSettings(s => s.show);
  return (
    <button className={className} data-testid="open-settings" onClick={() => show(true)}>
      <span aria-hidden="true">{"⚙"}</span> Settings
    </button>
  );
}

export function SettingsDialog() {
  const { settings: s, open, change, show } = useSettings();
  useEffect(() => {
    if (!open) return;
    // Keyboard players get their place back: focus returns to where it was before.
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); show(false); } };
    addEventListener("keydown", onKey, true);
    return () => {
      removeEventListener("keydown", onKey, true);
      const target = before && before.isConnected && before.dataset.testid !== "open-settings" ? before : document.querySelector<HTMLElement>("[autofocus], .overlay button.primary");
      setTimeout(() => target?.focus(), 0);
    };
  }, [open, show]);
  if (!open) return null;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <div className="settings-backdrop" onClick={() => show(false)}>
      <section className="panel settings" role="dialog" aria-modal="true" aria-label="Settings" data-testid="settings" onClick={e => e.stopPropagation()}>
        <h2>Settings</h2>
        <label className="setting">
          <span>Music volume <small>{pct(s.music)}</small></span>
          <input type="range" min={0} max={1} step={0.05} value={s.music} data-testid="setting-music" autoFocus
            onChange={e => change({ music: Number(e.target.value) })} />
        </label>
        <label className="setting">
          <span>Effects volume <small>{pct(s.effects)}</small></span>
          <input type="range" min={0} max={1} step={0.05} value={s.effects} data-testid="setting-effects"
            onChange={e => change({ effects: Number(e.target.value) })} />
        </label>
        <label className="setting toggle">
          <input type="checkbox" checked={s.mute} data-testid="setting-mute" onChange={e => change({ mute: e.target.checked })} />
          <span>Mute all sound</span>
        </label>
        <label className="setting toggle">
          <input type="checkbox" checked={s.reduceMotion} data-testid="setting-reduce-motion" onChange={e => change({ reduceMotion: e.target.checked })} />
          <span>Reduce motion <small>No screen shake or flicker, fewer particles, quicker moves</small></span>
        </label>
        <label className="setting toggle">
          <input type="checkbox" checked={s.largeText} data-testid="setting-large-text" onChange={e => change({ largeText: e.target.checked })} />
          <span>Large text</span>
        </label>
        <p className="keys"><strong>Keyboard:</strong> Tab moves between buttons, Enter presses one, 1–3 pick a card option, Space or Escape speeds up an animation.</p>
        <button className="primary" data-testid="close-settings" onClick={() => show(false)}>Done</button>
      </section>
    </div>
  );
}
