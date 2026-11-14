import {
  CREW_SIZE,
  MIN_CREW_AT_BASE_FOR_LAUNCH,
  RESEARCH_DRAWS_PER_SOL,
  RESEARCH_LAUNCH_LIFE_SUPPORT_COST,
  RESEARCH_REWARD_RANGES,
  RETURN_BASE_PERCENT,
  RETURN_PER_SOL_OUTSIDE_PERCENT,
  RETURN_SICKNESS_BASE_PERCENT,
  RETURN_SICKNESS_PER_SOL_OUTSIDE_PERCENT,
  STARS_2_RESEARCH,
  STARS_3_RESEARCH,
} from './constants';
import { rollSickness } from './events';
import { chance, drawMany, wholeBetween } from './rng';
import type { ActionResult, CrewMember, GameState, LogEntry } from './types';

function addLog(log: readonly LogEntry[], sol: number, text: string): LogEntry[] {
  return [...log, { sol, text, tag: 'research' }];
}

function idsInOrder(crew: readonly CrewMember[]): number[] {
  return crew.map((m) => m.id).sort((a, b) => a - b);
}

/** Reward range for a trip of this many sols (clamped to the table). */
export function rewardRange(solsOutside: number): readonly [number, number] {
  const index = Math.min(Math.max(solsOutside, 1), RESEARCH_REWARD_RANGES.length) - 1;
  const range = RESEARCH_REWARD_RANGES[index];
  if (range === undefined) {
    throw new Error('RESEARCH_REWARD_RANGES is empty');
  }
  return range;
}

function returnText(member: CrewMember, sols: number, reward: number): string {
  const trip = sols === 1 ? '1 sol' : `${sols} sols`;
  return reward > 0
    ? `${member.name} came back after ${trip} outside with ${reward} research!`
    : `${member.name} came back after ${trip} outside, but found nothing new this time.`;
}

// ---------- Player action ----------

export function launchResearch(state: GameState, crewId: number): ActionResult {
  if (state.status !== 'playing') {
    return { state, error: 'The mission is over.' };
  }
  const member = state.crew.find((m) => m.id === crewId);
  if (member === undefined) {
    return { state, error: 'There is no crew member with that name.' };
  }
  switch (member.status) {
    case 'sick':
      return { state, error: `${member.name} is sick and must rest first.` };
    case 'expedition':
      return { state, error: `${member.name} is already outside.` };
    case 'evacuated':
      return { state, error: `${member.name} is on the rescue ship.` };
    case 'base':
      break;
  }
  const othersAtBase = state.crew.filter(
    (m) => m.id !== crewId && (m.status === 'base' || m.status === 'sick'),
  ).length;
  if (othersAtBase < MIN_CREW_AT_BASE_FOR_LAUNCH) {
    return { state, error: 'Someone has to stay at the base to look after it.' };
  }
  if (state.lifeSupport < RESEARCH_LAUNCH_LIFE_SUPPORT_COST) {
    return {
      state,
      error: `A research trip needs ${RESEARCH_LAUNCH_LIFE_SUPPORT_COST} life support, but you only have ${state.lifeSupport}.`,
    };
  }
  return {
    state: {
      ...state,
      lifeSupport: state.lifeSupport - RESEARCH_LAUNCH_LIFE_SUPPORT_COST,
      crew: state.crew.map((m) => (m.id === crewId ? { ...m, status: 'expedition', solsOutside: 0 } : m)),
      log: addLog(
        state.log,
        state.sol,
        `${member.name} set off to explore. Nobody knows when they will be back!`,
      ),
    },
  };
}

// ---------- End of sol, step 4 ----------

/**
 * Step 4 of endSol: expeditions still out.
 *
 * Always takes RESEARCH_DRAWS_PER_SOL draws from the research stream
 * (draws 0-3: return roll per crew in id order; draws 4-7: reward amount)
 * and CREW_SIZE draws from the sickness stream (sickness on return).
 * Returns the ids of crew who came back this way, for step 5.
 */
export function resolveExpeditions(state: GameState): { state: GameState; returnedIds: number[] } {
  const { values, nextState } = drawMany(state.rng.research, RESEARCH_DRAWS_PER_SOL);
  const ids = idsInOrder(state.crew);

  let crew = state.crew;
  let research = state.research;
  let log = state.log;
  const returnedIds: number[] = [];
  const sicknessPercent = new Map<number, number>();

  ids.forEach((id, index) => {
    const member = crew.find((m) => m.id === id);
    if (member === undefined || member.status !== 'expedition') {
      return;
    }
    const sols = member.solsOutside + 1;
    const returnValue = values[index] ?? 0;
    const rewardValue = values[CREW_SIZE + index] ?? 0;
    const returnPercent = RETURN_BASE_PERCENT + RETURN_PER_SOL_OUTSIDE_PERCENT * sols;

    if (!chance(returnValue, returnPercent)) {
      crew = crew.map((m) => (m.id === id ? { ...m, solsOutside: sols } : m));
      return;
    }

    const [min, max] = rewardRange(sols);
    const reward = wholeBetween(rewardValue, min, max);
    research += reward;
    returnedIds.push(id);
    sicknessPercent.set(id, RETURN_SICKNESS_BASE_PERCENT + RETURN_SICKNESS_PER_SOL_OUTSIDE_PERCENT * sols);
    crew = crew.map((m) => (m.id === id ? { ...m, status: 'base', solsOutside: 0 } : m));
    log = addLog(log, state.sol, returnText(member, sols, reward));
  });

  const next = rollSickness(
    { ...state, crew, research, log, rng: { ...state.rng, research: nextState } },
    (member) => sicknessPercent.get(member.id) ?? null,
    (member) => `${member.name} came back from outside feeling sick.`,
  );
  return { state: next, returnedIds };
}

// ---------- End of sol 28 ----------

/**
 * After the normal steps on the last sol, everyone still outside comes home.
 * Each uses their own reward draw from step 4 of the same sol (the one that was
 * taken and ignored), with the range for their solsOutside after that sol's
 * increase. No sickness roll. `researchStreamBeforeStep4` is rng.research as it
 * was when step 4 began.
 */
export function forceReturnAtMissionEnd(state: GameState, researchStreamBeforeStep4: number): GameState {
  const { values } = drawMany(researchStreamBeforeStep4, RESEARCH_DRAWS_PER_SOL);
  const ids = idsInOrder(state.crew);

  let crew = state.crew;
  let research = state.research;
  let log = state.log;

  ids.forEach((id, index) => {
    const member = crew.find((m) => m.id === id);
    if (member === undefined || member.status !== 'expedition') {
      return;
    }
    const sols = member.solsOutside;
    const [min, max] = rewardRange(sols);
    const reward = wholeBetween(values[CREW_SIZE + index] ?? 0, min, max);
    research += reward;
    crew = crew.map((m) => (m.id === id ? { ...m, status: 'base', solsOutside: 0 } : m));
    log = addLog(log, state.sol, `The mission is ending, so ${returnText(member, sols, reward)}`);
  });

  return { ...state, crew, research, log };
}

// ---------- Rating ----------

/** Stars for a won game: 1, 2 or 3, from the research collected. */
export function starsFor(research: number): 1 | 2 | 3 {
  if (research >= STARS_3_RESEARCH) return 3;
  if (research >= STARS_2_RESEARCH) return 2;
  return 1;
}
