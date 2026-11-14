import { describe, expect, it } from 'vitest';
import { buyLifeSupport, buyShielding, cure, launchResearch } from './actions';
import {
  CURE_LIFE_SUPPORT_COST,
  INCOME_BASE,
  INCOME_SICK,
  MAX_SICK_FROM_ROLLS,
  STORM_INCOME_PENALTY,
  STORM_LENGTH_SOLS,
} from './constants';
import { endSol, startGame, startSol } from './day';
import { recoverSick, rollDustStorm, rollNewSickness } from './events';
import { TEST_ONLY_SCENARIO } from './fixtures/test-scenario';
import {
  countStatus,
  crewMember,
  lifeSupportNeed,
  ok,
  quiet,
  statuses,
  withCrew,
} from './fixtures/test-helpers';
import { flareSols } from './flares';
import { drawMany, fnv1a, mulberry32 } from './rng';
import type { GameState } from './types';

const NO_FLARES: number[] = [];

function richGame(seed = 1, flares: readonly number[] = NO_FLARES): GameState {
  return { ...startGame('test', seed, flares), power: 100_000, lifeSupport: 100_000, shielding: 100_000 };
}

/** First stream state (searching fnv1a(label-i)) whose draws pass the test. */
function findStream(label: string, count: number, test: (values: number[]) => boolean): number {
  for (let i = 0; ; i += 1) {
    const candidate = fnv1a(`${label}-${i}`);
    if (test(drawMany(candidate, count).values)) return candidate;
  }
}

/**
 * Plays one game with choices driven by a separate test-only generator,
 * so the games cover many situations: trips, cures, skimped shielding.
 * Calls `check(before, after)` after every sol.
 */
function playVariedGame(
  seed: number,
  flares: readonly number[],
  check: (before: GameState, after: GameState) => void,
): GameState {
  let choice = seed * 7919;
  const next = () => {
    const draw = mulberry32(choice);
    choice = draw.nextState;
    return draw.value;
  };
  const tryAction = (state: GameState, result: { state: GameState; error?: string }) =>
    result.error ? state : result.state;

  let state = startGame('sim', seed, flares);
  while (state.status === 'playing') {
    for (const member of state.crew) {
      if (member.status === 'base' && next() < 0.25) {
        state = tryAction(state, buyLifeSupport(state, 2));
        state = tryAction(state, launchResearch(state, member.id));
      }
      if (member.status === 'sick' && next() < 0.3) {
        state = tryAction(state, buyLifeSupport(state, CURE_LIFE_SUPPORT_COST));
        state = tryAction(state, cure(state, member.id));
      }
    }
    const need = lifeSupportNeed(state) - state.lifeSupport;
    if (need > 0) state = tryAction(state, buyLifeSupport(state, need));
    const flareToday = state.flareSols.includes(state.sol);
    const shielding = flareToday && next() < 0.7 ? 17 : next() < 0.5 ? 2 : 0;
    const shieldingToBuy = shielding - state.shielding;
    if (shieldingToBuy > 0) state = tryAction(state, buyShielding(state, shieldingToBuy));

    const before = state;
    state = endSol(state);
    check(before, state);
  }
  return state;
}

describe('the cap of 2 sick', () => {
  it('never more than 2 sick at once across 1,000 simulated games (no flares)', () => {
    let sawTwo = false;
    for (let seed = 1; seed <= 1000; seed += 1) {
      playVariedGame(seed, NO_FLARES, (_before, after) => {
        const sick = countStatus(after, 'sick');
        expect(sick).toBeLessThanOrEqual(MAX_SICK_FROM_ROLLS);
        if (sick === MAX_SICK_FROM_ROLLS) sawTwo = true;
      });
    }
    expect(sawTwo).toBe(true);
  });

  it('with flares, only a flare can push the sick count above 2 (answer 3)', () => {
    const flares = flareSols(TEST_ONLY_SCENARIO);
    let sawAboveTwo = false;
    for (let seed = 1; seed <= 1000; seed += 1) {
      playVariedGame(seed, flares, (before, after) => {
        const sickBefore = countStatus(before, 'sick');
        const sickAfter = countStatus(after, 'sick');
        if (sickAfter > MAX_SICK_FROM_ROLLS) {
          sawAboveTwo = true;
          const flareSol = before.flareSols.includes(before.sol);
          expect(flareSol || sickAfter <= sickBefore).toBe(true);
        }
      });
    }
    expect(sawAboveTwo).toBe(true);
  });
});

