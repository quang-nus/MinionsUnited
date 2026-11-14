import { describe, expect, it } from 'vitest';
import { buyLifeSupport, buyShielding, launchResearch } from '../engine/actions';
import { endSol, startGame } from '../engine/day';
import type { ActionResult, GameState } from '../engine/types';
import { nightEvents } from './nightEvents';
import { parseSoundSetting } from './sound';

function ok(result: ActionResult): GameState {
  expect(result.error).toBeUndefined();
  return result.state;
}

describe('nightEvents', () => {
  it('finds nothing when only buying during the day', () => {
    const before = startGame('test', 1, [3]);
    const after = ok(buyLifeSupport(before, 4));
    expect(nightEvents(before, after)).toEqual({ flare: false, returnedIds: [], solEnded: false });
  });

  it('finds a flare on the sol that ended', () => {
    const before = ok(buyShielding(ok(buyLifeSupport(startGame('test', 1, [1]), 4)), 17));
    const after = endSol(before);
    expect(nightEvents(before, after)).toMatchObject({ flare: true, solEnded: true });
  });

  it('finds no flare on a quiet sol', () => {
    const before = ok(buyShielding(ok(buyLifeSupport(startGame('test', 1, [5]), 4)), 2));
    expect(nightEvents(before, endSol(before)).flare).toBe(false);
  });

  it('finds crew who came back from exploring', () => {
    let state = ok(buyLifeSupport(startGame('test', 7, []), 40));
    state = ok(launchResearch(state, 2));
    let seen: number[] = [];
    for (let sol = 0; sol < 10 && seen.length === 0; sol += 1) {
      const before = ok(buyShielding(state, 2));
      state = endSol(before);
      seen = nightEvents(before, state).returnedIds;
    }
    expect(seen).toEqual([2]);
  });

  it('finds nothing with no earlier state or a different game', () => {
    const game = startGame('test', 1, []);
    expect(nightEvents(null, game).solEnded).toBe(false);
    expect(nightEvents({ ...game, scenarioId: 'other' }, { ...game, sol: 2 }).solEnded).toBe(false);
  });
});

describe('sound setting', () => {
  it('is on unless it was turned off', () => {
    expect(parseSoundSetting(null)).toBe(true);
    expect(parseSoundSetting('on')).toBe(true);
    expect(parseSoundSetting('garbage')).toBe(true);
    expect(parseSoundSetting('off')).toBe(false);
  });
});
