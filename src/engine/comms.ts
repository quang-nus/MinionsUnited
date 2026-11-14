import {
  COMMS_ALWAYS_CORRECT_DISTANCE,
  COMMS_CONFIDENCE_BASE_PERCENT,
  COMMS_CONFIDENCE_PER_SOL_PERCENT,
  COMMS_DRAWS_PER_SOL,
  COMMS_FORECAST_SOLS,
  COMMS_POWER_COST,
  COMMS_WRONG_SOL_OFFSETS,
  SOLS_TOTAL,
} from './constants';
import { chance, drawMany, pickIndex } from './rng';
import type { ActionResult, Forecast, GameState, LogEntry } from './types';

function addLog(log: readonly LogEntry[], sol: number, text: string): LogEntry[] {
  return [...log, { sol, text, tag: 'forecast' }];
}

/** The sols a request on sol D covers: D+1 to D+7, never past the last sol. */
export function coveredSols(requestSol: number): { first: number; last: number } {
  return { first: requestSol + 1, last: Math.min(requestSol + COMMS_FORECAST_SOLS, SOLS_TOTAL) };
}

/** Confidence for a flare d sols after the request: 105 - 10 x d. */
export function confidenceFor(distance: number): number {
  return COMMS_CONFIDENCE_BASE_PERCENT - COMMS_CONFIDENCE_PER_SOL_PERCENT * distance;
}

/**
 * The report for a request made on `requestSol`, using two draws:
 * `rightValue` decides right or wrong, `wrongValue` picks the wrong sol.
 *
 * - No flare sol in the covered range: "clear".
 * - Otherwise F = the nearest flare sol, d = F - requestSol, confidence = 105 - 10d.
 * - If d is 1, or the right-or-wrong roll succeeds, or no valid wrong sol exists: report F.
 * - Otherwise report F plus an offset from -2, -1, +1, +2 that stays in the covered range,
 *   picked evenly. The confidence shown is the same either way.
 */
export function reportFor(
  flareSols: readonly number[],
  requestSol: number,
  rightValue: number,
  wrongValue: number,
): Exclude<Forecast, null> {
  const { first, last } = coveredSols(requestSol);
  const flare = [...flareSols].sort((a, b) => a - b).find((s) => s >= first && s <= last);
  if (flare === undefined) {
    return 'clear';
  }
  const distance = flare - requestSol;
  const confidence = confidenceFor(distance);

  if (distance === COMMS_ALWAYS_CORRECT_DISTANCE || chance(rightValue, confidence)) {
    return { sol: flare, confidence };
  }
  const wrongSols = COMMS_WRONG_SOL_OFFSETS.map((offset) => flare + offset).filter(
    (s) => s !== flare && s >= first && s <= last,
  );
  const wrong = wrongSols[pickIndex(wrongValue, wrongSols.length)];
  return { sol: wrong ?? flare, confidence };
}

// ---------- Player action ----------

export function requestComms(state: GameState): ActionResult {
  if (state.status !== 'playing') {
    return { state, error: 'The mission is over.' };
  }
  if (state.sol >= SOLS_TOTAL) {
    return {
      state,
      error: 'This is the last sol. A report could not come in time.',
    };
  }
  if (state.commsRequestedOnSol === state.sol) {
    return { state, error: 'You already called today. The answer comes tomorrow morning.' };
  }
  if (state.power < COMMS_POWER_COST) {
    return {
      state,
      error: `Calling Mission Control needs ${COMMS_POWER_COST} power, but you only have ${state.power}.`,
    };
  }
  return {
    state: {
      ...state,
      power: state.power - COMMS_POWER_COST,
      commsRequestedOnSol: state.sol,
      log: addLog(
        state.log,
        state.sol,
        'You called Mission Control. Their flare report comes tomorrow morning.',
      ),
    },
  };
}

// ---------- Start of sol, step 1 ----------

/**
 * Start of sol, step 1. Runs every morning so the comms stream always takes
 * its COMMS_DRAWS_PER_SOL draws.
 *
 * If a request was made on the previous sol, the report arrives now and
 * replaces any older one. Otherwise the current forecast stays until the sol
 * it speaks about has passed: a flare report until its sol, a "clear" report
 * until the last sol it covers.
 */
export function makeForecast(state: GameState): GameState {
  const { values, nextState } = drawMany(state.rng.comms, COMMS_DRAWS_PER_SOL);
  const rng = { ...state.rng, comms: nextState };
  const requestSol = state.commsRequestedOnSol;

  if (requestSol === null || requestSol !== state.sol - 1) {
    const stillValid = state.forecastUntil !== null && state.sol <= state.forecastUntil;
    return {
      ...state,
      rng,
      forecast: stillValid ? state.forecast : null,
      forecastUntil: stillValid ? state.forecastUntil : null,
      commsRequestedOnSol: null,
    };
  }

  const forecast = reportFor(state.flareSols, requestSol, values[0] ?? 1, values[1] ?? 0);
  const { last } = coveredSols(requestSol);
  const text =
    forecast === 'clear'
      ? last === requestSol + COMMS_FORECAST_SOLS
        ? 'Mission Control says no flares are coming this week.'
        : 'Mission Control says no flares are coming before the mission ends.'
      : `Mission Control says a solar flare may hit on Sol ${forecast.sol}. They are ${forecast.confidence}% sure.`;

  return {
    ...state,
    rng,
    forecast,
    forecastUntil: forecast === 'clear' ? last : forecast.sol,
    commsRequestedOnSol: null,
    log: addLog(state.log, state.sol, text),
  };
}
