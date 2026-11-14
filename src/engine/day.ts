import {
  CREW_NAME_MAX_LENGTH,
  CREW_NAMES,
  CREW_SIZE,
  DAILY_SHIELDING_USE,
  FLARE_EVACUATIONS_UNSHIELDED,
  FLARE_SHIELDING_USE,
  INCOME_BASE,
  INCOME_EVACUATED,
  INCOME_EXPEDITION,
  INCOME_SICK,
  LIFE_SUPPORT_NEED_BASE,
  LIFE_SUPPORT_NEED_EXPEDITION,
  LIFE_SUPPORT_NEED_SICK,
  SHIELDING_SHORTAGE_SICKNESS_PERCENT,
  SOLS_TOTAL,
  START_LIFE_SUPPORT,
  START_POWER,
  START_RESEARCH,
  START_SHIELDING,
  START_SOL,
  STORM_INCOME_PENALTY,
} from './constants';
import { makeForecast } from './comms';
import { recoverSick, rollDustStorm, rollNewSickness, rollSickness } from './events';
import { forceReturnAtMissionEnd, resolveExpeditions } from './research';
import { deriveStreams } from './rng';
import type { CrewMember, CrewStatus, GameState, LogEntry, LogTag } from './types';

function addLog(log: readonly LogEntry[], sol: number, text: string, tag: LogTag): LogEntry[] {
  return [...log, { sol, text, tag }];
}

function byId(crew: readonly CrewMember[]): CrewMember[] {
  return [...crew].sort((a, b) => a.id - b.id);
}

// Control characters (C0, DEL and C1), removed from names.
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g;

/** The default name for the crew member at this position (0-based). */
export function defaultCrewName(index: number): string {
  return CREW_NAMES[index] ?? `Crew ${index + 1}`;
}

/**
 * Cleans a typed crew name: removes control characters, collapses repeated
 * spaces, trims both ends and cuts it to CREW_NAME_MAX_LENGTH characters.
 * An empty result gives `fallback`. Names never affect any rule or random draw.
 */
export function cleanCrewName(raw: string, fallback: string): string {
  const tidy = raw.replace(CONTROL_CHARACTERS, '').replace(/\s+/g, ' ').trim();
  const cut = Array.from(tidy).slice(0, CREW_NAME_MAX_LENGTH).join('').trim();
  return cut === '' ? fallback : cut;
}

/** Cleans a list of typed names, one per crew position, falling back to the defaults. */
export function cleanCrewNames(names: readonly string[] | undefined): string[] {
  return Array.from({ length: CREW_SIZE }, (_, index) =>
    cleanCrewName(names?.[index] ?? '', defaultCrewName(index)),
  );
}

/**
 * The game before the first morning. Call startSol on it once to begin sol 1
 * (or use startGame, which does both). `crewNames` is optional; missing or
 * empty names fall back to CREW_NAMES.
 */
export function createInitialState(
  scenarioId: string,
  seed: number,
  flareSols: readonly number[],
  crewNames?: readonly string[],
): GameState {
  const names = cleanCrewNames(crewNames);
  const crew: CrewMember[] = Array.from({ length: CREW_SIZE }, (_, index) => ({
    id: index + 1,
    name: names[index] ?? defaultCrewName(index),
    status: 'base',
    solsOutside: 0,
    solsSick: 0,
  }));
  return {
    sol: START_SOL,
    power: START_POWER,
    lifeSupport: START_LIFE_SUPPORT,
    shielding: START_SHIELDING,
    research: START_RESEARCH,
    crew,
    flareSols: [...flareSols].sort((a, b) => a - b),
    stormSolsLeft: 0,
    commsRequestedOnSol: null,
    forecast: null,
    forecastUntil: null,
    log: [
      {
        sol: START_SOL,
        text: `Welcome to Mars! A sol is one day on Mars. Keep your ${CREW_SIZE} crew safe for ${SOLS_TOTAL} sols.`,
        tag: 'routine',
      },
    ],
    seed: seed >>> 0,
    rng: deriveStreams(seed),
    status: 'playing',
    scenarioId,
  };
}

/** createInitialState followed by the first morning. */
export function startGame(
  scenarioId: string,
  seed: number,
  flareSols: readonly number[],
  crewNames?: readonly string[],
): GameState {
  return startSol(createInitialState(scenarioId, seed, flareSols, crewNames));
}

// ---------- Start of sol ----------

function incomeFor(member: CrewMember, storm: boolean): number {
  const penalty = storm ? STORM_INCOME_PENALTY : 0;
  switch (member.status) {
    case 'base':
      return Math.max(0, INCOME_BASE - penalty);
    case 'sick':
      return Math.max(0, INCOME_SICK - penalty);
    case 'expedition':
      return INCOME_EXPEDITION;
    case 'evacuated':
      return INCOME_EVACUATED;
  }
}

