// Balance simulator: plays complete games through the engine with simple
// automatic strategies, for every scenario file, across many derived seeds.
//
// Usage:
//   npx tsx scripts/simulate.ts                 (all files in src/data/scenarios, 1000 seeds each)
//   npx tsx scripts/simulate.ts --seeds 200     (fewer seeds, faster)
//   npx tsx scripts/simulate.ts --dir some/dir  (scenario files from another folder)
//
// Seeds: each game uses the scenario's own seed plus 0, 1, 2, ... so the real
// flare sols stay the same while storms, sickness and expeditions vary.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buyLifeSupport, buyShielding, launchResearch, requestComms } from '../src/engine/actions';
import {
  DAILY_SHIELDING_USE,
  FLARE_SHIELDING_USE,
  LIFE_SUPPORT_NEED_BASE,
  LIFE_SUPPORT_NEED_EXPEDITION,
  RESEARCH_LAUNCH_LIFE_SUPPORT_COST,
  SOLS_TOTAL,
} from '../src/engine/constants';
import { endSol, flareForecastTonight, lifeSupportTonight, startGame } from '../src/engine/day';
import { flareSols, seedFor } from '../src/engine/flares';
import type { ActionResult, GameState, Scenario } from '../src/engine/types';

const DEFAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'scenarios');
const DEFAULT_SEEDS = 1000;
const COMMS_EVERY_SOLS = 3; // planner calls Mission Control on sols 1, 4, 7, ...

// ---------- Arguments ----------

function parseArgs(argv: readonly string[]): { dir: string; seeds: number } {
  let dir = DEFAULT_DIR;
  let seeds = DEFAULT_SEEDS;
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--dir' && value !== undefined) dir = resolve(value);
    else if (key === '--seeds' && value !== undefined && Number.isInteger(Number(value)) && Number(value) > 0) {
      seeds = Number(value);
    } else {
      console.error(`Unknown or incomplete argument "${key}". Use --dir <folder> and --seeds <number>.`);
      process.exit(1);
    }
  }
  return { dir, seeds };
}

/** Reads every *.json scenario file in a folder (the game uses import.meta.glob; Node cannot). */
function loadScenarioFiles(dir: string): Scenario[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  } catch {
    console.error(`Cannot read the folder ${dir}.`);
    process.exit(1);
  }
  return names.map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as Scenario);
}

// ---------- Strategy building blocks ----------

/** Applies an action if it is allowed; otherwise keeps the state. */
function attempt(state: GameState, result: ActionResult): GameState {
  return result.error === undefined ? result.state : state;
}

/** Buys life support up to `target` in stock, or as much as power allows. */
function lifeSupportUpTo(state: GameState, target: number): GameState {
  const units = Math.min(target - state.lifeSupport, state.power);
  return units > 0 ? attempt(state, buyLifeSupport(state, units)) : state;
}

/** Buys shielding up to `target` in stock, or as much as power allows. */
function shieldingUpTo(state: GameState, target: number): GameState {
  const units = Math.min(target - state.shielding, state.power);
  return units > 0 ? attempt(state, buyShielding(state, units)) : state;
}

/**
 * Sends one crew member out if there is power for the launch and for the
 * extra life support an explorer needs tonight (2 instead of 1).
 */
function sendOneExplorer(state: GameState): GameState {
  const extraTonight = LIFE_SUPPORT_NEED_EXPEDITION - LIFE_SUPPORT_NEED_BASE;
  const cost = RESEARCH_LAUNCH_LIFE_SUPPORT_COST + extraTonight;
  const candidate = state.crew.find((m) => m.status === 'base' && launchResearch(state, m.id).error === undefined);
  if (candidate === undefined || state.power < cost) return state;
  const stocked = attempt(state, buyLifeSupport(state, cost));
  return attempt(stocked, launchResearch(stocked, candidate.id));
}

/** Sends out everyone who can go, one launch at a time, while power allows. */
function sendEveryone(state: GameState): GameState {
  let current = state;
  for (;;) {
    const next = sendOneExplorer(current);
    if (next === current) return current;
    current = next;
  }
}

const isOutside = (state: GameState) => state.crew.some((m) => m.status === 'expedition');

/** Calls Mission Control every sol; buys tonight's life support; 17 shielding only if the forecast names tonight. */
function forecasterBasics(s: GameState): GameState {
  let next = attempt(s, requestComms(s));
  next = lifeSupportUpTo(next, lifeSupportTonight(next));
  return shieldingUpTo(next, DAILY_SHIELDING_USE + (flareForecastTonight(next) ? SPARE_SHIELDING : 0));
}

const SPARE_SHIELDING = FLARE_SHIELDING_USE;
const flareForecast = (state: GameState) => typeof state.forecast === 'object' && state.forecast !== null;

// ---------- Strategies ----------

type Strategy = (state: GameState) => GameState;

