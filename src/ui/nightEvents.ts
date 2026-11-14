import type { GameState } from '../engine/types';

/** What changed between two game states that deserves an animation or a sound. */
export interface NightEvents {
  /** A solar flare hit during the sol that just ended. */
  flare: boolean;
  /** Crew who were exploring and are now back at the base (healthy or sick). */
  returnedIds: number[];
  /** The sol moved on (or the game ended). */
  solEnded: boolean;
}

/** Night events with a counter that goes up at every end of sol, so animations can restart. */
export interface NumberedEvents {
  count: number;
  events: NightEvents;
}

export const NO_EVENTS: NightEvents = { flare: false, returnedIds: [], solEnded: false };

/**
 * Compares the game before and after an update. Only an end of sol produces
 * events; buying things during the day produces none.
 */
export function nightEvents(before: GameState | null, after: GameState): NightEvents {
  if (before === null || before.scenarioId !== after.scenarioId || after.log.length < before.log.length) {
    return NO_EVENTS;
  }
  const solEnded = after.sol !== before.sol || after.status !== before.status;
  if (!solEnded) return NO_EVENTS;

  const newEntries = after.log.slice(before.log.length);
  const flare = newEntries.some((e) => e.sol === before.sol && (e.tag === 'flare' || e.tag === 'evacuated-flare'));
  const returnedIds = after.crew
    .filter((m) => {
      const was = before.crew.find((b) => b.id === m.id);
      return was?.status === 'expedition' && (m.status === 'base' || m.status === 'sick');
    })
    .map((m) => m.id);
  return { flare, returnedIds, solEnded };
}
