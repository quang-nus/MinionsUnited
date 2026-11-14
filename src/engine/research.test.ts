import { describe, expect, it } from 'vitest';
import { buyLifeSupport, buyShielding, launchResearch } from './actions';
import {
  RESEARCH_DRAWS_PER_SOL,
  RESEARCH_LAUNCH_LIFE_SUPPORT_COST,
  RESEARCH_REWARD_RANGES,
  SOLS_TOTAL,
  STARS_2_RESEARCH,
  STARS_3_RESEARCH,
} from './constants';
import { endSol, startGame } from './day';
import { TEST_ONLY_SCENARIO } from './fixtures/test-scenario';
import { quiet } from './fixtures/test-helpers';
import { flareSols, seedFor } from './flares';
import { forceReturnAtMissionEnd, litStars, resolveExpeditions, rewardRange, starGoals, starProgress, starsFor } from './research';
import { drawMany, fnv1a, wholeBetween } from './rng';
import type { ActionResult, CrewMember, CrewStatus, GameState } from './types';

const NO_FLARES: number[] = [];

function ok(result: ActionResult): GameState {
  expect(result.error).toBeUndefined();
  return result.state;
}

function refused(result: ActionResult, before: GameState): void {
  expect(result.error).toBeTruthy();
  expect(result.state).toBe(before);
}

function newGame(seed = 1, flares: readonly number[] = NO_FLARES): GameState {
  return startGame('test', seed, flares);
}

/** A game with plenty of stock, so only the rules under test matter. */
function richGame(seed = 1, flares: readonly number[] = NO_FLARES): GameState {
  return { ...newGame(seed, flares), power: 100_000, lifeSupport: 100_000, shielding: 100_000 };
}

function withCrew(state: GameState, changes: Partial<Record<number, Partial<CrewMember>>>): GameState {
  return { ...state, crew: state.crew.map((m) => ({ ...m, ...changes[m.id] })) };
}

function crew(state: GameState, id: number): CrewMember {
  const member = state.crew.find((m) => m.id === id);
  if (member === undefined) throw new Error(`no crew ${id}`);
  return member;
}

describe('launchResearch', () => {
  it('costs 2 life support and sends the crew member outside', () => {
    const before = ok(buyLifeSupport(newGame(), 10));
    const after = ok(launchResearch(before, 2));
    expect(after.lifeSupport).toBe(10 - RESEARCH_LAUNCH_LIFE_SUPPORT_COST);
    expect(after.power).toBe(before.power);
    expect(crew(after, 2).status).toBe('expedition');
    expect(crew(after, 2).solsOutside).toBe(0);
  });

  it('refuses without 2 life support', () => {
    const before = ok(buyLifeSupport(newGame(), 1));
    refused(launchResearch(before, 2), before);
  });

  it('a sick crew member cannot launch', () => {
    const before = withCrew(richGame(), { 2: { status: 'sick' } });
    refused(launchResearch(before, 2), before);
  });

  it('crew already outside, evacuated or unknown cannot launch', () => {
    const before = withCrew(richGame(), { 2: { status: 'expedition' }, 3: { status: 'evacuated' } });
    refused(launchResearch(before, 2), before);
    refused(launchResearch(before, 3), before);
    refused(launchResearch(before, 99), before);
  });

  it('the last crew member in the base cannot launch', () => {
    let state = richGame();
    state = ok(launchResearch(state, 1));
    state = ok(launchResearch(state, 2));
    state = ok(launchResearch(state, 3));
    refused(launchResearch(state, 4), state);
  });

  it('a sick crew member counts as someone staying at the base', () => {
    const state = withCrew(richGame(), { 1: { status: 'sick' }, 2: { status: 'expedition' }, 3: { status: 'evacuated' } });
    expect(launchResearch(state, 4).error).toBeUndefined();
  });

  it('cannot be undone: there is no recall action', async () => {
    const actions = await import('./actions');
    expect(Object.keys(actions).some((name) => /recall/i.test(name))).toBe(false);
  });
});

