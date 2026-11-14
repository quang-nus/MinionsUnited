import { describe, expect, it } from 'vitest';
import { TEST_ONLY_SCENARIO } from './engine/fixtures/test-scenario';
import type { GameState, Scenario } from './engine/types';
import {
  EMPTY_STORE,
  applyAction,
  isGameState,
  newGame,
  parseSave,
  pickScenario,
  serialiseSave,
  storeReducer,
  type StoreState,
} from './store';

const OTHER: Scenario = { ...TEST_ONLY_SCENARIO, id: 'test-only-other', name: 'TEST ONLY other' };
const SCENARIOS = [TEST_ONLY_SCENARIO, OTHER];

function started(): StoreState {
  return storeReducer(EMPTY_STORE, { type: 'start', scenario: TEST_ONLY_SCENARIO });
}

function gameOf(state: StoreState): GameState {
  if (state.game === null) throw new Error('no game');
  return state.game;
}

describe('store', () => {
  it('starts with no game, and a start runs sol 1 morning', () => {
    expect(EMPTY_STORE.game).toBeNull();
    const state = started();
    expect(gameOf(state).sol).toBe(1);
    expect(gameOf(state).power).toBe(100 + 4 * 4); // start power + 4 crew x income 4
    expect(state.scenario?.id).toBe(TEST_ONLY_SCENARIO.id);
  });

  it('applyAction sends each action to the engine', () => {
    let game = newGame(TEST_ONLY_SCENARIO);
    game = applyAction(game, { type: 'buyLifeSupport', units: 10 }).state;
    expect(game.lifeSupport).toBe(10);
    game = applyAction(game, { type: 'buyShielding', units: 3 }).state;
    expect(game.shielding).toBe(3);
    game = applyAction(game, { type: 'launchResearch', crewId: 2 }).state;
    expect(game.crew[1]?.status).toBe('expedition');
    game = applyAction(game, { type: 'requestComms' }).state;
    expect(game.commsRequestedOnSol).toBe(1);
    expect(applyAction(game, { type: 'cure', crewId: 1 }).error).toBeTruthy();
  });

  it('shows an action error, and clears it on the next action or when dismissed', () => {
    let state = storeReducer(started(), { type: 'buyLifeSupport', units: 9999 });
    expect(state.error).toBeTruthy();
    expect(gameOf(state).lifeSupport).toBe(0);
    state = storeReducer(state, { type: 'dismissError' });
    expect(state.error).toBeNull();
    state = storeReducer(state, { type: 'buyLifeSupport', units: 9999 });
    state = storeReducer(state, { type: 'buyLifeSupport', units: 4 });
    expect(state.error).toBeNull();
    expect(gameOf(state).lifeSupport).toBe(4);
  });

  it('ends a sol, resumes a saved game and leaves', () => {
    let state = storeReducer(started(), { type: 'buyLifeSupport', units: 4 });
    state = storeReducer(state, { type: 'buyShielding', units: 17 });
    state = storeReducer(state, { type: 'endSol' });
    expect(gameOf(state).sol).toBe(2);

    const game = gameOf(state);
    const left = storeReducer(state, { type: 'leave' });
    expect(left.game).toBeNull();
    const resumed = storeReducer(left, { type: 'resume', scenario: TEST_ONLY_SCENARIO, game });
    expect(resumed.game).toBe(game);
    expect(resumed.gameNumber).toBe(state.gameNumber + 1);
  });

  it('ignores actions when no game is running', () => {
    expect(storeReducer(EMPTY_STORE, { type: 'endSol' })).toBe(EMPTY_STORE);
    expect(storeReducer(EMPTY_STORE, { type: 'buyLifeSupport', units: 1 })).toBe(EMPTY_STORE);
  });
});

describe('pickScenario', () => {
  it('never repeats the previous scenario when there is more than one', () => {
    for (const random of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(pickScenario(SCENARIOS, TEST_ONLY_SCENARIO.id, random)?.id).toBe(OTHER.id);
      expect(pickScenario(SCENARIOS, OTHER.id, random)?.id).toBe(TEST_ONLY_SCENARIO.id);
    }
  });

  it('picks evenly when there is no previous scenario', () => {
    expect(pickScenario(SCENARIOS, null, 0.1)?.id).toBe(TEST_ONLY_SCENARIO.id);
    expect(pickScenario(SCENARIOS, null, 0.9)?.id).toBe(OTHER.id);
  });

  it('repeats when there is only one, and gives nothing when there are none', () => {
    expect(pickScenario([TEST_ONLY_SCENARIO], TEST_ONLY_SCENARIO.id, 0.5)?.id).toBe(TEST_ONLY_SCENARIO.id);
    expect(pickScenario([], null, 0.5)).toBeUndefined();
  });
});

