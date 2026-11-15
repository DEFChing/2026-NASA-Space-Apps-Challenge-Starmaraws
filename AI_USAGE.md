# Use of Super Intelligence (SI) in CraterQuest

CraterQuest is Team Starmaraws' entry for the NASA Space Apps Challenge 2026
(challenge: "Build a Junior Astronaut Mission Trainer").

The NASA Space Apps Challenge allows SI tools and asks teams to show clearly where and
how they were used. This file is our summary. File-by-file details are in
[`si-manifest.json`](si-manifest.json).

## Tools used

| Tool | Maker | Used for |
| --- | --- | --- |
| Claude | Anthropic | Game design documents, code, game data (cards, levels, dialogue), documentation drafts, and some art drawn in code (the CraterQuest banner, Flight Director Amara, the landing panel, event props and overlays) |
| [Name of the image and audio tool(s)] | [Maker] | The crew characters, the outpost pictures, the story panels, the main menu background, and the music and sound effects (collected by the assets team) |

<!-- The assets team: replace the bracketed row with the real tool name(s) and maker(s). -->

## Where and how SI was used

| Part of the project | How SI was used | What the team did |
| --- | --- | --- |
| Game design (spec, tech stack, graphics and audio list, build guide) | Claude drafted documents from the team's ideas and from cited NASA and CSA sources | The team made the design decisions and reviewed every section |
| Source code (engine, run checker, UI, Phaser scenes, scripts, CI) | Claude drafted modules and tests | The team integrated, ran, tested, debugged and edited the code |
| Game data (event cards, level settings, mentor dialogue) | Claude drafted text and first-pass numbers from cited sources | The team checked every source link and tuned the numbers by playtesting |
| Fact cards and README | Claude drafted text where noted | The docs team verified each fact against its source |
| Images and audio | Most of the art and all of the audio are SI-made; every file is listed in `si-manifest.json` and `src/data/credits.json` | Each SI picture shows a visible "SI-generated" label wherever the game draws it; each SI sound carries an "SI-generated" comment tag in the file. The three finale photos are real NASA photos, not SI |

## How SI use is marked in the project

- **Source files:** a header comment beginning `SI disclosure:`.
- **Data files:** a `_meta.si` block at the top of each JSON file.
- **Project metadata:** `si-manifest.json`, the `si-disclosure` meta tag in `index.html`,
  the `siDisclosure` field in `package.json`, and an `SI-assisted:` line in related commit messages.
- **In the game:** "SI-generated" labels on SI pictures, and a "Made with help from AI" section on the credits page (`credits.html`, linked from the main menu).
- **Automatic check:** `npm run check-si` runs in CI and fails the build if anything is missing.

## Data and branding

All scientific data comes from real public sources (NASA DONKI, OSDR, RadLab, Mars Trek,
Moon Trek and the Canadian Space Agency) and is linked in the game. No SI-generated content
uses, contains or modifies NASA branding or design elements (logos, flags or mission identifiers).
