// SI disclosure: written with assistance from Claude (Anthropic), a large language
// model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
//
// Vite plugin: tells the game which art and audio files have been delivered, through
// `import files from "virtual:asset-files"`. The game loads only those and draws
// placeholders for the rest, so missing files never cause 404 errors. In dev, adding
// or removing a file in public/art or public/audio reloads the page.

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ID = "virtual:asset-files";
const RESOLVED = "\0" + ID;

export function assetFiles() {
  const dirs = { art: resolve("public/art"), audio: resolve("public/audio") };
  const list = dir => (existsSync(dir) ? readdirSync(dir).filter(f => !f.startsWith(".")).sort() : []);
  return {
    name: "asset-files",
    resolveId: id => (id === ID ? RESOLVED : undefined),
    load: id => (id === RESOLVED
      ? `export default ${JSON.stringify({ art: list(dirs.art), audio: list(dirs.audio) })};`
      : undefined),
    configureServer(server) {
      server.watcher.add(Object.values(dirs));
      const refresh = file => {
        if (!/public[\\/](art|audio)[\\/]/.test(file)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", refresh);
      server.watcher.on("unlink", refresh);
    },
  };
}
