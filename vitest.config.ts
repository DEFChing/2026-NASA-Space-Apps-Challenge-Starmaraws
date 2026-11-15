/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fixture = (f: string) => fileURLToPath(new URL(`./src/engine/__fixtures__/${f}`, import.meta.url));

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts", "scripts/**/*.test.ts"] },
  // Tests always see the empty archive, so seed-based tests keep their practice weather
  // after the real DONKI archive is committed. Weather tests pass their own archive, and
  // src/engine/weather.test.ts checks the committed files directly.
  resolve: {
    alias: [
      { find: /^\.\.\/data\/donki\.json$/, replacement: fixture("donki-empty.json") },
      { find: /^\.\.\/data\/forecast-odds\.json$/, replacement: fixture("forecast-odds-empty.json") },
      { find: /^virtual:asset-files$/, replacement: fixture("assetFiles.ts") },
    ],
  },
});
