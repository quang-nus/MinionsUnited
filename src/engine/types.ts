export type CrewStatus = 'base' | 'sick' | 'expedition' | 'evacuated';

export interface CrewMember {
  id: number;
  name: string;
  status: CrewStatus;
  solsOutside: number;
  solsSick: number;
}

/** What kind of event a log entry records, so screens can sort and summarise the log. */
export type LogTag =
  | 'routine'
  | 'storm'
  | 'flare'
  | 'shielding-low'
  | 'shielding-worn'
  | 'sick'
  | 'recovered'
  | 'cure'
  | 'research'
  | 'forecast'
  | 'evacuated-life-support'
  | 'evacuated-flare'
  | 'end';

export interface LogEntry {
  sol: number;
  text: string;
  tag?: LogTag;
}

export type Forecast = { sol: number; confidence: number } | 'clear' | null;

export type StreamName = 'sickness' | 'storm' | 'research' | 'comms';

/** Current state of each random stream. */
export type RngStreams = Record<StreamName, number>;

export type GameStatus = 'playing' | 'won' | 'lost';

export interface GameState {
  sol: number;
  power: number;
  lifeSupport: number;
  shielding: number;
  research: number;
  crew: CrewMember[];
  flareSols: number[];
  stormSolsLeft: number;
  commsRequestedOnSol: number | null;
  forecast: Forecast;
  /** Last sol the current forecast speaks about; it is shown until this sol has passed. */
  forecastUntil: number | null;
  log: LogEntry[];
  seed: number;
  rng: RngStreams;
  status: GameStatus;
  scenarioId: string;
}

export type Action =
  | { type: 'buyLifeSupport'; units: number }
  | { type: 'buyShielding'; units: number }
  | { type: 'launchResearch'; crewId: number }
  | { type: 'requestComms' }
  | { type: 'cure'; crewId: number };

export interface ActionResult {
  state: GameState;
  error?: string;
}

export type FlareThreshold = 'X' | 'M5' | 'M1';

/** One flare record, exactly as NASA DONKI returned it. Fields may be missing. */
export interface FlareRecord {
  flrID: string;
  peakTime?: string | null;
  classType?: string | null;
}

export interface Scenario {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // startDate + 27 days
  threshold: FlareThreshold;
  fetchedAt: string;
  flares: FlareRecord[];
}
