# Use of Super Intelligence (SI) in Junior Astronaut Mission Trainer

The NASA Space Apps Challenge allows SI tools and asks teams to show clearly where and
how they were used. This file is our summary. File-by-file details are in
[`si-manifest.json`](si-manifest.json).

## Tools used

| Tool | Maker | Used for |
| --- | --- | --- |
| Claude | Anthropic | Game design documents, code, game data (cards, levels, dialogue) and documentation drafts |

<!-- Add a row for any other SI tool the team uses (for example an image or audio generator). -->

## Where and how SI was used

| Part of the project | How SI was used | What the team did |
| --- | --- | --- |
| Game design (spec, tech stack, graphics and audio list, build guide) | Claude drafted documents from the team's ideas and from cited NASA and CSA sources | The team made the design decisions and reviewed every section |
| Source code (engine, run checker, UI, Phaser scenes, scripts, CI) | Claude drafted modules and tests | The team integrated, ran, tested, debugged and edited the code |
| Game data (event cards, level settings, mentor dialogue) | Claude drafted text and first-pass numbers from cited sources | The team checked every source link and tuned the numbers by playtesting |
| Fact cards and README | Claude drafted text where noted | The docs team verified each fact against its source |
| Images, video and audio | Only where listed in `si-manifest.json` | SI images and video carry a visible "SI-generated" watermark; SI audio carries a metadata tag |

## How SI use is marked in the project

- **Source files:** a header comment beginning `SI disclosure:`.
- **Data files:** a `_meta.si` block at the top of each JSON file.
- **Project metadata:** `si-manifest.json`, the `si-disclosure` meta tag in `index.html`,
  the `siDisclosure` field in `package.json`, and an `SI-assisted:` line in related commit messages.
- **In the game:** a "Made with help from AI" section in the Credits screen.
- **Automatic check:** `npm run check-si` runs in CI and fails the build if anything is missing.

## Data and branding

All scientific data comes from real public sources (NASA DONKI, OSDR, RadLab, Mars Trek,
Moon Trek and the Canadian Space Agency) and is linked in the game. No SI-generated content
uses, contains or modifies NASA branding or design elements (logos, flags or mission identifiers).
