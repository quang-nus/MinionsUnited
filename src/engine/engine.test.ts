import { describe, expect, it } from 'vitest';
import { buyLifeSupport, buyShielding } from './actions';
import { CREW_SIZE, INCOME_BASE, SOLS_TOTAL, START_POWER } from './constants';
import { createInitialState, endSol, startGame, startSol } from './day';
import { lifeSupportNeed } from './fixtures/test-helpers';
import { deriveStreams, drawMany, fnv1a, mulberry32 } from './rng';
import type { ActionResult, GameState } from './types';

const SEED = 12345;
const FLARES = [5, 12];
const NO_FLARES: number[] = [];

function ok(result: ActionResult): GameState {
  expect(result.error).toBeUndefined();
  return result.state;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

describe('starting a game', () => {
  it('starts on sol 1 with 100 power, then the first morning adds 4 power per crew member', () => {
    const before = createInitialState('test', SEED, FLARES);
    expect(before.sol).toBe(1);
    expect(before.power).toBe(START_POWER);
    expect(before.crew).toHaveLength(CREW_SIZE);
    expect(before.crew.every((m) => m.status === 'base')).toBe(true);

    const after = startSol(before);
    expect(INCOME_BASE).toBe(4);
    expect(after.power).toBe(START_POWER + CREW_SIZE * INCOME_BASE);
  });
});

describe('a full game', () => {
  it('with no flares, buying the life support the crew needs and 2 shielding every sol wins with 4 crew', () => {
    for (const seed of [SEED, 1, 2, 3, 4, 5]) {
      let state = startGame('test', seed, NO_FLARES);
      let sols = 0;
      while (state.status === 'playing') {
        state = ok(buyLifeSupport(state, lifeSupportNeed(state)));
        state = ok(buyShielding(state, 2));
        state = endSol(state);
        sols += 1;
      }
      expect(state.status).toBe('won');
      expect(state.sol).toBe(SOLS_TOTAL);
      expect(sols).toBe(SOLS_TOTAL);
      expect(state.crew.some((m) => m.status === 'evacuated')).toBe(false);
    }
  });

  it('buying nothing is lost on sol 1 with every crew member evacuated', () => {
    const state = endSol(startGame('test', SEED, FLARES));
    expect(state.status).toBe('lost');
    expect(state.sol).toBe(1);
    expect(state.crew.every((m) => m.status === 'evacuated')).toBe(true);
  });
});

describe('life support', () => {
  it('with 3 in stock, only the highest id is evacuated', () => {
    let state = startGame('test', SEED, FLARES);
    state = ok(buyLifeSupport(state, 3));
    state = ok(buyShielding(state, 2));
    state = endSol(state);

    const evacuated = state.crew.filter((m) => m.status === 'evacuated');
    expect(evacuated.map((m) => m.id)).toEqual([4]);
    expect(state.crew.filter((m) => m.status === 'base').map((m) => m.id)).toEqual([1, 2, 3]);
    expect(state.status).toBe('playing');
    expect(state.sol).toBe(2);
  });
});

describe('actions', () => {
  it('buying more than the player can afford changes nothing and returns an error', () => {
    const state = startGame('test', SEED, FLARES);
    const snapshot = structuredClone(state);

    const lifeSupport = buyLifeSupport(state, state.power + 1);
    expect(lifeSupport.error).toBeTruthy();
    expect(lifeSupport.state).toBe(state);
    expect(lifeSupport.state).toEqual(snapshot);

    const shielding = buyShielding(state, state.power + 1);
    expect(shielding.error).toBeTruthy();
    expect(shielding.state).toEqual(snapshot);
  });

  it('refuses amounts that are not whole numbers of 1 or more', () => {
    const state = startGame('test', SEED, FLARES);
    for (const units of [0, -3, 1.5, Number.NaN]) {
      const result = buyLifeSupport(state, units);
      expect(result.error).toBeTruthy();
      expect(result.state).toBe(state);
    }
  });
});

describe('purity', () => {
  it('never changes the state it is given', () => {
    const state = deepFreeze(startGame('test', SEED, FLARES));
    const snapshot = structuredClone(state);
    const bought = ok(buyShielding(ok(buyLifeSupport(state, 4)), 2));
    endSol(bought);
    endSol(state);
    expect(state).toEqual(snapshot);
  });
});

describe('random numbers', () => {
  it('the same seed gives the same sequence', () => {
    const a = deriveStreams(SEED);
    const b = deriveStreams(SEED);
    expect(a).toEqual(b);
    expect(drawMany(a.sickness, 50)).toEqual(drawMany(b.sickness, 50));
    expect(drawMany(a.storm, 50)).toEqual(drawMany(b.storm, 50));
  });

  it('different seeds and different streams give different sequences', () => {
    const a = deriveStreams(SEED);
    const b = deriveStreams(SEED + 1);
    expect(drawMany(a.sickness, 10).values).not.toEqual(drawMany(b.sickness, 10).values);
    expect(new Set(Object.values(a)).size).toBe(4);
  });

  it('draws are between 0 and 1 and mulberry32 is pure', () => {
    expect(mulberry32(7)).toEqual(mulberry32(7));
    for (const value of drawMany(1, 1000).values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('fnv1a matches the published test values', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });
});

describe('what tonight will use', () => {
  it('counts 1 for healthy, 2 for sick, 2 for outside and 0 for evacuated', async () => {
    const { lifeSupportTonight, shieldingTonight } = await import('./day');
    const base = startGame('test', SEED, NO_FLARES);
    const state = {
      ...base,
      crew: base.crew.map((m, i) => ({
        ...m,
        status: (['base', 'sick', 'expedition', 'evacuated'] as const)[i] ?? 'base',
      })),
    };
    expect(lifeSupportTonight(state)).toBe(1 + 2 + 2 + 0);
    expect(shieldingTonight()).toBe(2);
  });

  it('the life support rule used at night matches lifeSupportTonight', async () => {
    const { lifeSupportTonight } = await import('./day');
    for (const seed of [1, 2, 3, 4, 5]) {
      let state = startGame('test', seed, NO_FLARES);
      while (state.status === 'playing') {
        const need = lifeSupportTonight(state);
        state = ok(buyLifeSupport(state, Math.max(1, need)));
        state = ok(buyShielding(state, 2));
        const before = state;
        state = endSol(state);
        expect(state.crew.some((m) => m.status === 'evacuated')).toBe(false);
        expect(before.lifeSupport - need).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