describe('life support while outside', () => {
  it('an expedition member needs 2 life support at the end of the sol', () => {
    // 3 at the base need 1 each, the explorer needs 2: 5 after the launch.
    let enough = newGame(7);
    enough = ok(buyShielding(ok(buyLifeSupport(enough, 5 + RESEARCH_LAUNCH_LIFE_SUPPORT_COST)), 2));
    enough = ok(launchResearch(enough, 4));
    const fine = endSol(enough);
    expect(fine.crew.some((m) => m.status === 'evacuated')).toBe(false);
    expect(fine.lifeSupport).toBe(0);

    let short = newGame(7);
    short = ok(buyShielding(ok(buyLifeSupport(short, 4 + RESEARCH_LAUNCH_LIFE_SUPPORT_COST)), 2));
    short = ok(launchResearch(short, 4));
    const after = endSol(short);
    expect(crew(after, 4).status).toBe('evacuated');
    expect(crew(after, 4).solsOutside).toBe(0);
    expect(after.crew.filter((m) => m.status === 'evacuated')).toHaveLength(1);
  });
});

describe('resolveExpeditions', () => {
  it('a crew member is never outside more than 7 sols', () => {
    let longest = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      let state = richGame(seed);
      while (state.status === 'playing') {
        for (const id of [2, 3, 4]) {
          if (crew(state, id).status === 'base') {
            const result = launchResearch(state, id);
            if (!result.error) state = result.state;
          }
        }
        state = endSol(state);
        for (const member of state.crew) {
          longest = Math.max(longest, member.solsOutside);
          expect(member.solsOutside).toBeLessThanOrEqual(6);
        }
      }
    }
    // solsOutside is stored after the sol's increase only for crew still out, so 6 is the most seen.
    expect(longest).toBe(6);
    expect(RESEARCH_REWARD_RANGES).toHaveLength(7);
  });

  it('crew out for 6 sols always return on the 7th', () => {
    for (let i = 0; i < 2000; i += 1) {
      const state = withCrew(
        { ...richGame(), rng: { ...richGame().rng, research: fnv1a(`seven-${i}`) } },
        { 2: { status: 'expedition', solsOutside: 6 } },
      );
      const { state: after, returnedIds } = resolveExpeditions(state);
      expect(returnedIds).toEqual([2]);
      expect(crew(after, 2).status).not.toBe('expedition');
    }
  });

  it('rewards always fall inside the range for the sol they return on', () => {
    for (let outsideBefore = 0; outsideBefore < RESEARCH_REWARD_RANGES.length; outsideBefore += 1) {
      const [min, max] = rewardRange(outsideBefore + 1);
      const seen = new Set<number>();
      for (let i = 0; i < 3000; i += 1) {
        const base = richGame();
        const state = withCrew(
          { ...base, rng: { ...base.rng, research: fnv1a(`reward-${outsideBefore}-${i}`) } },
          { 3: { status: 'expedition', solsOutside: outsideBefore } },
        );
        const { state: after, returnedIds } = resolveExpeditions(state);
        if (returnedIds.includes(3)) {
          const reward = after.research - state.research;
          expect(reward).toBeGreaterThanOrEqual(min);
          expect(reward).toBeLessThanOrEqual(max);
          seen.add(reward);
        } else {
          expect(after.research).toBe(state.research);
        }
      }
      // Both ends of the range can come up.
      expect(seen.has(min)).toBe(true);
      expect(seen.has(max)).toBe(true);
    }
  });

  it('6-sol and 7-sol trips earn 85 to 120 and 135 to 185', () => {
    expect(rewardRange(6)).toEqual([85, 120]);
    expect(rewardRange(7)).toEqual([135, 185]);
    for (let i = 0; i < 2000; i += 1) {
      const base = richGame();
      const state = withCrew(
        { ...base, rng: { ...base.rng, research: fnv1a(`long-${i}`) } },
        { 2: { status: 'expedition', solsOutside: 6 } },
      );
      const reward = resolveExpeditions(state).state.research - state.research;
      expect(reward).toBeGreaterThanOrEqual(135);
      expect(reward).toBeLessThanOrEqual(185);
    }
  });

  it('over 10,000 expeditions about 40% return on their first sol', () => {
    let returned = 0;
    const trials = 10_000;
    for (let i = 0; i < trials; i += 1) {
      const base = richGame();
      const state = withCrew(
        { ...base, rng: { ...base.rng, research: fnv1a(`first-sol-${i}`) } },
        { 2: { status: 'expedition', solsOutside: 0 } },
      );
      if (resolveExpeditions(state).returnedIds.includes(2)) returned += 1;
    }
    const share = returned / trials;
    expect(share).toBeGreaterThan(0.38);
    expect(share).toBeLessThan(0.42);
  });

  it('returning crew reset solsOutside and roll for sickness', () => {
    let sick = 0;
    let back = 0;
    const trials = 4000;
    for (let i = 0; i < trials; i += 1) {
      const base = richGame();
      const state = withCrew(
        {
          ...base,
          rng: { ...base.rng, research: fnv1a(`sick-r-${i}`), sickness: fnv1a(`sick-s-${i}`) },
        },
        { 2: { status: 'expedition', solsOutside: 4 } },
      );
      const { state: after, returnedIds } = resolveExpeditions(state);
      if (!returnedIds.includes(2)) {
        expect(crew(after, 2).solsOutside).toBe(5);
        continue;
      }
      back += 1;
      expect(crew(after, 2).solsOutside).toBe(0);
      if (crew(after, 2).status === 'sick') sick += 1;
    }
    // 30 + 10 x 5 = 80% come back on their 5th sol; 5 + 10 x 5 = 55% of those are sick.
    expect(back / trials).toBeGreaterThan(0.77);
    expect(back / trials).toBeLessThan(0.83);
    expect(sick / back).toBeGreaterThan(0.52);
    expect(sick / back).toBeLessThan(0.58);
  });

  it('a 7-sol trip always ends, and about 75% come back sick', () => {
    let sick = 0;
    const trials = 4000;
    for (let i = 0; i < trials; i += 1) {
      const base = richGame();
      const state = withCrew(
        { ...base, rng: { ...base.rng, research: fnv1a(`sick7-r-${i}`), sickness: fnv1a(`sick7-s-${i}`) } },
        { 2: { status: 'expedition', solsOutside: 6 } },
      );
      if (crew(resolveExpeditions(state).state, 2).status === 'sick') sick += 1;
    }
    // 5 + 10 x 7 = 75%.
    expect(sick / trials).toBeGreaterThan(0.72);
    expect(sick / trials).toBeLessThan(0.78);
  });

  it('always takes 8 research draws and 4 sickness draws, even with nobody outside', () => {
    const state = richGame();
    const after = resolveExpeditions(state).state;
    expect(after.rng.research).toBe(drawMany(state.rng.research, RESEARCH_DRAWS_PER_SOL).nextState);
    expect(after.rng.sickness).toBe(drawMany(state.rng.sickness, 4).nextState);
  });

  it('leaves the input untouched', () => {
    const state = withCrew(richGame(), { 2: { status: 'expedition', solsOutside: 3 } });
    const snapshot = structuredClone(state);
    resolveExpeditions(state);
    expect(state).toEqual(snapshot);
  });
});

