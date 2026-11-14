import { describe, expect, it } from 'vitest';
import { DAILY_SHIELDING_USE, FLARE_SHIELDING_USE } from './constants';
import { shieldingAdvice, startGame } from './day';
import type { GameState } from './types';

/** Sol 5 with the given shielding held and forecast; plenty of power. */
function game(shielding: number, forecast: GameState['forecast']): GameState {
  const base = startGame('test', 1, []);
  return { ...base, sol: 5, power: 1000, shielding, forecast, forecastUntil: null };
}

const NONE = null;
const TONIGHT = { sol: 5, confidence: 85 };
const LATER = { sol: 6, confidence: 95 };

describe('shieldingAdvice', () => {
  it('uses the daily use of 2 and the flare-night total of 17', () => {
    expect(DAILY_SHIELDING_USE).toBe(2);
    expect(DAILY_SHIELDING_USE + FLARE_SHIELDING_USE).toBe(17);
  });

  it('0 held: buying 2 is ok, buying 3 is more than tonight', () => {
    expect(shieldingAdvice(game(0, NONE), 2)).toBe('ok');
    expect(shieldingAdvice(game(0, NONE), 3)).toBe('more-than-tonight');
  });

  it('2 held: buying 1 is more than tonight', () => {
    expect(shieldingAdvice(game(2, NONE), 1)).toBe('more-than-tonight');
  });

  it('forecast names tonight: buying 17 is ok, buying 18 is more than a flare', () => {
    expect(shieldingAdvice(game(0, TONIGHT), 17)).toBe('ok');
    expect(shieldingAdvice(game(0, TONIGHT), 18)).toBe('more-than-flare');
  });

  it('no forecast: buying 17 is more than tonight, buying 18 is more than a flare', () => {
    expect(shieldingAdvice(game(0, NONE), 17)).toBe('more-than-tonight');
    expect(shieldingAdvice(game(0, NONE), 18)).toBe('more-than-flare');
  });

  it('a forecast for a later sol does not count: buying 3 is more than tonight', () => {
    expect(shieldingAdvice(game(0, LATER), 3)).toBe('more-than-tonight');
    expect(shieldingAdvice(game(0, 'clear'), 3)).toBe('more-than-tonight');
  });

  it('counts what is already held, and never changes the state', () => {
    const state = game(16, TONIGHT);
    const snapshot = structuredClone(state);
    expect(shieldingAdvice(state, 1)).toBe('ok');
    expect(shieldingAdvice(state, 2)).toBe('more-than-flare');
    expect(state).toEqual(snapshot);
  });
});