describe('saving', () => {
  it('a saved game loads back exactly', () => {
    let state = storeReducer(started(), { type: 'buyLifeSupport', units: 6 });
    state = storeReducer(state, { type: 'requestComms' });
    const game = gameOf(state);
    const loaded = parseSave(serialiseSave(game), SCENARIOS);
    expect(loaded?.scenario.id).toBe(TEST_ONLY_SCENARIO.id);
    expect(loaded?.game).toEqual(game);
  });

  it('ignores a save that does not parse', () => {
    expect(parseSave('{not json', SCENARIOS)).toBeNull();
    expect(parseSave('null', SCENARIOS)).toBeNull();
    expect(parseSave('{"version":1}', SCENARIOS)).toBeNull();
    expect(parseSave(null, SCENARIOS)).toBeNull();
  });

  it('ignores a save with a broken game', () => {
    const game = gameOf(started());
    const broken = JSON.parse(serialiseSave(game)) as { game: Record<string, unknown> };
    broken.game.crew = 'four people';
    expect(parseSave(JSON.stringify(broken), SCENARIOS)).toBeNull();
    expect(isGameState({ ...game, sol: 99 })).toBe(false);
    expect(isGameState(game)).toBe(true);
  });

  it('ignores a save for a scenario that no longer exists', () => {
    const save = serialiseSave(gameOf(started()));
    expect(parseSave(save, [OTHER])).toBeNull();
  });

  it('ignores a save whose scenario file has changed', () => {
    const save = serialiseSave(gameOf(started()));
    const changed: Scenario = {
      ...TEST_ONLY_SCENARIO,
      flares: [...TEST_ONLY_SCENARIO.flares, { flrID: 'TEST-FLR-NEW', peakTime: '2000-01-15T00:00Z', classType: 'X3.0' }],
    };
    expect(parseSave(save, [changed])).toBeNull();
  });

  it('ignores a finished game', () => {
    const game = { ...gameOf(started()), status: 'won' as const };
    expect(parseSave(serialiseSave(game), SCENARIOS)).toBeNull();
  });
});

describe('crew names in the store and saves', () => {
  it('the start action carries the names into the game', async () => {
    const state = storeReducer(EMPTY_STORE, {
      type: 'start',
      scenario: TEST_ONLY_SCENARIO,
      crewNames: ['  Zara ', '', 'Old   Bob', 'Mo'],
    });
    expect(gameOf(state).crew.map((m) => m.name)).toEqual(['Zara', 'Kofi', 'Old Bob', 'Mo']);
  });

  it('a save with custom names loads back exactly', () => {
    const state = storeReducer(EMPTY_STORE, {
      type: 'start',
      scenario: TEST_ONLY_SCENARIO,
      crewNames: ['Zara', 'WWWWWWWWWWWW', 'Old Bob', '🚀Rocket'],
    });
    const game = gameOf(state);
    const loaded = parseSave(serialiseSave(game), SCENARIOS);
    expect(loaded?.game).toEqual(game);
    expect(loaded?.game.crew.map((m) => m.name)).toEqual(['Zara', 'WWWWWWWWWWWW', 'Old Bob', '🚀Rocket']);
  });

  it('rejects a save with a 50-character, empty or non-string name', () => {
    const game = gameOf(started());
    for (const bad of ['x'.repeat(50), '', 42, null]) {
      const data = JSON.parse(serialiseSave(game)) as { game: { crew: { name: unknown }[] } };
      const first = data.game.crew[0];
      if (first === undefined) throw new Error('no crew');
      first.name = bad;
      expect(parseSave(JSON.stringify(data), SCENARIOS)).toBeNull();
    }
  });

  it('remembered names are cleaned, and anything unreadable falls back to the defaults', async () => {
    const { parseCrewNames } = await import('./store');
    expect(parseCrewNames(null)).toEqual(['Ava', 'Kofi', 'Mei', 'Leo']);
    expect(parseCrewNames('{broken')).toEqual(['Ava', 'Kofi', 'Mei', 'Leo']);
    expect(parseCrewNames('"just text"')).toEqual(['Ava', 'Kofi', 'Mei', 'Leo']);
    expect(parseCrewNames('["Zara", 7, "  Bo  ", "ABCDEFGHIJKLMNOP"]')).toEqual(['Zara', 'Kofi', 'Bo', 'ABCDEFGHIJKL']);
  });
});
