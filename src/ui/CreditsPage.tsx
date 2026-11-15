/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// credits.html: the team, the SI acknowledgement, every art and sound credit, and the
// data and information sources (the Datasets page), on a page of its own.

import { Credits } from "./Credits";
import { Datasets } from "./Datasets";

export function CreditsPage() {
  return (
    <main className="credits-page-main">
      <Credits />
      <Datasets showArt={false} />
    </main>
  );
}
