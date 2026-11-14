import { describe, expect, it } from 'vitest';
import { buyLifeSupport, buyShielding, cure, launchResearch, requestComms } from './actions';
import { CREW_NAME_MAX_LENGTH, CREW_NAMES } from './constants';
import { cleanCrewName, cleanCrewNames, createInitialState, endSol, lifeSupportTonight, startGame } from './day';
import { TEST_ONLY_SCENARIO } from './fixtures/test-scenario';
import { flareSols, seedFor } from './flares';
import { mulberry32 } from './rng';
import type { ActionResult, GameState } from './types';

const CUSTOM = ['Zara', 'Old Bob', 'WWWWWWWWWWWW', 'Mo'];

describe('cleanCrewName', () => {
  it('trims both ends and collapses repeated spaces', () => {
    expect(cleanCrewName('  Ava  ', 'X')).toBe('Ava');
    expect(cleanCrewName('Big    Bob', 'X')).toBe('Big Bob');
    expect(cleanCrewName(' \t Sam \n Lee ', 'X')).toBe('Sam Lee');
  });

  it('removes control characters', () => {
    expect(cleanCrewName('Ka\u0000i\u0007\u009F', 'X')).toBe('Kai');
  });

  it(`cuts to ${CREW_NAME_MAX_LENGTH} characters`, () => {
    expect(cleanCrewName('ABCDEFGHIJKLMNOP', 'X')).toBe('ABCDEFGHIJKL');
    expect(cleanCrewName('Abcdefghijk Lmn', 'X')).toBe('Abcdefghijk'); // no trailing space after the cut
    expect(Array.from(cleanCrewName('🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀', 'X'))).toHaveLength(CREW_NAME_MAX_LENGTH);
  });

  it('falls back to the default when empty', () => {
    expect(cleanCrewName('', 'Ava')).toBe('Ava');
    expect(cleanCrewName('    ', 'Ava')).toBe('Ava');
    expect(cleanCrewName('\u0000\u0001', 'Ava')).toBe('Ava');
  });

  it('keeps markup as plain characters (the screen never inserts names as HTML)', () => {
    expect(cleanCrewName('<b>Hi</b>', 'X')).toBe('<b>Hi</b>');
  });

  it('cleans a whole list, with defaults for missing names', () => {
    expect(cleanCrewNames(undefined)).toEqual([...CREW_NAMES]);
    expect(cleanCrewNames(['Zed', '', '  '])).toEqual(['Zed', 'Kofi', 'Mei', 'Leo']);
    expect(cleanCrewNames(['Sam', 'Sam', 'Sam', 'Sam'])).toEqual(['Sam', 'Sam', 'Sam', 'Sam']);
  });
});

describe('a game with custom names', () => {
  it('shows them in the crew and in log entries', () => {
    const before = createInitialState('test', 1, [], CUSTOM);
    expect(before.crew.map((m) => m.name)).toEqual(CUSTOM);

    const lost = endSol(startGame('test', 1, [], CUSTOM)); // nothing bought: everyone leaves
    const evacuations = lost.log.filter((e) => e.tag === 'evacuated-life-support').map((e) => e.text);
    for (const name of CUSTOM) {
      expect(evacuations.some((t) => t.includes(`${name} was evacuated to the rescue ship`))).toBe(true);
    }
  });

  it('defaults are used when no names are given', () => {
    expect(startGame('test', 1, []).crew.map((m) => m.name)).toEqual([...CREW_NAMES]);
  });
});

/** Plays a whole game with choices from a fixed test generator that never looks at names. */
function playScripted(names: readonly string[] | undefined): GameState {
  let choice = 4242;
  const next = () => {
    const d = mulberry32(choice);
    choice = d.nextState;
    return d.value;
  };
  const tryAction = (s: GameState, r: ActionResult) => (r.error ? s : r.state);
  let state = startGame(TEST_ONLY_SCENARIO.id, seedFor(TEST_ONLY_SCENARIO), flareSols(TEST_ONLY_SCENARIO), names);
  while (state.status === 'playing') {
    if (next() < 0.3) state = tryAction(state, requestComms(state));
    for (const member of state.crew) {
      if (member.status === 'sick' && next() < 0.5) {
        state = tryAction(state, buyLifeSupport(state, 5));
        state = tryAction(state, cure(state, member.id));
      }
      if (member.status === 'base' && next() < 0.3) {
        state = tryAction(state, buyLifeSupport(state, 2));
        state = tryAction(state, launchResearch(state, member.id));
      }
    }
    const need = lifeSupportTonight(state) - state.lifeSupport;
    if (need > 0) state = tryAction(state, buyLifeSupport(state, need));
    const shielding = (next() < 0.6 ? 17 : 2) - state.shielding;
    if (shielding > 0) state = tryAction(state, buyShielding(state, shielding));
    state = endSol(state);
  }
  return state;
}

describe('names never change the game', () => {
  it('the same choices with different names end identically', () => {
    const a = playScripted(undefined);
    const b = playScripted(CUSTOM);
    expect(b.sol).toBe(a.sol);
    expect(b.status).toBe(a.status);
    expect(b.research).toBe(a.research);
    expect(b.power).toBe(a.power);
    expect(b.crew.map((m) => m.status)).toEqual(a.crew.map((m) => m.status));
    expect(b.rng).toEqual(a.rng);
    expect(b.seed).toBe(a.seed);
    expect(b.log.length).toBe(a.log.length);
    expect(b.log.map((e) => e.tag)).toEqual(a.log.map((e) => e.tag));
    expect(b.crew.map((m) => m.name)).toEqual(CUSTOM);
  });
});