describe('flares and expeditions', () => {
  it('a flare sol brings expedition members home sick with no research', () => {
    // The fixture has a flare on sol 1.
    let state = quiet(startGame(TEST_ONLY_SCENARIO.id, seedFor(TEST_ONLY_SCENARIO), flareSols(TEST_ONLY_SCENARIO)));
    state = ok(buyLifeSupport(state, 10)); // 4 to launch two, then 2 at the base + 2 x 2 outside
    state = ok(buyShielding(state, 17));
    state = ok(launchResearch(state, 2));
    state = ok(launchResearch(state, 3));
    const after = endSol(state);
    expect(after.sol).toBe(2);
    expect(crew(after, 2).status).toBe('sick');
    expect(crew(after, 3).status).toBe('sick');
    expect(crew(after, 2).solsOutside).toBe(0);
    expect(after.research).toBe(0);
  });
});

describe('end of sol 28', () => {
  /** A research stream state whose return roll for crew `index` fails on the first sol (40%). */
  function streamWhereReturnFails(index: number): number {
    for (let i = 0; ; i += 1) {
      const candidate = fnv1a(`stay-out-${i}`);
      if ((drawMany(candidate, RESEARCH_DRAWS_PER_SOL).values[index] ?? 0) >= 0.4) return candidate;
    }
  }

  it('everyone still outside comes home with research from their own step-4 reward draw', () => {
    const stream = streamWhereReturnFails(1); // crew 2 is index 1
    let state = richGame();
    state = { ...state, sol: SOLS_TOTAL, rng: { ...state.rng, research: stream } };
    state = ok(launchResearch(state, 2));
    const after = endSol(state);

    const [min, max] = rewardRange(1);
    const expected = wholeBetween(drawMany(stream, RESEARCH_DRAWS_PER_SOL).values[4 + 1] ?? 0, min, max);
    expect(after.status).toBe('won');
    expect(crew(after, 2).status).toBe('base');
    expect(after.research).toBe(expected);
    expect(after.log.some((e) => e.text.startsWith('The mission is ending'))).toBe(true);
  });

  it('forceReturnAtMissionEnd uses the range for solsOutside and does not roll for sickness', () => {
    const base = richGame();
    const state = withCrew({ ...base, sol: SOLS_TOTAL }, { 3: { status: 'expedition', solsOutside: 3 } });
    const before = state.rng.research;
    const after = forceReturnAtMissionEnd(state, before);
    const [min, max] = rewardRange(3);
    expect(after.research).toBe(wholeBetween(drawMany(before, 8).values[4 + 2] ?? 0, min, max));
    expect(crew(after, 3).status).toBe('base');
    expect(after.rng).toEqual(state.rng);
  });
});