/** Step 4: power from every crew member, lower during a storm; then the storm counts down. */
function collectIncome(state: GameState): GameState {
  const storm = state.stormSolsLeft > 0;
  const income = state.crew.reduce((sum, member) => sum + incomeFor(member, storm), 0);
  let log = storm
    ? addLog(state.log, state.sol, `Dust storm! The solar panels made only ${income} power today.`, 'storm')
    : addLog(state.log, state.sol, `Your solar panels made ${income} power.`, 'routine');
  const stormSolsLeft = storm ? state.stormSolsLeft - 1 : 0;
  if (storm && stormSolsLeft === 0) {
    log = addLog(log, state.sol, 'The dust storm is over. Full power comes back tomorrow.', 'storm');
  }
  return { ...state, power: state.power + income, stormSolsLeft, log };
}

/**
 * Start of each sol, in order: (1) forecast (or clear yesterday's);
 * (2) recovery; (3) dust storm; (4) income, then the storm counts down.
 */
export function startSol(state: GameState): GameState {
  if (state.status !== 'playing') {
    return state;
  }
  let next: GameState = {
    ...state,
    log: addLog(state.log, state.sol, `Good morning! Sol ${state.sol} has begun.`, 'routine'),
  };
  next = makeForecast(next);
  next = recoverSick(next);
  next = rollDustStorm(next);
  next = collectIncome(next);
  return next;
}

// ---------- End of sol ----------

/** Life support a crew member needs at the end of the sol. */
export function lifeSupportNeedOf(member: CrewMember): number {
  switch (member.status) {
    case 'base':
      return LIFE_SUPPORT_NEED_BASE;
    case 'sick':
      return LIFE_SUPPORT_NEED_SICK;
    case 'expedition':
      return LIFE_SUPPORT_NEED_EXPEDITION;
    case 'evacuated':
      return 0;
  }
}

/** Life support the whole crew will use tonight, if there is enough. */
export function lifeSupportTonight(state: GameState): number {
  return state.crew.reduce((sum, member) => sum + lifeSupportNeedOf(member), 0);
}

/** Shielding the base uses every night, before any flare. Anything left after the night wears out. */
export function shieldingTonight(): number {
  return DAILY_SHIELDING_USE;
}

/** True if the current forecast names tonight as a possible flare. */
export function flareForecastTonight(state: GameState): boolean {
  return typeof state.forecast === 'object' && state.forecast !== null && state.forecast.sol === state.sol;
}

/** Shielding worth having tonight: the daily amount, plus a flare's if one is forecast for tonight. */
export function shieldingWanted(state: GameState): number {
  return shieldingTonight() + (flareForecastTonight(state) ? FLARE_SHIELDING_USE : 0);
}

/** Life support is served to healthy crew first, then sick crew, then crew outside. */
const LIFE_SUPPORT_ORDER: readonly CrewStatus[] = ['base', 'sick', 'expedition'];

function evacuate(member: CrewMember): CrewMember {
  return { ...member, status: 'evacuated', solsOutside: 0, solsSick: 0 };
}

/** Step 1: serve healthy, then sick, then expedition crew, each in id order. */
function useLifeSupport(state: GameState): GameState {
  let stock = state.lifeSupport;
  const evacuatedIds = new Set<number>();
  let log = state.log;

  for (const status of LIFE_SUPPORT_ORDER) {
    for (const member of byId(state.crew.filter((m) => m.status === status))) {
      const need = lifeSupportNeedOf(member);
      if (stock >= need) {
        stock -= need;
      } else {
        evacuatedIds.add(member.id);
        const lostResearch = member.status === 'expedition' ? ' Their research trip was lost.' : '';
        log = addLog(
          log,
          state.sol,
          `There was not enough life support for ${member.name}. ${member.name} was evacuated to the rescue ship.${lostResearch}`,
          'evacuated-life-support',
        );
      }
    }
  }

  return {
    ...state,
    lifeSupport: stock,
    crew: state.crew.map((m) => (evacuatedIds.has(m.id) ? evacuate(m) : m)),
    log,
  };
}

/**
 * Step 2: the base uses its daily shielding. If there was not enough, every
 * healthy crew member at the base rolls for sickness. The sickness draws are
 * taken every sol, short or not.
 */
