import { describe, expect, it } from 'vitest';
import { buyLifeSupport, buyShielding } from './actions';
import {
  COMMS_DRAWS_PER_SOL,
  FLARE_EVACUATIONS_UNSHIELDED,
  MAX_SICK_FROM_ROLLS,
  RESEARCH_DRAWS_PER_SOL,
  SICKNESS_DRAWS_PER_SOL,
  STORM_DRAWS_PER_SOL,
} from './constants';
import { endSol, startGame } from './day';
import { rollSickness } from './events';
import { TEST_ONLY_SCENARIO } from './fixtures/test-scenario';
import { quiet } from './fixtures/test-helpers';
import { flareSols, seedFor } from './flares';
import { drawMany } from './rng';
import type { ActionResult, CrewMember, GameState } from './types';

// Fixture flare sols at M5: 1, 2, 10, 28. Sol 3 is a normal sol.
const FIXTURE_FLARE_SOLS = flareSols(TEST_ONLY_SCENARIO);

function ok(result: ActionResult): GameState {
  expect(result.error).toBeUndefined();
  return result.state;
}

function newGame(seed = seedFor(TEST_ONLY_SCENARIO)): GameState {
  return startGame(TEST_ONLY_SCENARIO.id, seed, FIXTURE_FLARE_SOLS);
}

/** Buys exactly what is asked, then ends the sol. */
function playSol(state: GameState, lifeSupport: number, shielding: number): GameState {
  let next = state;
  if (lifeSupport > 0) next = ok(buyLifeSupport(next, lifeSupport));
  if (shielding > 0) next = ok(buyShielding(next, shielding));
  return endSol(next);
}

/** Plays safely through the flare sols 1 and 2, then starts sol 3 with all crew healthy. */
function reachSol3(seed?: number): GameState {
  let state = newGame(seed);
  state = playSol(state, 8, 17);
  state = playSol(state, 8, 17);
  expect(state.sol).toBe(3);
  expect(state.crew.some((m) => m.status === 'evacuated')).toBe(false);
  return { ...state, crew: state.crew.map((m) => ({ ...m, status: 'base', solsSick: 0 })) };
}

function withCrew(state: GameState, changes: Partial<Record<number, Partial<CrewMember>>>): GameState {
  return { ...state, crew: state.crew.map((m) => ({ ...m, ...changes[m.id] })) };
}

function statuses(state: GameState): string[] {
  return state.crew.map((m) => m.status);
}

function lastLogs(before: GameState, after: GameState): string[] {
  return after.log.slice(before.log.length).map((e) => e.text);
}

describe('fixture', () => {
  it('has flares on sols 1, 2, 10 and 28', () => {
    expect(FIXTURE_FLARE_SOLS).toEqual([1, 2, 10, 28]);
  });
});

describe('solar flares', () => {
  it('17 shielding on a flare sol leaves 0 and evacuates nobody', () => {
    const before = quiet(newGame());
    const after = playSol(before, 4, 17);
    expect(after.sol).toBe(2);
    expect(after.shielding).toBe(0);
    expect(statuses(after)).toEqual(['base', 'base', 'base', 'base']);
    expect(lastLogs(before, after)).toContain('A solar flare hit! Your shields held.');
  });

  it('16 shielding on a flare sol evacuates two crew members and leaves 0', () => {
    expect(FLARE_EVACUATIONS_UNSHIELDED).toBe(2);
    const before = quiet(newGame());
    const after = playSol(before, 4, 16);
    expect(after.shielding).toBe(0);
    expect(after.crew.filter((m) => m.status === 'evacuated').map((m) => m.id)).toEqual([3, 4]);
    expect(
      lastLogs(before, after).some((t) => t.includes('too weak') && t.includes('Leo and Mei were evacuated')),
    ).toBe(true);
  });

  it('evacuates sick crew before healthy crew, highest id first', () => {
    let state = quiet(newGame());
    state = withCrew(state, { 1: { status: 'sick' }, 3: { status: 'sick' } });
    expect(statuses(playSol(state, 6, 16))).toEqual(['evacuated', 'base', 'evacuated', 'base']);

    state = withCrew(quiet(newGame()), { 1: { status: 'sick' } });
    expect(statuses(playSol(state, 5, 16))).toEqual(['evacuated', 'base', 'base', 'evacuated']);
  });

  it('evacuates only who is at the base when fewer than two are there', () => {
    let state = quiet(newGame());
    state = withCrew(state, { 1: { status: 'evacuated' }, 2: { status: 'evacuated' }, 3: { status: 'evacuated' } });
    const after = playSol(state, 1, 16);
    expect(statuses(after)).toEqual(['evacuated', 'evacuated', 'evacuated', 'evacuated']);
    expect(after.status).toBe('lost');
    expect(after.log.some((t) => t.text.includes('Leo was evacuated'))).toBe(true);
  });

  it('brings everyone outside back sick with no research, ignoring the cap of 2', () => {
    let state = quiet(newGame());
    state = withCrew(state, {
      2: { status: 'expedition', solsOutside: 2 },
      3: { status: 'expedition', solsOutside: 1 },
      4: { status: 'expedition', solsOutside: 3 },
    });
    const after = playSol(state, 7, 17);
    expect(statuses(after)).toEqual(['base', 'sick', 'sick', 'sick']);
    expect(after.crew.every((m) => m.solsOutside === 0)).toBe(true);
    expect(after.research).toBe(0);
    expect(after.shielding).toBe(0);
  });

  it('crew who just came back sick are the first evacuated when shields are weak', () => {
    let state = quiet(newGame());
    state = withCrew(state, { 2: { status: 'expedition', solsOutside: 1 } });
    const after = playSol(state, 5, 10);
    expect(statuses(after)).toEqual(['base', 'evacuated', 'base', 'evacuated']);
  });

  it('shielding left after a flare wears out overnight', () => {
    const before = quiet(newGame());
    const after = playSol(before, 4, 20); // 2 daily + 15 flare, 3 left over
    expect(after.shielding).toBe(0);
    expect(lastLogs(before, after)).toContain('The 3 shielding left over wore out overnight. Shields last one night.');
  });
});