describe('starsFor', () => {
  // Built from the constants, so these tests keep working when the marks are tuned.
  function finished(research: number, statuses: readonly CrewStatus[] = ['base', 'base', 'base', 'base']): GameState {
    const base = newGame();
    return {
      ...base,
      status: 'won',
      sol: SOLS_TOTAL,
      research,
      crew: base.crew.map((m, i) => ({ ...m, status: statuses[i] ?? 'base' })),
    };
  }

  it('the higher mark is above the benchmark', () => {
    expect(STARS_3_RESEARCH).toBeGreaterThan(STARS_2_RESEARCH);
  });

  it('a win below the benchmark gives 1 star', () => {
    expect(starsFor(finished(0))).toBe(1);
    expect(starsFor(finished(STARS_2_RESEARCH - 1))).toBe(1);
  });

  it('a win at the benchmark gives 2 stars', () => {
    expect(starsFor(finished(STARS_2_RESEARCH))).toBe(2);
  });

  it('the higher mark with one crew member evacuated gives 2 stars', () => {
    expect(starsFor(finished(STARS_3_RESEARCH, ['base', 'base', 'base', 'evacuated']))).toBe(2);
    expect(starsFor(finished(STARS_3_RESEARCH + 500, ['evacuated', 'evacuated', 'evacuated', 'base']))).toBe(2);
  });

  it('the higher mark with all four on Mars gives 3 stars', () => {
    expect(starsFor(finished(STARS_3_RESEARCH))).toBe(3);
  });

  it('a sick crew member still counts as on Mars', () => {
    expect(starsFor(finished(STARS_3_RESEARCH, ['sick', 'base', 'sick', 'base']))).toBe(3);
  });

  it('a full crew just below the higher mark gives 2 stars', () => {
    expect(starsFor(finished(STARS_3_RESEARCH - 1))).toBe(2);
  });

  it('a full crew below the benchmark gives 1 star', () => {
    expect(starsFor(finished(STARS_2_RESEARCH - 1))).toBe(1);
  });

  it('a lost or unfinished mission earns no stars', () => {
    expect(starsFor({ ...finished(STARS_3_RESEARCH), status: 'lost' })).toBe(0);
    expect(starsFor({ ...finished(STARS_3_RESEARCH), status: 'playing' })).toBe(0);
  });

  it('starGoals reports each goal for the end-screen checklist', () => {
    expect(starGoals(finished(STARS_3_RESEARCH, ['base', 'base', 'base', 'evacuated']))).toEqual({
      won: true,
      research: true,
      fullCrew: false,
    });
    expect(starGoals(finished(0))).toEqual({ won: true, research: false, fullCrew: false });
    expect(starGoals({ ...finished(STARS_3_RESEARCH), status: 'lost' })).toEqual({
      won: false,
      research: false,
      fullCrew: false,
    });
  });
});

