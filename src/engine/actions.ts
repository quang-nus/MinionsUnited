import { CURE_LIFE_SUPPORT_COST, LIFE_SUPPORT_POWER_COST, SHIELDING_POWER_COST } from './constants';
import type { ActionResult, GameState } from './types';

function refuse(state: GameState, error: string): ActionResult {
  return { state, error };
}

/** Shared checks for buying with power. Returns an error message, or null if allowed. */
function checkPurchase(state: GameState, units: number, costPerUnit: number): string | null {
  if (state.status !== 'playing') {
    return 'The mission is over.';
  }
  if (!Number.isInteger(units) || units < 1) {
    return 'Choose a whole number, 1 or more.';
  }
  const cost = units * costPerUnit;
  if (cost > state.power) {
    return `You need ${cost} power, but you only have ${state.power}.`;
  }
  return null;
}

export function buyLifeSupport(state: GameState, units: number): ActionResult {
  const error = checkPurchase(state, units, LIFE_SUPPORT_POWER_COST);
  if (error !== null) {
    return refuse(state, error);
  }
  return {
    state: {
      ...state,
      power: state.power - units * LIFE_SUPPORT_POWER_COST,
      lifeSupport: state.lifeSupport + units,
    },
  };
}

export function buyShielding(state: GameState, units: number): ActionResult {
  const error = checkPurchase(state, units, SHIELDING_POWER_COST);
  if (error !== null) {
    return refuse(state, error);
  }
  return {
    state: {
      ...state,
      power: state.power - units * SHIELDING_POWER_COST,
      shielding: state.shielding + units,
    },
  };
}

export function cure(state: GameState, crewId: number): ActionResult {
  if (state.status !== 'playing') {
    return refuse(state, 'The mission is over.');
  }
  const member = state.crew.find((m) => m.id === crewId);
  if (member === undefined) {
    return refuse(state, 'There is no crew member with that name.');
  }
  if (member.status !== 'sick') {
    return refuse(state, `${member.name} is not sick.`);
  }
  if (state.lifeSupport < CURE_LIFE_SUPPORT_COST) {
    return refuse(
      state,
      `Medicine needs ${CURE_LIFE_SUPPORT_COST} life support, but you only have ${state.lifeSupport}.`,
    );
  }
  return {
    state: {
      ...state,
      lifeSupport: state.lifeSupport - CURE_LIFE_SUPPORT_COST,
      crew: state.crew.map((m) => (m.id === crewId ? { ...m, status: 'base', solsSick: 0 } : m)),
      log: [
        ...state.log,
        { sol: state.sol, text: `${member.name} took some medicine and feels better!`, tag: 'cure' },
      ],
    },
  };
}

// Research trips and communication live in their own files; re-exported so every
// player action comes from here.
export { requestComms } from './comms';
export { launchResearch } from './research';
