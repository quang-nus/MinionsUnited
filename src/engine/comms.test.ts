import { describe, expect, it } from 'vitest';
import { requestComms } from './actions';
import { COMMS_DRAWS_PER_SOL, COMMS_POWER_COST, SOLS_TOTAL } from './constants';
import { confidenceFor, coveredSols, makeForecast, reportFor } from './comms';
import { endSol, startGame } from './day';
import { ok } from './fixtures/test-helpers';
import { drawMany, fnv1a } from './rng';
import type { GameState } from './types';

/** A game with plenty of stock, set to a given sol, with the given flare sols. */
function gameOn(sol: number, flareSols: readonly number[], seed = 1): GameState {
  const base = startGame('test', seed, flareSols);
  return { ...base, sol, power: 100_000, lifeSupport: 100_000, shielding: 100_000 };
}

/** Even spread of draw values for checking every outcome of reportFor. */
const SAMPLE_VALUES = Array.from({ length: 200 }, (_, i) => (i + 0.5) / 200);
const FEW_VALUES = Array.from({ length: 20 }, (_, i) => (i + 0.5) / 20);

describe('requestComms', () => {
  it('costs 7 power and gives nothing until the morning of the next sol', () => {
    const before = gameOn(3, [6]);
    const requested = ok(requestComms(before));
    expect(COMMS_POWER_COST).toBe(7);
    expect(requested.power).toBe(before.power - 7);
    expect(requested.commsRequestedOnSol).toBe(3);
    expect(requested.forecast).toBeNull();

    const nextMorning = endSol(requested);
    expect(nextMorning.sol).toBe(4);
    expect(nextMorning.forecast).not.toBeNull();
    expect(nextMorning.commsRequestedOnSol).toBeNull();
    expect(nextMorning.log.some((e) => e.sol === 4 && e.text.startsWith('Mission Control says'))).toBe(true);
  });

  it('only once per sol', () => {
    const once = ok(requestComms(gameOn(3, [6])));
    const twice = requestComms(once);
    expect(twice.error).toBeTruthy();
    expect(twice.state).toBe(once);
  });

  it('is blocked on sol 28 with a reason', () => {
    const state = gameOn(SOLS_TOTAL, [6]);
    const result = requestComms(state);
    expect(result.error).toMatch(/last sol/);
    expect(result.state).toBe(state);
  });

  it('needs 7 power', () => {
    const state = { ...gameOn(3, [6]), power: COMMS_POWER_COST - 1 };
    const result = requestComms(state);
    expect(result.error).toBeTruthy();
    expect(result.state).toBe(state);
  });
});

describe('the forecast in the game', () => {
  it('stays until its sol has passed, and the log keeps the report', () => {
    // Request on sol 3, flare on sol 5: report arrives on the morning of sol 4.
    let state = ok(requestComms(gameOn(3, [5])));
    state = endSol(state); // sol 4: report arrives
    const forecast = state.forecast;
    if (forecast === null || forecast === 'clear') throw new Error('expected a report');
    expect(state.forecastUntil).toBe(forecast.sol);
    const reports = state.log.filter((e) => e.text.startsWith('Mission Control says')).length;

    while (state.sol < forecast.sol) {
      state = endSol(state);
      expect(state.forecast).toEqual(forecast);
    }
    expect(state.sol).toBe(forecast.sol); // still shown on the day itself

    state = endSol(state); // the day after: gone
    expect(state.forecast).toBeNull();
    expect(state.forecastUntil).toBeNull();
    expect(state.log.filter((e) => e.text.startsWith('Mission Control says')).length).toBe(reports);
  });

  it('a "clear" report stays for every sol it covers', () => {
    // Request on sol 3 covers sols 4 to 10; the only flare is on sol 20.
    let state = makeForecast({ ...gameOn(4, [20]), commsRequestedOnSol: 3 });
    expect(state.forecast).toBe('clear');
    expect(state.forecastUntil).toBe(10);
    for (let sol = 5; sol <= 10; sol += 1) {
      state = makeForecast({ ...state, sol });
      expect(state.forecast).toBe('clear');
    }
    state = makeForecast({ ...state, sol: 11 });
    expect(state.forecast).toBeNull();
  });

  it('a newer report replaces an older one', () => {
    // A clear report covering sols 4 to 10, then a new request on sol 5 about a flare on sol 6.
    let state = makeForecast({ ...gameOn(4, [20]), commsRequestedOnSol: 3 });
    expect(state.forecast).toBe('clear');
    state = makeForecast({ ...state, sol: 6, flareSols: [6, 20], commsRequestedOnSol: 5 });
    expect(state.forecast).toEqual({ sol: 6, confidence: 95 });
    expect(state.forecastUntil).toBe(6);
  });

  it('says "clear" when no flare is in range', () => {
    // Request on sol 3 covers sols 4 to 10. Flares on 3 and 11 are outside it.
    const state = endSol(ok(requestComms(gameOn(3, [3, 11]))));
    expect(state.forecast).toBe('clear');
    expect(state.log.some((e) => e.text === 'Mission Control says no flares are coming this week.')).toBe(true);
  });

  it('near the end, a clear report says no flares before the mission ends', () => {
    const state = makeForecast({ ...gameOn(26, [10]), commsRequestedOnSol: 25 });
    expect(state.forecast).toBe('clear');
    expect(state.log.at(-1)?.text).toBe('Mission Control says no flares are coming before the mission ends.');
  });

  it('uses the child-friendly wording', () => {
    const state = makeForecast({ ...gameOn(4, [6]), commsRequestedOnSol: 3 });
    // Flare on sol 6 is 3 sols after the request: 75% sure.
    expect(state.log.at(-1)?.text).toMatch(/^Mission Control says a solar flare may hit on Sol \d+\. They are 75% sure\.$/);
  });

  it('takes 2 comms draws every morning, with or without a request', () => {
    const plain = gameOn(5, [8]);
    const withRequest = { ...plain, commsRequestedOnSol: 4 };
    const expected = drawMany(plain.rng.comms, COMMS_DRAWS_PER_SOL).nextState;
    expect(makeForecast(plain).rng.comms).toBe(expected);
    expect(makeForecast(withRequest).rng.comms).toBe(expected);
  });

  it('a request older than yesterday gives no report', () => {
    const state = makeForecast({ ...gameOn(6, [8]), commsRequestedOnSol: 4 });
    expect(state.forecast).toBeNull();
    expect(state.forecastUntil).toBeNull();
    expect(state.commsRequestedOnSol).toBeNull();
  });
});

