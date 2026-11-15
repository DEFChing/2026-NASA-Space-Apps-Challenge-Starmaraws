/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Open the game with ?debugAssets=1 to see every asset key marked REAL or PLACEHOLDER,
// so the assets team can see at a glance what's still missing.

import { useState } from "react";
import files from "virtual:asset-files";
import { deliveredStatus, type Priority } from "../game/assets";

const ORDER: Priority[] = ["must", "should", "nice"];

export function AssetDebug() {
  const [open, setOpen] = useState(true);
  const s = deliveredStatus(files);
  const rows = [
    ...s.images.map(i => ({ key: `${i.asset.key}.${i.asset.ext}`, priority: i.asset.priority, state: i.real ? "REAL" : "PLACEHOLDER" })),
    ...s.audio.map(a => ({ key: `${a.asset.key} (.ogg/.mp3)`, priority: a.asset.priority,
      state: a.ogg && a.mp3 ? "REAL" : a.real ? `HALF (${a.ogg ? "no .mp3" : "no .ogg"})` : "PLACEHOLDER" })),
  ].sort((a, b) => ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority) || (a.state === "REAL" ? 1 : 0) - (b.state === "REAL" ? 1 : 0));
  const count = (p: Priority) => `${rows.filter(r => r.priority === p && r.state === "REAL").length}/${rows.filter(r => r.priority === p).length}`;
  return (
    <aside className="asset-debug" data-testid="asset-debug">
      <h2>
        Assets: Must {count("must")} · Should {count("should")} · Nice {count("nice")}{" "}
        <button onClick={() => setOpen(!open)}>{open ? "hide" : "show"}</button>
      </h2>
      {open && (
        <table><tbody>
          {rows.map(r => (
            <tr key={r.key}>
              <td>{r.key}</td><td>{r.priority}</td>
              <td className={r.state === "REAL" ? "real" : r.state.startsWith("HALF") ? "half" : "ph"}>{r.state}</td>
            </tr>
          ))}
        </tbody></table>
      )}
    </aside>
  );
}
