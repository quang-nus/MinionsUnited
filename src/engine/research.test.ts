import { describe, expect, it } from 'vitest';
import { buyLifeSupport, buyShielding, launchResearch } from './actions';
import {
  RESEARCH_DRAWS_PER_SOL,
  RESEARCH_LAUNCH_LIFE_SUPPORT_COST,
  RESEARCH_REWARD_RANGES,
  SOLS_TOTAL,
} from './constants';
import { endSol, startGame } from './day';
import { TEST_ONLY_SCENARIO } from './fixtures/test-scenario';
import { quiet } from './fixtures/test-helpers';
import { flareSols, seedFor } from './flares';
import { forceReturnAtMissionEnd, resolveExpeditions, rewardRange } from './research';
import { drawMany, fnv1a, wholeBetween } from './rng';
import type { ActionResult, CrewMember, GameState } from './types';

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
  it('a crew member is never outside more than 5 sols', () => {
    let longest = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
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
          expect(member.solsOutside).toBeLessThanOrEqual(RESEARCH_REWARD_RANGES.length - 1);
        }
      }
    }
    // solsOutside is stored after the sol's increase only for crew still out, so 4 is the most seen.
    expect(longest).toBe(4);
  });

  it('crew out for 4 sols always return on the 5th', () => {
    for (let i = 0; i < 2000; i += 1) {
      const state = withCrew(
        { ...richGame(), rng: { ...richGame().rng, research: fnv1a(`five-${i}`) } },
        { 2: { status: 'expedition', solsOutside: 4 } },
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

  it('over 10,000 expeditions about 60% return on their first sol', () => {
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
    expect(share).toBeGreaterThan(0.58);
    expect(share).toBeLessThan(0.62);
  });

  it('returning crew reset solsOutside and roll for sickness', () => {
    let sick = 0;
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
      const after = resolveExpeditions(state).state;
      expect(crew(after, 2).solsOutside).toBe(0);
      if (crew(after, 2).status === 'sick') sick += 1;
    }
    // 5 + 10 x 5 = 55% after a 5-sol trip.
    expect(sick / trials).toBeGreaterThan(0.52);
    expect(sick / trials).toBeLessThan(0.58);
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
  /** A research stream state whose return roll for crew `index` fails at 60%. */
  function streamWhereReturnFails(index: number): number {
    for (let i = 0; ; i += 1) {
      const candidate = fnv1a(`stay-out-${i}`);
      if ((drawMany(candidate, RESEARCH_DRAWS_PER_SOL).values[index] ?? 0) >= 0.6) return candidate;
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
  it('gives 1 star for any win, 2 from 100 research and 3 from 120', async () => {
    const { starsFor } = await import('./research');
    expect(starsFor(0)).toBe(1);
    expect(starsFor(99)).toBe(1);
    expect(starsFor(100)).toBe(2);
    expect(starsFor(119)).toBe(2);
    expect(starsFor(120)).toBe(3);
  });
});