describe('recovery', () => {
  it('a crew member sick for 5 mornings has always recovered', () => {
    for (let i = 0; i < 2000; i += 1) {
      let state = withCrew(richGame(), { 2: { status: 'sick', solsSick: 0 } });
      state = { ...state, rng: { ...state.rng, sickness: fnv1a(`five-mornings-${i}`) } };
      for (let morning = 1; morning <= 5; morning += 1) {
        state = recoverSick(state);
      }
      expect(crewMember(state, 2).status).toBe('base');
      expect(crewMember(state, 2).solsSick).toBe(0);
    }
  });

  it('about 60% recover on the first morning and 100% on the fifth', () => {
    let first = 0;
    const trials = 10_000;
    for (let i = 0; i < trials; i += 1) {
      const base = richGame();
      const state = withCrew(
        { ...base, rng: { ...base.rng, sickness: fnv1a(`first-morning-${i}`) } },
        { 3: { status: 'sick', solsSick: 0 } },
      );
      if (crewMember(recoverSick(state), 3).status === 'base') first += 1;

      const fifth = withCrew(state, { 3: { status: 'sick', solsSick: 4 } });
      expect(crewMember(recoverSick(fifth), 3).status).toBe('base');
    }
    expect(first / trials).toBeGreaterThan(0.58);
    expect(first / trials).toBeLessThan(0.62);
  });

  it('counts the sols sick when someone does not recover', () => {
    const stream = findStream('stay-sick', 4, (v) => (v[1] ?? 0) >= 0.6);
    const base = richGame();
    const state = withCrew({ ...base, rng: { ...base.rng, sickness: stream } }, { 2: { status: 'sick', solsSick: 0 } });
    const after = recoverSick(state);
    expect(crewMember(after, 2).status).toBe('sick');
    expect(crewMember(after, 2).solsSick).toBe(1);
  });

  it('always takes 4 sickness draws', () => {
    const state = richGame();
    expect(recoverSick(state).rng.sickness).toBe(drawMany(state.rng.sickness, 4).nextState);
  });
});

describe('new sickness', () => {
  it('skips crew who returned this sol and respects the cap roll by roll', () => {
    // Draws for crew 1, 2 and 3 all succeed at 5%.
    const stream = findStream('all-sick', 4, (v) => v.slice(0, 3).every((x) => x < 0.05));
    const base = richGame();
    const state = { ...base, rng: { ...base.rng, sickness: stream } };
    const after = rollNewSickness(state, [2]);
    // Crew 2 returned, so it does not roll. Crews 1 and 3 get sick; then the cap stops crew 4.
    expect(statuses(after)).toEqual(['sick', 'base', 'sick', 'base']);
  });

  it('only rolls for healthy crew at the base', () => {
    const stream = findStream('all-sick-4', 4, (v) => v.every((x) => x < 0.05));
    const base = richGame();
    const state = withCrew(
      { ...base, rng: { ...base.rng, sickness: stream } },
      { 1: { status: 'expedition' }, 2: { status: 'evacuated' } },
    );
    const after = rollNewSickness(state, []);
    expect(statuses(after)).toEqual(['expedition', 'evacuated', 'sick', 'sick']);
  });
});

describe('cure', () => {
  it('fails with 4 life support and works with 5', () => {
    const state = withCrew({ ...richGame(), lifeSupport: CURE_LIFE_SUPPORT_COST - 1 }, { 2: { status: 'sick', solsSick: 2 } });
    const refused = cure(state, 2);
    expect(refused.error).toBeTruthy();
    expect(refused.state).toBe(state);

    const enough = { ...state, lifeSupport: CURE_LIFE_SUPPORT_COST };
    const cured = ok(cure(enough, 2));
    expect(cured.lifeSupport).toBe(0);
    expect(crewMember(cured, 2).status).toBe('base');
    expect(crewMember(cured, 2).solsSick).toBe(0);
  });

  it('only works on sick crew', () => {
    const state = withCrew(richGame(), { 3: { status: 'expedition' }, 4: { status: 'evacuated' } });
    for (const id of [1, 3, 4, 99]) {
      const result = cure(state, id);
      expect(result.error).toBeTruthy();
      expect(result.state).toBe(state);
    }
  });
});