const STRATEGIES: Record<string, Strategy> = {
  // Buys only tonight's life support. Never buys any shielding.
  careless: (s) => lifeSupportUpTo(s, lifeSupportTonight(s)),

  // Tonight's needs, plus 15 spare shielding at all times. Never researches.
  careful: (s) => {
    let next = lifeSupportUpTo(s, lifeSupportTonight(s));
    next = shieldingUpTo(next, DAILY_SHIELDING_USE + SPARE_SHIELDING);
    return next;
  },

  // Like careful, and sends one crew member out whenever life support allows.
  explorer: (s) => {
    let next = lifeSupportUpTo(s, lifeSupportTonight(s));
    next = shieldingUpTo(next, DAILY_SHIELDING_USE + SPARE_SHIELDING);
    return sendOneExplorer(next);
  },

  // Like explorer, but calls Mission Control every 3 sols and only keeps the
  // 15 spare shielding while a flare is forecast.
  planner: (s) => {
    let next = (s.sol - 1) % COMMS_EVERY_SOLS === 0 ? attempt(s, requestComms(s)) : s;
    next = lifeSupportUpTo(next, lifeSupportTonight(next));
    next = shieldingUpTo(next, DAILY_SHIELDING_USE + (flareForecast(next) ? SPARE_SHIELDING : 0));
    return sendOneExplorer(next);
  },

  // Calls every sol, buys 17 shielding only when the forecast names tonight. Never explores.
  'forecast-home': (s) => forecasterBasics(s),

  // Same, and keeps at most one explorer outside.
  'forecast-one': (s) => {
    const next = forecasterBasics(s);
    return isOutside(next) ? next : sendOneExplorer(next);
  },

  // Same, and sends out everyone who can go whenever power allows.
  'forecast-all': (s) => sendEveryone(forecasterBasics(s)),
};

// ---------- Playing ----------

function play(scenario: Scenario, seed: number, strategy: Strategy): GameState {
  let state = startGame(scenario.id, seed >>> 0, flareSols(scenario));
  for (let guard = 0; state.status === 'playing' && guard <= SOLS_TOTAL; guard += 1) {
    state = endSol(strategy(state));
  }
  return state;
}

interface Totals {
  games: number;
  wins: number;
  research: number;
  crewLeft: number;
  powerLeft: number;
  scores: number[];
  /** Research for won games, 0 for lost ones (lost games earn no stars). */
  starScores: number[];
}

function addGame(t: Totals, game: GameState): void {
  t.games += 1;
  t.wins += game.status === 'won' ? 1 : 0;
  t.research += game.research;
  t.crewLeft += game.crew.filter((m) => m.status !== 'evacuated').length;
  t.powerLeft += game.power;
  t.scores.push(game.research);
  t.starScores.push(game.status === 'won' ? game.research : 0);
}

const empty = (): Totals => ({ games: 0, wins: 0, research: 0, crewLeft: 0, powerLeft: 0, scores: [], starScores: [] });

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** The value that `share` of games reach or beat (0.2 = the top fifth). */
function topShare(values: readonly number[], share: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  return sorted[Math.max(0, Math.ceil(sorted.length * share) - 1)] ?? 0;
}

const STAR_SHARE = 0.2; // the 3-star threshold should be reached in about one mission in five

// ---------- Output ----------

function row(cells: readonly string[], widths: readonly number[]): string {
  return cells.map((c, i) => (i === 0 ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0))).join('  ');
}

function printTable(title: string, rows: { label: string; t: Totals }[]): void {
  const widths = [16, 9, 13, 16, 15, 9, 10];
  console.log(`\n${title}`);
  console.log(row(['Strategy', 'Win rate', 'Avg research', 'Median research', 'Top 20% (won)', 'Avg crew', 'Avg power'], widths));
  console.log(row(widths.map((w) => '-'.repeat(w)), widths));
  for (const { label, t } of rows) {
    const n = Math.max(1, t.games);
    console.log(
      row(
        [
          label,
          `${((100 * t.wins) / n).toFixed(1)}%`,
          (t.research / n).toFixed(1),
          median(t.scores).toFixed(0),
          topShare(t.starScores, STAR_SHARE).toFixed(0),
          (t.crewLeft / n).toFixed(2),
          (t.powerLeft / n).toFixed(0),
        ],
        widths,
      ),
    );
  }
}

function main(): void {
  const { dir, seeds } = parseArgs(process.argv.slice(2));
  const scenarios = loadScenarioFiles(dir);
  if (scenarios.length === 0) {
    console.error(`No scenario files in ${dir}. Run scripts/fetch-donki.ts first.`);
    process.exit(1);
  }
  console.log(`Simulating ${scenarios.length} scenario(s) x ${Object.keys(STRATEGIES).length} strategies x ${seeds} seeds.`);

  const overall: Record<string, Totals> = {};
  for (const name of Object.keys(STRATEGIES)) overall[name] = empty();

  for (const scenario of scenarios) {
    const base = seedFor(scenario);
    const rows = Object.entries(STRATEGIES).map(([name, strategy]) => {
      const t = empty();
      for (let i = 0; i < seeds; i += 1) {
        const game = play(scenario, base + i, strategy);
        addGame(t, game);
        const all = overall[name];
        if (all !== undefined) addGame(all, game);
      }
      return { label: name, t };
    });
    printTable(
      `${scenario.name} (${scenario.id}), threshold ${scenario.threshold}, flare sols: ${flareSols(scenario).join(', ')}`,
      rows,
    );
  }

  printTable(
    'All scenarios together',
    Object.entries(overall).map(([label, t]) => ({ label, t })),
  );
}

main();
