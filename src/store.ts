import { useEffect, useMemo, useReducer } from 'react';
import { buyLifeSupport, buyShielding, cure, launchResearch, requestComms } from './engine/actions';
import { CREW_NAME_MAX_LENGTH, SOLS_TOTAL } from './engine/constants';
import { cleanCrewNames, endSol, startGame } from './engine/day';
import { flareSols, loadScenarios, seedFor } from './engine/flares';
import type { Action, ActionResult, CrewStatus, GameState, Scenario } from './engine/types';

// ---------- State ----------

export type StoreAction =
  | Action
  | { type: 'endSol' }
  | { type: 'dismissError' }
  | { type: 'start'; scenario: Scenario; crewNames?: readonly string[] }
  | { type: 'resume'; scenario: Scenario; game: GameState }
  | { type: 'leave' };

export interface StoreState {
  scenario: Scenario | null;
  game: GameState | null;
  error: string | null;
  /** Counts games started or resumed in this session, so screens can reset per game. */
  gameNumber: number;
}

export const EMPTY_STORE: StoreState = { scenario: null, game: null, error: null, gameNumber: 0 };

/** Sends one player action to the matching engine function. */
export function applyAction(game: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'buyLifeSupport':
      return buyLifeSupport(game, action.units);
    case 'buyShielding':
      return buyShielding(game, action.units);
    case 'launchResearch':
      return launchResearch(game, action.crewId);
    case 'requestComms':
      return requestComms(game);
    case 'cure':
      return cure(game, action.crewId);
  }
}

/** A fresh game for a scenario, with sol 1's morning already run. */
export function newGame(scenario: Scenario, crewNames?: readonly string[]): GameState {
  return startGame(scenario.id, seedFor(scenario), flareSols(scenario), crewNames);
}

export function storeReducer(state: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case 'start':
      return {
        scenario: action.scenario,
        game: newGame(action.scenario, action.crewNames),
        error: null,
        gameNumber: state.gameNumber + 1,
      };
    case 'resume':
      return { scenario: action.scenario, game: action.game, error: null, gameNumber: state.gameNumber + 1 };
    case 'leave':
      return { ...EMPTY_STORE, gameNumber: state.gameNumber };
    case 'dismissError':
      return { ...state, error: null };
    case 'endSol':
      return state.game === null ? state : { ...state, game: endSol(state.game), error: null };
    default: {
      if (state.game === null) return state;
      const result = applyAction(state.game, action);
      return { ...state, game: result.state, error: result.error ?? null };
    }
  }
}

// ---------- Picking a scenario (answer 17) ----------

/**
 * Picks a scenario evenly using `random` (0 up to 1), avoiding the previous
 * one when more than one exists. Math.random is passed in by the caller.
 */
export function pickScenario(
  scenarios: readonly Scenario[],
  previousId: string | null,
  random: number,
): Scenario | undefined {
  const others = scenarios.filter((s) => s.id !== previousId);
  const pool = others.length > 0 ? others : scenarios;
  return pool[Math.min(pool.length - 1, Math.floor(random * pool.length))];
}

// ---------- Checking a saved game ----------

const STATUSES: readonly CrewStatus[] = ['base', 'sick', 'expedition', 'evacuated'];

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** A stored crew name must be a string of 1 to CREW_NAME_MAX_LENGTH characters. */
export function isValidCrewName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  const length = Array.from(name).length;
  return length >= 1 && length <= CREW_NAME_MAX_LENGTH;
}
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** True if the value has every field of a GameState with the right types. */
export function isGameState(value: unknown): value is GameState {
  if (!isObject(value)) return false;
  const v = value;
  const ints = ['sol', 'power', 'lifeSupport', 'shielding', 'research', 'stormSolsLeft', 'seed'] as const;
  if (!ints.every((k) => isInt(v[k]))) return false;
  if (!isInt(v.sol) || v.sol < 1 || v.sol > SOLS_TOTAL) return false;
  if (!Array.isArray(v.crew) || v.crew.length === 0) return false;
  const crewOk = v.crew.every(
    (m: unknown) =>
      isObject(m) &&
      isInt(m.id) &&
      isValidCrewName(m.name) &&
      STATUSES.includes(m.status as CrewStatus) &&
      isInt(m.solsOutside) &&
      isInt(m.solsSick),
  );
  if (!crewOk) return false;
  if (!Array.isArray(v.flareSols) || !v.flareSols.every(isInt)) return false;
  if (!(v.commsRequestedOnSol === null || isInt(v.commsRequestedOnSol))) return false;
  const f = v.forecast;
  const forecastOk = f === null || f === 'clear' || (isObject(f) && isInt(f.sol) && isInt(f.confidence));
  if (!forecastOk) return false;
  if (!(v.forecastUntil === null || isInt(v.forecastUntil))) return false;
  const logOk =
    Array.isArray(v.log) &&
    v.log.every((e: unknown) => isObject(e) && isInt(e.sol) && typeof e.text === 'string');
  if (!logOk) return false;
  const rng = v.rng;
  if (!isObject(rng) || !['sickness', 'storm', 'research', 'comms'].every((k) => typeof rng[k] === 'number')) {
    return false;
  }
  if (!['playing', 'won', 'lost'].includes(v.status as string)) return false;
  return typeof v.scenarioId === 'string';
}

const SAVE_VERSION = 1;

export interface SavedGame {
  scenario: Scenario;
  game: GameState;
}

export function serialiseSave(game: GameState): string {
  return JSON.stringify({ version: SAVE_VERSION, scenarioId: game.scenarioId, game });
}

