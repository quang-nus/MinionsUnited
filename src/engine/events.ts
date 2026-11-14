import {
  CREW_SIZE,
  MAX_SICK_FROM_ROLLS,
  NEW_SICKNESS_PERCENT,
  RECOVERY_BASE_PERCENT,
  RECOVERY_PER_SOL_SICK_PERCENT,
  STORM_DRAWS_PER_SOL,
  STORM_LENGTH_SOLS,
  STORM_START_PERCENT,
} from './constants';
import { chance, drawMany } from './rng';
import type { CrewMember, GameState, LogEntry, LogTag } from './types';

function addLog(log: readonly LogEntry[], sol: number, text: string, tag: LogTag): LogEntry[] {
  return [...log, { sol, text, tag }];
}

function idsInOrder(crew: readonly CrewMember[]): number[] {
  return crew.map((m) => m.id).sort((a, b) => a - b);
}

// ---------- Sickness ----------

/**
 * Rolls for sickness once per crew member, in id order.
 *
 * Always takes exactly CREW_SIZE draws from the sickness stream (one per crew
 * member, evacuated crew included), so the stream stays in step whatever the
 * player does. `percentFor` returns the chance for a crew member, or null if
 * they do not roll here; their draw is then taken and ignored.
 *
 * The cap is checked roll by roll: while MAX_SICK_FROM_ROLLS or more crew are
 * sick, a successful roll has no effect.
 */
export function rollSickness(
  state: GameState,
  percentFor: (member: CrewMember) => number | null,
  logText: (member: CrewMember) => string,
): GameState {
  const { values, nextState } = drawMany(state.rng.sickness, CREW_SIZE);
  const ids = idsInOrder(state.crew);

  let crew = state.crew;
  let log: LogEntry[] = state.log;

  ids.forEach((id, index) => {
    const member = crew.find((m) => m.id === id);
    const value = values[index];
    if (member === undefined || value === undefined) {
      return;
    }
    const percent = percentFor(member);
    if (percent === null || !chance(value, percent)) {
      return;
    }
    const sickNow = crew.filter((m) => m.status === 'sick').length;
    if (sickNow >= MAX_SICK_FROM_ROLLS) {
      return;
    }
    crew = crew.map((m) => (m.id === id ? { ...m, status: 'sick', solsSick: 0 } : m));
    log = addLog(log, state.sol, logText(member), 'sick');
  });

  return {
    ...state,
    crew,
    log,
    rng: { ...state.rng, sickness: nextState },
  };
}

/** End of sol, step 5: healthy crew at the base who did not return this sol roll at 5%. */
export function rollNewSickness(state: GameState, returnedIds: readonly number[]): GameState {
  const returned = new Set(returnedIds);
  return rollSickness(
    state,
    (member) => (member.status === 'base' && !returned.has(member.id) ? NEW_SICKNESS_PERCENT : null),
    (member) => `${member.name} is not feeling well and needs to rest.`,
  );
}

// ---------- Recovery ----------

/**
 * Start of sol, step 2: each sick crew member adds a sol to solsSick, then
 * recovers with chance 50% + 10% x solsSick. Always takes CREW_SIZE sickness draws.
 */
export function recoverSick(state: GameState): GameState {
  const { values, nextState } = drawMany(state.rng.sickness, CREW_SIZE);
  const ids = idsInOrder(state.crew);

  let crew = state.crew;
  let log = state.log;

  ids.forEach((id, index) => {
    const member = crew.find((m) => m.id === id);
    if (member === undefined || member.status !== 'sick') {
      return;
    }
    const solsSick = member.solsSick + 1;
    const percent = RECOVERY_BASE_PERCENT + RECOVERY_PER_SOL_SICK_PERCENT * solsSick;
    if (chance(values[index] ?? 1, percent)) {
      crew = crew.map((m) => (m.id === id ? { ...m, status: 'base', solsSick: 0 } : m));
      log = addLog(log, state.sol, `${member.name} feels better and is back to work!`, 'recovered');
    } else {
      crew = crew.map((m) => (m.id === id ? { ...m, solsSick } : m));
    }
  });

  return { ...state, crew, log, rng: { ...state.rng, sickness: nextState } };
}

// ---------- Dust storm ----------

/**
 * Start of sol, step 3: if no storm is active, start one with a 6% chance.
 * Always takes STORM_DRAWS_PER_SOL draws from the storm stream.
 */
export function rollDustStorm(state: GameState): GameState {
  const { values, nextState } = drawMany(state.rng.storm, STORM_DRAWS_PER_SOL);
  const rng = { ...state.rng, storm: nextState };

  if (state.stormSolsLeft > 0 || !chance(values[0] ?? 1, STORM_START_PERCENT)) {
    return { ...state, rng };
  }
  return {
    ...state,
    rng,
    stormSolsLeft: STORM_LENGTH_SOLS,
    log: addLog(
      state.log,
      state.sol,
      `A dust storm is covering the solar panels! They will make less power for ${STORM_LENGTH_SOLS} sols.`,
      'storm',
    ),
  };
}