describe('daily shielding', () => {
  it('a normal sol uses 2, and the rest wears out overnight', () => {
    const before = quiet(reachSol3());
    const after = playSol(before, 4, 10);
    expect(after.sol).toBe(4);
    expect(after.shielding).toBe(0);
    expect(statuses(after)).toEqual(['base', 'base', 'base', 'base']);
    expect(lastLogs(before, after).some((t) => t.startsWith('The 8 shielding left over wore out'))).toBe(true);
  });

  it('exactly 2 shielding leaves nothing to wear out and adds no message', () => {
    const before = quiet(reachSol3());
    const after = playSol(before, 4, 2);
    expect(after.shielding).toBe(0);
    expect(lastLogs(before, after).some((t) => t.includes('wore out'))).toBe(false);
  });

  it('life support still carries over', () => {
    const before = quiet(reachSol3());
    const after = playSol(before, 10, 2);
    expect(after.lifeSupport).toBe(before.lifeSupport + 10 - 4);
    expect(after.lifeSupport).toBeGreaterThan(0);
  });

  it('takes the same fixed draws every sol, short of shielding or not', () => {
    // A full sol = one night plus the next morning.
    for (const shielding of [0, 2]) {
      const before = reachSol3();
      const after = playSol(before, 8, shielding);
      expect(after.rng.sickness).toBe(drawMany(before.rng.sickness, SICKNESS_DRAWS_PER_SOL).nextState);
      expect(after.rng.research).toBe(drawMany(before.rng.research, RESEARCH_DRAWS_PER_SOL).nextState);
      expect(after.rng.storm).toBe(drawMany(before.rng.storm, STORM_DRAWS_PER_SOL).nextState);
      expect(after.rng.comms).toBe(drawMany(before.rng.comms, COMMS_DRAWS_PER_SOL).nextState);
    }
  });

  it('with 0 shielding the sickness rolls happen and never make more than 2 sick', () => {
    let sawRadiationSickness = false;
    let sawCap = false;
    for (let seed = 1; seed <= 300; seed += 1) {
      const before = reachSol3(seed);
      const after = playSol(before, 4, 0);
      const logs = lastLogs(before, after);
      const madeSick = logs.filter((t) => t.includes('space radiation made')).length;
      expect(madeSick).toBeLessThanOrEqual(MAX_SICK_FROM_ROLLS);
      expect(after.crew.filter((m) => m.status === 'sick').length).toBeLessThanOrEqual(MAX_SICK_FROM_ROLLS);
      expect(after.crew.some((m) => m.status === 'evacuated')).toBe(false);
      if (madeSick > 0) sawRadiationSickness = true;
      if (madeSick === MAX_SICK_FROM_ROLLS) sawCap = true;
    }
    expect(sawRadiationSickness).toBe(true);
    expect(sawCap).toBe(true);
  });
});

describe('rollSickness', () => {
  it('respects the cap roll by roll, in id order', () => {
    let state = newGame();
    state = withCrew(state, { 2: { status: 'sick' } });
    const after = rollSickness(state, () => 100, (m) => `${m.name} got sick.`);
    // Crew 2 was already sick; crew 1 makes 2 sick; crews 3 and 4 have no effect.
    expect(statuses(after)).toEqual(['sick', 'sick', 'base', 'base']);
  });

  it('skips crew who do not roll but still takes their draw', () => {
    const state = newGame();
    const after = rollSickness(state, (m) => (m.id === 4 ? 100 : null), (m) => `${m.name} got sick.`);
    expect(statuses(after)).toEqual(['base', 'base', 'base', 'sick']);
    expect(after.rng.sickness).toBe(drawMany(state.rng.sickness, 4).nextState);
  });

  it('does nothing at 0 percent and leaves the input untouched', () => {
    const state = newGame();
    const snapshot = structuredClone(state);
    const after = rollSickness(state, () => 0, () => 'never');
    expect(statuses(after)).toEqual(['base', 'base', 'base', 'base']);
    expect(state).toEqual(snapshot);
  });
});