describe('reportFor', () => {
  it('covers D+1 to D+7, never past sol 28', () => {
    expect(coveredSols(3)).toEqual({ first: 4, last: 10 });
    expect(coveredSols(25)).toEqual({ first: 26, last: 28 });
    expect(coveredSols(27)).toEqual({ first: 28, last: 28 });
  });

  it('confidence is 95 for a flare one sol after the request and 35 for seven', () => {
    expect(confidenceFor(1)).toBe(95);
    expect(confidenceFor(7)).toBe(35);
    for (const v of SAMPLE_VALUES) {
      expect(reportFor([11], 10, v, v)).toEqual(expect.objectContaining({ confidence: 95 }));
      expect(reportFor([17], 10, v, v)).toEqual(expect.objectContaining({ confidence: 35 }));
    }
  });

  it('a flare one sol after the request is always reported correctly (answer 13)', () => {
    for (const right of SAMPLE_VALUES) {
      for (const wrong of [0, 0.5, 0.99]) {
        expect(reportFor([11, 13], 10, right, wrong)).toEqual({ sol: 11, confidence: 95 });
      }
    }
  });

  it('uses the nearest flare in range', () => {
    expect(reportFor([9, 14, 12], 10, 0, 0)).toEqual({ sol: 12, confidence: 85 });
  });

  it('a wrong report never names the true flare sol and never leaves the covered range', () => {
    let wrongReports = 0;
    for (let request = 1; request <= 27; request += 1) {
      const { first, last } = coveredSols(request);
      for (let flare = first; flare <= last; flare += 1) {
        for (const right of FEW_VALUES) {
          for (const wrong of FEW_VALUES) {
            const report = reportFor([flare], request, right, wrong);
            if (report === 'clear') throw new Error('expected a report');
            const distance = flare - request;
            const shouldBeWrong = distance > 1 && right >= confidenceFor(distance) / 100;
            if (shouldBeWrong) {
              expect(report.sol).not.toBe(flare);
            } else {
              expect(report.sol).toBe(flare);
            }
            expect(report.sol).toBeGreaterThanOrEqual(first);
            expect(report.sol).toBeLessThanOrEqual(last);
            expect(Math.abs(report.sol - flare)).toBeLessThanOrEqual(2);
            if (report.sol !== flare) {
              wrongReports += 1;
              expect(report.confidence).toBe(confidenceFor(flare - request));
            }
          }
        }
      }
    }
    expect(wrongReports).toBeGreaterThan(0);
  });

  it('picks the wrong sol evenly from the valid offsets', () => {
    // Flare on 15, request on 10: all four offsets (13, 14, 16, 17) are in range 11-17.
    const counts = new Map<number, number>();
    for (const wrong of SAMPLE_VALUES) {
      const report = reportFor([15], 10, 0.99, wrong);
      if (report === 'clear') throw new Error('expected a report');
      counts.set(report.sol, (counts.get(report.sol) ?? 0) + 1);
    }
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual([13, 14, 16, 17]);
    expect([...counts.values()]).toEqual([50, 50, 50, 50]);

    // Request on 26 covers 27-28; flare on 28: only 27 is a valid wrong sol.
    for (const wrong of SAMPLE_VALUES) {
      expect(reportFor([28], 26, 0.99, wrong)).toEqual({ sol: 27, confidence: 85 });
    }
  });

  it('across many seeds, reports with 75% confidence are right about 75% of the time', () => {
    let right = 0;
    const trials = 10_000;
    for (let i = 0; i < trials; i += 1) {
      // Request on sol 5, flare on sol 8: 3 sols ahead, 75% sure.
      const base = gameOn(6, [8, 20], i + 1);
      const state = makeForecast({ ...base, commsRequestedOnSol: 5, rng: { ...base.rng, comms: fnv1a(`comms-${i}`) } });
      const forecast = state.forecast;
      if (forecast === null || forecast === 'clear') throw new Error('expected a report');
      expect(forecast.confidence).toBe(75);
      if (forecast.sol === 8) right += 1;
    }
    expect(right / trials).toBeGreaterThan(0.73);
    expect(right / trials).toBeLessThan(0.77);
  });
});