/**
 * Reads a saved game. Returns null if it does not parse, is not a game in
 * progress, or belongs to a scenario that no longer exists (or has changed).
 */
export function parseSave(text: string | null, scenarios: readonly Scenario[]): SavedGame | null {
  if (text === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(data) || data.version !== SAVE_VERSION || typeof data.scenarioId !== 'string') return null;
  const game = data.game;
  if (!isGameState(game) || game.status !== 'playing' || game.scenarioId !== data.scenarioId) return null;
  const scenario = scenarios.find((s) => s.id === data.scenarioId);
  if (scenario === undefined) return null;
  // The scenario file may have been downloaded again with different flares.
  if (game.seed !== seedFor(scenario)) return null;
  const sols = flareSols(scenario);
  if (sols.length !== game.flareSols.length || sols.some((s, i) => s !== game.flareSols[i])) return null;
  return { scenario, game };
}

// ---------- Browser storage ----------

export const SAVE_KEY = 'mars-outpost.save';
export const LAST_SCENARIO_KEY = 'mars-outpost.last-scenario';
export const CREW_NAMES_KEY = 'mars-outpost.crew-names';
export const GUIDE_KEY = 'mars-outpost.guide-seen';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The saved game, if there is a good one. A bad save is cleared. */
export function readSave(scenarios: readonly Scenario[]): SavedGame | null {
  const store = storage();
  if (store === null) return null;
  try {
    const text = store.getItem(SAVE_KEY);
    const saved = parseSave(text, scenarios);
    if (saved === null && text !== null) store.removeItem(SAVE_KEY);
    return saved;
  } catch {
    return null;
  }
}

export function writeSave(game: GameState): void {
  try {
    storage()?.setItem(SAVE_KEY, serialiseSave(game));
  } catch {
    // Storage full or blocked: the game still works, it just is not saved.
  }
}

export function clearSave(): void {
  try {
    storage()?.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do.
  }
}

export function readLastScenarioId(): string | null {
  try {
    return storage()?.getItem(LAST_SCENARIO_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeLastScenarioId(id: string): void {
  try {
    storage()?.setItem(LAST_SCENARIO_KEY, id);
  } catch {
    // Nothing to do.
  }
}

/**
 * Reads remembered crew names. Anything missing or unreadable falls back to
 * the default name for that position, so this always gives a full list.
 */
export function parseCrewNames(text: string | null): string[] {
  if (text === null) return cleanCrewNames(undefined);
  try {
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) return cleanCrewNames(undefined);
    return cleanCrewNames(data.map((n) => (typeof n === 'string' ? n : '')));
  } catch {
    return cleanCrewNames(undefined);
  }
}

export function readCrewNames(): string[] {
  try {
    return parseCrewNames(storage()?.getItem(CREW_NAMES_KEY) ?? null);
  } catch {
    return cleanCrewNames(undefined);
  }
}

export function writeCrewNames(names: readonly string[]): void {
  try {
    storage()?.setItem(CREW_NAMES_KEY, JSON.stringify(cleanCrewNames(names)));
  } catch {
    // Nothing to do.
  }
}

/** True once the first-sol guide has been finished or skipped. */
export function readGuideSeen(): boolean {
  try {
    return storage()?.getItem(GUIDE_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function writeGuideSeen(): void {
  try {
    storage()?.setItem(GUIDE_KEY, 'yes');
  } catch {
    // Storage blocked: the guide may show again next time.
  }
}

// ---------- Hook ----------

export interface GameStore extends StoreState {
  buyLifeSupport: (units: number) => void;
  buyShielding: (units: number) => void;
  launchResearch: (crewId: number) => void;
  requestComms: () => void;
  cure: (crewId: number) => void;
  endSol: () => void;
  dismissError: () => void;
  start: (scenario: Scenario, crewNames?: readonly string[]) => void;
  resume: (saved: SavedGame) => void;
  leave: () => void;
}

export function useGameStore(): GameStore {
  const [state, dispatch] = useReducer(storeReducer, EMPTY_STORE);

  // Save after every action and every sol; a finished game leaves no save behind.
  useEffect(() => {
    if (state.game === null) return;
    if (state.game.status === 'playing') {
      writeSave(state.game);
    } else {
      clearSave();
    }
  }, [state.game]);

  const actions = useMemo(
    () => ({
      buyLifeSupport: (units: number) => dispatch({ type: 'buyLifeSupport', units }),
      buyShielding: (units: number) => dispatch({ type: 'buyShielding', units }),
      launchResearch: (crewId: number) => dispatch({ type: 'launchResearch', crewId }),
      requestComms: () => dispatch({ type: 'requestComms' }),
      cure: (crewId: number) => dispatch({ type: 'cure', crewId }),
      endSol: () => dispatch({ type: 'endSol' }),
      dismissError: () => dispatch({ type: 'dismissError' }),
      start: (scenario: Scenario, crewNames?: readonly string[]) => {
        writeLastScenarioId(scenario.id);
        if (crewNames !== undefined) writeCrewNames(crewNames);
        dispatch({ type: 'start', scenario, crewNames });
      },
      resume: (saved: SavedGame) => {
        writeLastScenarioId(saved.scenario.id);
        dispatch({ type: 'resume', scenario: saved.scenario, game: saved.game });
      },
      leave: () => dispatch({ type: 'leave' }),
    }),
    [],
  );

  return { ...state, ...actions };
}

/** Every real scenario file, loaded once. */
export function allScenarios(): Scenario[] {
  return loadScenarios();
}