describe('starProgress', () => {
  function during(research: number, statuses: readonly CrewStatus[] = ['base', 'base', 'base', 'base']): GameState {
    const base = newGame();
    return { ...base, sol: 12, research, crew: base.crew.map((m, i) => ({ ...m, status: statuses[i] ?? 'base' })) };
  }

  it('below the benchmark: everything is still open', () => {
    expect(starProgress(during(STARS_2_RESEARCH - 1))).toEqual({ finish: 'open', research: 'open', fullCrew: 'open' });
  });

  it('at the benchmark: star 2 is lit', () => {
    expect(starProgress(during(STARS_2_RESEARCH))).toEqual({ finish: 'open', research: 'lit', fullCrew: 'open' });
  });

  it('at the higher mark with a full crew: stars 2 and 3 are lit', () => {
    expect(starProgress(during(STARS_3_RESEARCH))).toEqual({ finish: 'open', research: 'lit', fullCrew: 'lit' });
  });

  it('at the higher mark after an evacuation: star 3 is out of reach', () => {
    expect(starProgress(during(STARS_3_RESEARCH, ['base', 'evacuated', 'base', 'base']))).toEqual({
      finish: 'open',
      research: 'lit',
      fullCrew: 'out-of-reach',
    });
    expect(starProgress(during(0, ['base', 'evacuated', 'base', 'base'])).fullCrew).toBe('out-of-reach');
  });

  it('a sick crew member still counts as on Mars', () => {
    expect(starProgress(during(STARS_3_RESEARCH, ['sick', 'base', 'sick', 'base'])).fullCrew).toBe('lit');
  });

  it('star 1 is never lit during play, only when the mission is won', () => {
    expect(starProgress(during(1000)).finish).toBe('open');
    expect(starProgress({ ...during(0), status: 'won' }).finish).toBe('lit');
  });

  it('agrees with starsFor for every kind of won game', () => {
    const crews: CrewStatus[][] = [
      ['base', 'base', 'base', 'base'],
      ['sick', 'base', 'base', 'sick'],
      ['base', 'base', 'base', 'evacuated'],
      ['evacuated', 'evacuated', 'evacuated', 'sick'],
    ];
    const scores = [0, 1, STARS_2_RESEARCH - 1, STARS_2_RESEARCH, STARS_3_RESEARCH - 1, STARS_3_RESEARCH, STARS_3_RESEARCH + 90];
    for (const crewStatuses of crews) {
      for (const research of scores) {
        const game = { ...during(research, crewStatuses), status: 'won' as const, sol: SOLS_TOTAL };
        expect(litStars(starProgress(game))).toBe(starsFor(game));
      }
    }
  });

  it('agrees with starsFor for games played to the end', () => {
    let checked = 0;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 150; seed += 1) {
      let state = { ...newGame(seed, [9, 20]), power: 100_000 };
      while (state.status === 'playing') {
        state = ok(buyLifeSupport(state, 12));
        // Every fifth seed skips the shields on the first flare night, so some winning games lose crew.
        const shielding = state.sol === 20 || (state.sol === 9 && seed % 5 !== 0) ? 17 : 2;
        state = ok(buyShielding(state, shielding));
        const free = state.crew.find((m) => m.status === 'base' && launchResearch(state, m.id).error === undefined);
        if (free !== undefined && seed % 3 !== 0) state = ok(launchResearch(state, free.id));
        state = endSol(state);
      }
      if (state.status === 'won') {
        checked += 1;
        seen.add(`${starsFor(state)}-${starProgress(state).fullCrew}`);
        expect(litStars(starProgress(state))).toBe(starsFor(state));
      } else {
        expect(starsFor(state)).toBe(0);
      }
    }
    expect(checked).toBeGreaterThan(50);
    // Wins with 1, 2 and 3 stars, with star 3 still possible and out of reach.
    for (const outcome of ['1-open', '2-open', '3-lit', '1-out-of-reach']) expect(seen).toContain(outcome);
  });
});