describe('sick crew', () => {
  it('produce 4 power and need 2 life support', () => {
    // No storm this morning, and neither sick crew member recovers.
    const storm = findStream('no-storm', 1, (v) => (v[0] ?? 0) >= 0.06);
    const sickness = findStream('no-recovery', 4, (v) => v.slice(0, 2).every((x) => x >= 0.6));
    const base = startGame('test', 1, NO_FLARES);
    const state = withCrew(
      { ...base, stormSolsLeft: 0, rng: { ...base.rng, storm, sickness } },
      { 1: { status: 'sick' }, 2: { status: 'sick' } },
    );
    const morning = startSol(state);
    expect(statuses(morning)).toEqual(['sick', 'sick', 'base', 'base']);
    expect(morning.power - state.power).toBe(2 * INCOME_SICK + 2 * INCOME_BASE);

    // 2 healthy need 1 each, 2 sick need 2 each: 6. With 5, the second sick crew member is evacuated.
    const short = endSol({ ...quiet(state), lifeSupport: 5, shielding: 2 });
    expect(statuses(short)).toEqual(['sick', 'evacuated', 'base', 'base']);
  });
});

describe('dust storms', () => {
  it('lower income by exactly 1 per producing crew member for exactly 3 sols', () => {
    // Storm starts on the first morning; no new storm on the fourth.
    const stream = findStream('storm', 4, (v) => (v[0] ?? 1) < 0.06 && (v[3] ?? 0) >= 0.06);
    const base = richGame();
    let state = withCrew(
      { ...base, rng: { ...base.rng, storm: stream }, stormSolsLeft: 0 },
      { 2: { status: 'sick', solsSick: 0 }, 3: { status: 'expedition' }, 4: { status: 'evacuated' } },
    );

    const reduced: boolean[] = [];
    for (let morning = 1; morning <= 4; morning += 1) {
      const after = startSol(state);
      const crewAfter = after.crew;
      const normal = crewAfter.reduce(
        (sum, m) => sum + (m.status === 'base' ? INCOME_BASE : m.status === 'sick' ? INCOME_SICK : 0),
        0,
      );
      const producing = crewAfter.filter((m) => m.status === 'base' || m.status === 'sick').length;
      const income = after.power - state.power;
      expect([normal, normal - producing * STORM_INCOME_PENALTY]).toContain(income);
      reduced.push(income === normal - producing * STORM_INCOME_PENALTY);
      state = after;
    }
    expect(reduced).toEqual([true, true, true, false]);
    expect(reduced.filter(Boolean)).toHaveLength(STORM_LENGTH_SOLS);
    expect(state.stormSolsLeft).toBe(0);
  });

  it('counts down 3, 2, 1 and only rolls when no storm is active', () => {
    const stream = findStream('storm-count', 3, (v) => v.every((x) => x < 0.06));
    const base = richGame();
    let state = { ...base, rng: { ...base.rng, storm: stream }, stormSolsLeft: 0 };
    const left: number[] = [];
    for (let morning = 1; morning <= 3; morning += 1) {
      state = startSol(state);
      left.push(state.stormSolsLeft);
    }
    // Draws 2 and 3 would start a storm, but one is already active.
    expect(left).toEqual([2, 1, 0]);
    expect(state.log.filter((e) => e.text.startsWith('A dust storm is covering')).length).toBe(1);
  });

  it('always takes 1 storm draw', () => {
    const state = { ...richGame(), stormSolsLeft: 2 };
    expect(rollDustStorm(state).rng.storm).toBe(drawMany(state.rng.storm, 1).nextState);
  });

  it('the storm timeline for a seed is the same whether or not the player launches research', () => {
    let storms = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const timeline = (explore: boolean): string[] => {
        let state = richGame(seed);
        const seen: string[] = [`${state.sol}:${state.stormSolsLeft}`];
        while (state.status === 'playing') {
          if (explore) {
            for (const id of [2, 3, 4]) {
              const result = launchResearch(state, id);
              if (!result.error) state = result.state;
            }
          }
          state = endSol(state);
          if (state.status === 'playing') seen.push(`${state.sol}:${state.stormSolsLeft}`);
        }
        storms += state.log.filter((e) => e.text.startsWith('A dust storm is covering')).length;
        return seen;
      };
      const withTrips = timeline(true);
      const withoutTrips = timeline(false);
      expect(withTrips).toHaveLength(28);
      expect(withTrips).toEqual(withoutTrips);
    }
    expect(storms).toBeGreaterThan(0);
  });
});
