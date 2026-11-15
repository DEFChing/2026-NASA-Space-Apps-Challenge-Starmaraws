/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Test-only Moon cards, copied in short form from the Game Design Spec v2: the opener,
// 4 Day cards and 4 Night cards, chosen so the tests cover every kind of effect
// (delayed, repeating, sunlight changes, gambles, flags, specialist options). The full
// 18-card src/data/cards.json arrives in Step 2.

import type { Card } from "./types";

const LRO = { label: "NASA LRO", url: "https://science.nasa.gov/wp-content/uploads/2024/01/lrolitho7temperaturevariation27may2014.pdf" };

export const moonTestCards: Card[] = [
  {
    id: "B0", pile: "opener", tag: "opportunity",
    title: "Building the base",
    text: "The rover's blade can pile moon dirt (regolith) over the habitat.",
    options: [
      { label: "Bury the whole habitat",
        effects: [{ res: "power", delta: -3 }, { badge: 1 }, { flag: "buried" }] },
      { label: "Sandbag only the sleeping area",
        effects: [{ res: "power", delta: -1 }, { flag: "sandbagged" }] },
    ],
    realBasis: "NASA studies estimate 3–5 m of regolith shields a habitat.",
    sources: [{ label: "NASA NTRS", url: "https://ntrs.nasa.gov/citations/19930019927" }],
  },
  {
    id: "D2", pile: "day", tag: "crisis",
    title: "Dust on the radiators",
    text: "Dark moon dust is soaking up sunlight on the cooling panels.",
    options: [
      { label: "Brush them off during a moonwalk", effects: [{ badge: 1 }, { stars: -1 }] },
      { label: "Leave them", effects: [{ res: "power", delta: -1, repeat: "dayTurns" }] },
    ],
    specialist: { who: "engineer", label: "Switch on the electrodynamic dust shield",
      effects: [{ res: "power", delta: -2 }] },
    protects: ["power"], mini: "dust",
    realBasis: "On Apollo 16 and 17, dust on the rover's radiators overheated its batteries.",
    sources: [{ label: "NASA NTRS", url: "https://ntrs.nasa.gov/api/citations/20100027339/downloads/20100027339.pdf" }],
  },
  {
    id: "D3", pile: "day", tag: "dilemma",
    title: "Before sunset",
    text: "Night is coming. Spend sunlight on science, or save it?",
    options: [
      { label: "Run the seismometer survey", effects: [{ stars: 1 }, { res: "power", delta: -2 }] },
      { label: "Keep that power for the night", effects: [] },
    ],
    specialist: { who: "botanist", label: "Run the grow lights on spare sunlight",
      effects: [{ res: "power", delta: -2 }, { res: "food", delta: 2, inTurns: 1 }] },
    protects: ["food"],
    realBasis: "A lunar night lasts about 14 Earth days, which limits solar power on the Moon.",
    sources: [{ label: "BBC Sky at Night", url: "https://www.skyatnightmagazine.com/news/nasa-nuclear-reactor-moon" }],
  },
  {
    id: "D4", pile: "day", tag: "opportunity",
    title: "Scout the lava-tube pit",
    text: "A deep pit nearby may lead to a natural cave shelter.",
    options: [
      { label: "Rappel to the edge for a close survey",
        effects: [{ stars: 2 }, { badge: 1 }, { res: "food", delta: -1 }, { flag: "cave" }] },
      { label: "Send the rover's camera instead", effects: [{ stars: 1 }, { res: "power", delta: -1 }] },
    ],
    realBasis: "Radar data suggests a pit in the Sea of Tranquility leads to a cave tens of metres long.",
    sources: [{ label: "Nature Astronomy, 2024", url: "https://ui.adsabs.harvard.edu/abs/2024NatAs...8.1119C" }],
  },
  {
    id: "D8", pile: "day", tag: "crisis",
    title: "Micrometeoroid strike",
    text: "Debris from a nearby impact pitted a solar panel.",
    options: [
      { label: "Swap the damaged panel outside", effects: [{ badge: 1 }, { res: "power", delta: -1 }] },
      { label: "Live with it", effects: [{ sunlight: -1 }] },
    ],
    specialist: { who: "engineer", label: "Reroute the wiring from inside",
      effects: [{ res: "power", delta: -2 }] },
    protects: ["power"],
    realBasis: "LRO found new craters forming faster than models predicted.",
    sources: [{ label: "NASA", url: "https://www.nasa.gov/press-release/goddard/2016/lro-lunar-cratering" }],
  },
  {
    id: "N1", pile: "night", tag: "crisis",
    title: "Deep freeze",
    text: "Outside it's −130 °C and the habitat walls are losing heat.",
    options: [
      { label: "Heaters on high", effects: [{ res: "power", delta: -2 }] },
      { label: "Heat only the sleeping module and bundle up", effects: [{ res: "warmth", delta: -1 }] },
    ],
    specialist: { who: "doctor", label: "Take turns in the warm module with cold-stress checks",
      effects: [{ stars: -1 }] },
    protects: ["warmth"],
    realBasis: "Nights near the lunar equator fall to −130 °C.",
    sources: [LRO],
  },
  {
    id: "N3", pile: "night", tag: "crisis",
    title: "Moonquake",
    text: "The ground shakes for over 10 minutes.",
    options: [
      { label: "Inspect and reseal every joint", effects: [{ res: "power", delta: -1 }, { stars: -1 }] },
      { label: "Keep working", effects: [],
        gamble: { chance: 1 / 3, onFail: [{ res: "warmth", delta: -1, forTurns: 2 }] } },
    ],
    specialist: { who: "engineer", label: "Pressure-test the seals from the control panel",
      effects: [{ res: "power", delta: -1 }] },
    mini: "leak",
    realBasis: "Apollo seismometers recorded shallow moonquakes that shook for more than 10 minutes.",
    sources: [{ label: "NASA", url: "https://science.nasa.gov/moon/moonquakes" }],
  },
  {
    id: "N5", pile: "night", tag: "opportunity",
    title: "Call with students on Earth",
    text: "Earth hangs in your night sky, so the radio link is easy.",
    options: [
      { label: "Live video call", effects: [{ stars: 2 }, { res: "power", delta: -2 }] },
      { label: "Send a recording now, live Q&A at sunrise",
        effects: [{ stars: 1 }, { stars: 1, inTurns: 1 }, { res: "power", delta: -1, inTurns: 1 }] },
    ],
    realBasis: "A message from the Moon to Earth takes only seconds.",
    sources: [{ label: "NASA NTRS", url: "https://ntrs.nasa.gov/citations/20250000703" }],
  },
  {
    id: "N7", pile: "night", tag: "crisis",
    title: "Mold in the greenhouse",
    text: "Damp leaves have started to grow mold.",
    options: [
      { label: "Pull out the sick plants", effects: [{ res: "food", delta: -2 }] },
      { label: "Dry them out with the fans on high", effects: [{ res: "power", delta: -1 }],
        gamble: { chance: 1 / 3, onFail: [{ res: "food", delta: -2, inTurns: 1 }] } },
    ],
    specialist: { who: "botanist", label: "Cut away the dead leaves, wipe and dry the plants",
      effects: [{ stars: -1 }] },
    protects: ["food"],
    realBasis: "Mold grew on the ISS zinnias in 2015; Scott Kelly cleaned and dried them and saved two.",
    sources: [{ label: "Space.com", url: "https://www.space.com/31556-space-fungus-attacks-space-station-plants.html" }],
  },
];
