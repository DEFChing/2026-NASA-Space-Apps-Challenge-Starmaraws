# Demo mission codes

> SI disclosure: drafted with assistance from Claude (Anthropic), then checked by the team.
> The codes were picked by the run checker from real-data seeds. See AI_USAGE.md.

Type a code in **"Got a mission code from a friend?"** on the title screen. All three are
Rookie missions with a real solar storm, a choice that can come back later, and a close call,
so a judge sees the whole game in one short sitting. The notes follow the run checker's
winning line, with gambles failing; your own choices change the details.

| Code | Specialist | Real storm | What to show |
|---|---|---|---|
| `MOON-EG9RJXS` | Engineer | 23 January 2012, turn 4, after a "1 in 10" forecast | A moonquake on turn 2: if "Keep working" goes wrong, the damage shows up the next turn. The storm proves that unlikely things still happen; shelter and the crew are fine. |
| `MOON-D3FGWUX` | Doctor | 18 January 2026, turn 4, after a "1 in 4" forecast | Mold on turn 2: the quick fix is a gamble that can come back the next turn. In the checker's line the storm hits just as Food runs out: a real close call. |
| `MOON-BGZ43XM` | Botanist | 12 July 2012, turn 2, after a "1 in 4" forecast | The storm comes early, so the forecast and shelter are the first big lesson. The checker's line finishes on exactly 7 of 7 Stars. |

**Say this at the storm:** "This storm really happened. The game found it in NASA's DONKI
database, and the link opens the real record."

## Rules for the codes

- A code is a seed plus a specialist. Its weather comes from `src/data/donki.json`, so the
  codes only give these runs with the archive we committed (records from 1 January 2010 to
  31 October 2026). A fresh download with a later end date moves every seed's window.
- Run `npm run check-demo` after changing cards, level numbers or the archive. It fails if a
  code is no longer Rookie or has lost its storm. To pick new codes, ask for a seed scan
  (Build Guide, Step 8, Balance).
- Practice before the demo: the cards are the same every time, but gambles roll for real.
