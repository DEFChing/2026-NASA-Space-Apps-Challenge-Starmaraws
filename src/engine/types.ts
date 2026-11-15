/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Shared types for the Moon outpost engine (Game Design Spec v2).
// No React or Phaser imports anywhere in src/engine.

export type Res = "power" | "warmth" | "food";
export type Tag = "crisis" | "dilemma" | "opportunity";
export type Pile = "opener" | "day" | "night";
export type Specialist = "engineer" | "botanist" | "doctor";
export type Choice = 0 | 1 | "specialist";

/** Habitat upgrades set by cards: B0 bury/sandbag, D4 cave. */
export type Flag = "buried" | "sandbagged" | "cave";

/** One change to the game. Every field is optional; combine what you need. */
export interface Effect {
  res?: Res; delta?: number;   // change a bar
  stars?: number;              // Mission Stars (can go below 0)
  badge?: number;              // Radiation Badge pips (only ever go up)
  sunlight?: number;           // change Day sunlight (Power per Day turn)...
  forTurns?: number;           // ...for N turns (missing = rest of the mission);
                               //    res/stars/badge: repeat on N turns in a row
  inTurns?: number;            // delay before it lands (0 or missing = now)
  onTurns?: "day";             // "every Day turn left": this turn and each later Day turn (step 6)
  flag?: Flag;
  grows?: boolean;             // Food that was grown (truth rule: Food only from growing...
  delivers?: boolean;          // ...or from a delivery)
}

export interface Gamble {
  chance: number;              // chance of the BAD outcome, 0..1, shown in kid words
  onFail: Effect[];
}

export interface Option {
  label: string;
  effects: Effect[];
  gamble?: Gamble;
  /** Honest "skip it" option whose only cost is the Star or Food given up. */
  forgoesReward?: boolean;
}

export interface SpecialistOption extends Option {
  who: Specialist;
}

export interface Card {
  id: string;                  // "B0", "D1".."D8", "N1".."N9"
  pile: Pile;
  tag: Tag;
  title: string;
  text: string;
  options: [Option, Option];
  specialist?: SpecialistOption; // third option, only for the picked specialist
  realBasis?: string;          // one line for the debrief
  protects?: Res[];            // used by the smarter draw (Step 3)
  mini?: "dust" | "leak";      // UI only; the engine never reads it
  sources: { label: string; url: string }[];
}

export interface LevelConfig {
  id: "moon";
  turns: number;
  starTarget: number;
  start: Record<Res, number>;
  max: Record<Res, number>;
  day:   { sunlight: number; warmth: number };
  night: { sunlight: number; warmth: number; warmthInsulated: number };
  upkeep: Effect[];            // automatic costs every turn (Food −1)
  slots: {
    heater:      { max: number; nightOnly: boolean };
    greenhouse:  { max: number; foodPerCell: number };
    experiments: { cellsPerStar: number };
    shelter:     { cells: number; cellsWithCave: number };
  };
  radiation: { limit: number; drip: number; stormOpen: number; stormSheltered: number };
  /** Which turns (0-based) each pile is dealt on. Opener and Day turns are Lunar Day. */
  piles: Record<Pile, number[]>;
}

/** Forecast odds in kid words. Real tiers come from the DONKI archive in Step 6. */
export type Odds = "low" | "medium" | "high";

/** Space weather for one turn. */
export interface WeatherTurn {
  storm: boolean;              // a solar particle storm hits this turn
  forecast: Odds;              // what the briefing said the turn before
  date?: string;               // "This storm really happened on [date]" (Step 6)
}

/** The day's plan: Power cells per slot. Locked before the card is revealed. */
export interface DailyPlan {
  heater: number;              // 0–2 cells; only counts on Night turns
  greenhouse: number;          // 0–2 cells; Food +1 each
  experiments: number;         // every 2 cells = +1 Star (none if sheltering or strained)
  shelter: boolean;            // storm turns only: takes 2 cells (0 with the cave)
}

export interface Pending { due: number; effect: Effect; cause: string; fromTurn: number }

/** A change to Day sunlight, active from..to (inclusive turns). */
export interface SunMod { delta: number; from: number; to: number; cause: string }

export type LostBy = Res | "badge" | "stars";

export interface GameState {
  turn: number; seed: number; specialist: Specialist;
  res: Record<Res, number>;
  badge: number; stars: number;
  pending: Pending[]; mods: SunMod[]; flags: Flag[];
  emergencies: Res[];          // bars at 0 that must recover next turn
  usedEmergency: Res[];        // bars that already had their one emergency
  deck: string[];              // one card id per turn
  reserve: { day: string[]; night: string[] }; // undealt cards, for the smarter draw
  rolls: number[];             // one gamble roll per turn
  status: "playing" | "won" | "lost"; lostBy?: LostBy;
}

/** Everything a turn needs that doesn't change during the run. */
export interface Ctx {
  level: LevelConfig;
  cards: Record<string, Card>;
  weather: WeatherTurn[];      // one entry per turn
}

export type StarsBlockedWhy = "shelter" | "strained";

export type GameEvent =
  | { type: "res"; res: Res; from: number; to: number; cause: string }
  | { type: "stars"; amount: number; cause: string }
  | { type: "starsBlocked"; amount: number; why: StarsBlockedWhy }
  | { type: "badge"; amount: number; cause: string }
  | { type: "sunMod"; delta: number; from: number; to: number; cause: string }
  | { type: "storm"; sheltered: boolean; pips: number; date?: string }
  | { type: "gamble"; cardId: string; failed: boolean }
  | { type: "delayed"; cause: string; fromTurn: number }
  | { type: "flag"; flag: Flag; cause: string }
  | { type: "warning" | "emergency" | "recovered"; res: Res }
  | { type: "end"; status: "won" | "lost"; lostBy?: LostBy };