function useDailyShielding(state: GameState): GameState {
  const short = state.shielding < shieldingTonight();
  let next: GameState = {
    ...state,
    shielding: short ? 0 : state.shielding - shieldingTonight(),
    log: short
      ? addLog(
          state.log,
          state.sol,
          `The shielding ran low today. The base needs ${DAILY_SHIELDING_USE} every sol to block radiation.`,
          'shielding-low',
        )
      : state.log,
  };
  next = rollSickness(
    next,
    (member) => (short && member.status === 'base' ? SHIELDING_SHORTAGE_SICKNESS_PERCENT : null),
    (member) => `Without enough shielding, space radiation made ${member.name} sick.`,
  );
  return next;
}

/**
 * The crew members a flare sends to the rescue ship when the shields are too
 * weak: up to FLARE_EVACUATIONS_UNSHIELDED crew at the base, sick first, then
 * healthy, highest id first within each group.
 */
function flareEvacuees(crew: readonly CrewMember[]): CrewMember[] {
  const order = [
    ...byId(crew.filter((m) => m.status === 'sick')).reverse(),
    ...byId(crew.filter((m) => m.status === 'base')).reverse(),
  ];
  return order.slice(0, FLARE_EVACUATIONS_UNSHIELDED);
}

function namesList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Step 3: a solar flare, only on flare sols. */
function solarFlare(state: GameState): GameState {
  if (!state.flareSols.includes(state.sol)) {
    return state;
  }
  let log = state.log;

  // Everyone outside hurries back, sick, with no research. Flare sickness ignores the cap.
  const outside = byId(state.crew.filter((m) => m.status === 'expedition'));
  let crew = state.crew.map((m) =>
    m.status === 'expedition' ? { ...m, status: 'sick' as const, solsOutside: 0, solsSick: 0 } : m,
  );
  for (const member of outside) {
    log = addLog(
      log,
      state.sol,
      `A solar flare hit while ${member.name} was outside! ${member.name} hurried back sick and lost the research.`,
      'flare',
    );
  }

  if (state.shielding >= FLARE_SHIELDING_USE) {
    return {
      ...state,
      crew,
      shielding: state.shielding - FLARE_SHIELDING_USE,
      log: addLog(log, state.sol, 'A solar flare hit! Your shields held.', 'flare'),
    };
  }

  const evacuees = flareEvacuees(crew);
  if (evacuees.length === 0) {
    log = addLog(log, state.sol, 'A solar flare hit the empty base.', 'flare');
  } else {
    const ids = new Set(evacuees.map((m) => m.id));
    crew = crew.map((m) => (ids.has(m.id) ? evacuate(m) : m));
    const who = namesList(evacuees.map((m) => m.name));
    const verb = evacuees.length === 1 ? 'was' : 'were';
    log = addLog(
      log,
      state.sol,
      `A solar flare hit and the shields were too weak. ${who} ${verb} evacuated to the rescue ship. A flare needs ${FLARE_SHIELDING_USE} more shielding.`,
      'evacuated-flare',
    );
  }
  return { ...state, crew, shielding: 0, log };
}

/** After the daily use and any flare, leftover shielding wears out overnight. */
function shieldsWearOut(state: GameState): GameState {
  if (state.shielding <= 0) {
    return state;
  }
  return {
    ...state,
    shielding: 0,
    log: addLog(
      state.log,
      state.sol,
      `The ${state.shielding} shielding left over wore out overnight. Shields last one night.`,
      'shielding-worn',
    ),
  };
}

/** Step 6: decide if the game is over, otherwise begin the next sol. */
function finishSol(state: GameState): GameState {
  if (state.crew.every((m) => m.status === 'evacuated')) {
    return {
      ...state,
      status: 'lost',
      log: addLog(
        state.log,
        state.sol,
        `Everyone has been evacuated to the rescue ship. The mission is over. You collected ${state.research} research.`,
        'end',
      ),
    };
  }
  if (state.sol >= SOLS_TOTAL) {
    return {
      ...state,
      status: 'won',
      log: addLog(
        state.log,
        state.sol,
        `You made it through all ${SOLS_TOTAL} sols! You collected ${state.research} research.`,
        'end',
      ),
    };
  }
  return startSol({ ...state, sol: state.sol + 1 });
}

export function endSol(state: GameState): GameState {
  if (state.status !== 'playing') {
    return state;
  }
  let next = useLifeSupport(state);
  next = useDailyShielding(next);
  next = solarFlare(next);
  next = shieldsWearOut(next);

  const researchStreamBeforeStep4 = next.rng.research;
  const expeditions = resolveExpeditions(next);
  next = rollNewSickness(expeditions.state, expeditions.returnedIds);

  if (next.sol >= SOLS_TOTAL) {
    next = forceReturnAtMissionEnd(next, researchStreamBeforeStep4);
  }
  return finishSol(next);
}
