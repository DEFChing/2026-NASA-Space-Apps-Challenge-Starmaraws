/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 *
 * check-si: verifies that every SI-assisted file is disclosed the way the
 * NASA Space Apps "Use of Super Intelligence" rule requires. Runs in CI.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

type Entry = {
  path: string;
  type: "code" | "data" | "doc" | "image" | "video" | "audio";
  tool: string;
  how: string;
  humanReviewed?: boolean;
  watermarked?: boolean;
  metadataTagged?: boolean;
};

const HEADER = "SI disclosure";
const errors: string[] = [];
const read = (p: string) => readFileSync(p, "utf8");

// 1. The manifest must exist and every entry must be complete and true.
if (!existsSync("si-manifest.json")) {
  console.error("check-si: si-manifest.json is missing");
  process.exit(1);
}
const manifest: Entry[] = JSON.parse(read("si-manifest.json"));
const listed = new Set(manifest.map((m) => m.path.replace(/\\/g, "/")));

for (const m of manifest) {
  if (!m.path || !m.type || !m.tool || !m.how) {
    errors.push(`si-manifest.json: incomplete entry ${JSON.stringify(m)}`);
    continue;
  }
  if (!existsSync(m.path)) {
    errors.push(`${m.path}: listed in si-manifest.json but the file is missing`);
    continue;
  }
  if (m.type === "code" && !read(m.path).includes(HEADER))
    errors.push(`${m.path}: missing the "${HEADER}" header comment`);
  if (m.type === "data") {
    try {
      if (!JSON.parse(read(m.path))._meta?.si) errors.push(`${m.path}: missing _meta.si`);
    } catch {
      errors.push(`${m.path}: not valid JSON`);
    }
  }
  if ((m.type === "image" || m.type === "video") && m.watermarked !== true)
    errors.push(`${m.path}: SI image/video must be visibly watermarked ("watermarked": true)`);
  if (m.type === "audio" && m.metadataTagged !== true)
    errors.push(`${m.path}: SI audio must carry a metadata tag ("metadataTagged": true)`);
}

// 2. Every data file (except downloaded NASA data) must carry _meta.si.
const dataDir = "src/data";
if (existsSync(dataDir)) {
  for (const f of readdirSync(dataDir)) {
    if (!f.endsWith(".json") || f.startsWith("donki")) continue;
    const p = `${dataDir}/${f}`;
    try {
      if (!JSON.parse(read(p))._meta?.si) errors.push(`${p}: missing _meta.si`);
    } catch {
      errors.push(`${p}: not valid JSON`);
    }
  }
}

// 3. Any file that carries the SI header must also be listed in the manifest.
const walk = (dir: string): string[] =>
  !existsSync(dir)
    ? []
    : readdirSync(dir).flatMap((f) => {
        const p = join(dir, f).replace(/\\/g, "/");
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
const codeFiles = [...walk("src"), ...walk("scripts"), ...walk(".github/workflows")].filter((p) =>
  /\.(ts|tsx|js|jsx|mjs|css|yml|yaml)$/.test(p),
);
for (const p of codeFiles)
  if (read(p).includes(HEADER) && !listed.has(p))
    errors.push(`${p}: has an SI header but is not listed in si-manifest.json`);
for (const p of ["vitest.config.ts"])
  if (existsSync(p) && read(p).includes(HEADER) && !listed.has(p))
    errors.push(`${p}: has an SI header but is not listed in si-manifest.json`);

// 4. Project-level disclosure: text and metadata.
if (!existsSync("AI_USAGE.md")) errors.push("AI_USAGE.md is missing");
if (!existsSync("README.md")) errors.push("README.md is missing");
else if (!/use of si/i.test(read("README.md"))) errors.push('README.md: add a "Use of SI" section');
if (existsSync("index.html") && !read("index.html").includes('name="si-disclosure"'))
  errors.push('index.html: add <meta name="si-disclosure" ...> inside <head>');
if (existsSync("package.json") && !JSON.parse(read("package.json")).siDisclosure)
  errors.push('package.json: add a top-level "siDisclosure" field');

if (errors.length) {
  console.error(`check-si: ${errors.length} problem(s)\n- ` + errors.join("\n- "));
  process.exit(1);
}
console.log(`check-si: OK (${manifest.length} manifest entries)`);
