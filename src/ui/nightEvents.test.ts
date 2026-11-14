import { describe, expect, it } from 'vitest';
import { buyLifeSupport, buyShielding, launchResearch } from '../engine/actions';
import { endSol, startGame } from '../engine/day';
import { STARS_2_RESEARCH, STARS_3_RESEARCH } from '../engine/constants';
import type { ActionResult, CrewStatus, GameState } from '../engine/types';
import { NO_EVENTS, nightEvents, starMessages } from './nightEvents';
import { parseSoundSetting } from './sound';

function ok(result: ActionResult): GameState {
  expect(result.error).toBeUndefined();
  return result.state;
}

describe('nightEvents', () => {
  it('finds nothing when only buying during the day', () => {
    const before = startGame('test', 1, [3]);
    const after = ok(buyLifeSupport(before, 4));
    expect(nightEvents(before, after)).toEqual(NO_EVENTS);
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

describe('star changes at the end of a sol', () => {
  /** A sol that ended: `after` is the next morning with the given research and crew. */
  function night(
    research: [before: number, after: number],
    crew: [before: readonly CrewStatus[], after: readonly CrewStatus[]] = [
      ['base', 'base', 'base', 'base'],
      ['base', 'base', 'base', 'base'],
    ],
  ) {
    const game = startGame('test', 1, []);
    const at = (r: number, statuses: readonly CrewStatus[], sol: number): GameState => ({
      ...game,
      sol,
      research: r,
      crew: game.crew.map((m, i) => ({ ...m, status: statuses[i] ?? 'base' })),
    });
    const before = at(research[0], crew[0], 5);
    const after = { ...at(research[1], crew[1], 6), log: [...before.log, { sol: 5, text: 'night', tag: 'research' as const }] };
    return nightEvents(before, after);
  }

  it('finds a gain when research crosses the benchmark', () => {
    expect(night([STARS_2_RESEARCH - 1, STARS_2_RESEARCH]).stars).toEqual([{ slot: 2, kind: 'gained' }]);
  });

  it('finds a gain when research crosses the higher mark with a full crew', () => {
    expect(night([STARS_3_RESEARCH - 1, STARS_3_RESEARCH]).stars).toEqual([{ slot: 3, kind: 'gained' }]);
  });

  it('finds both gains when one trip crosses both marks', () => {
    expect(night([0, STARS_3_RESEARCH]).stars).toEqual([
      { slot: 2, kind: 'gained' },
      { slot: 3, kind: 'gained' },
    ]);
  });

  it('finds a loss when someone is evacuated while star 3 is lit', () => {
    const events = night(
      [STARS_3_RESEARCH, STARS_3_RESEARCH],
      [
        ['base', 'base', 'base', 'base'],
        ['base', 'base', 'base', 'evacuated'],
      ],
    );
    expect(events.stars).toEqual([{ slot: 3, kind: 'lost' }]);
    expect(events.starsBefore?.fullCrew).toBe('lit');
  });

  it('finds "out of reach" when someone is evacuated before star 3 is lit', () => {
    const events = night(
      [10, 10],
      [
        ['base', 'base', 'base', 'base'],
        ['evacuated', 'base', 'base', 'base'],
      ],
    );
    expect(events.stars).toEqual([{ slot: 3, kind: 'out-of-reach' }]);
  });

  it('finds nothing more once star 3 is already out of reach', () => {
    const events = night(
      [10, STARS_3_RESEARCH],
      [
        ['evacuated', 'base', 'base', 'base'],
        ['evacuated', 'evacuated', 'base', 'base'],
      ],
    );
    expect(events.stars).toEqual([{ slot: 2, kind: 'gained' }]);
  });

  it('a crew member falling sick changes nothing', () => {
    const events = night(
      [STARS_3_RESEARCH, STARS_3_RESEARCH],
      [
        ['base', 'base', 'base', 'base'],
        ['sick', 'base', 'sick', 'base'],
      ],
    );
    expect(events.stars).toEqual([]);
  });

  it('finds nothing on load, Continue or a new game', () => {
    const loaded = { ...startGame('test', 1, []), research: STARS_3_RESEARCH };
    expect(nightEvents(null, loaded).stars).toEqual([]);
    expect(nightEvents(null, loaded).starsBefore).toBeNull();
  });

  it('finds nothing during the day', () => {
    const before = { ...startGame('test', 1, []), research: STARS_2_RESEARCH - 1 };
    const after = ok(buyLifeSupport(before, 4));
    expect(nightEvents(before, after).stars).toEqual([]);
  });
});

describe('star messages', () => {
  it('has one line for each kind of change', () => {
    expect(starMessages([{ slot: 2, kind: 'gained' }])).toEqual(['You earned a star!']);
    expect(starMessages([{ slot: 2, kind: 'gained' }, { slot: 3, kind: 'gained' }])).toEqual(['You earned 2 stars!']);
    expect(starMessages([{ slot: 3, kind: 'lost' }])).toEqual(['You lost a star. Everyone must stay on Mars for 3 stars.']);
    expect(starMessages([{ slot: 3, kind: 'out-of-reach' }])).toEqual(['The third star needs all 4 crew on Mars.']);
    expect(starMessages([])).toEqual([]);
  });

  it('never says died or dead', () => {
    const all = starMessages([
      { slot: 2, kind: 'gained' },
      { slot: 3, kind: 'lost' },
      { slot: 3, kind: 'out-of-reach' },
    ]).join(' ');
    expect(all).not.toMatch(/\b(died|dead|die)\b/i);
  });
});
