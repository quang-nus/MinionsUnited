import { starChanges, starProgress, type StarChange, type StarProgress } from '../engine/research';
import { CREW_SIZE } from '../engine/constants';
import type { GameState } from '../engine/types';

/** What changed between two game states that deserves an animation or a sound. */
export interface NightEvents {
  /** A solar flare hit during the sol that just ended. */
  flare: boolean;
  /** Crew who were exploring and are now back at the base (healthy or sick). */
  returnedIds: number[];
  /** The sol moved on (or the game ended). */
  solEnded: boolean;
  /** Star slots gained, lost or put out of reach during the sol that ended. */
  stars: StarChange[];
  /** How the star slots looked before the sol ended, shown until the night's events are over. */
  starsBefore: StarProgress | null;
}

/** Night events with a counter that goes up at every end of sol, so animations can restart. */
export interface NumberedEvents {
  count: number;
  events: NightEvents;
}

export const NO_EVENTS: NightEvents = {
  flare: false,
  returnedIds: [],
  solEnded: false,
  stars: [],
  starsBefore: null,
};

/**
 * Compares the game before and after an update. Only an end of sol produces
 * events; buying things during the day produces none. With no earlier state
 * (a new game, a loaded save, Continue) there are no events, so nothing is
 * animated on load.
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
  const starsBefore = starProgress(before);
  return { flare, returnedIds, solEnded, stars: starChanges(starsBefore, starProgress(after)), starsBefore };
}

/** The one-line messages for a set of star changes. Crew are "evacuated", never anything worse. */
export function starMessages(changes: readonly StarChange[]): string[] {
  const lines: string[] = [];
  const gains = changes.filter((c) => c.kind === 'gained').length;
  if (gains === 1) lines.push('You earned a star!');
  if (gains > 1) lines.push(`You earned ${gains} stars!`);
  if (changes.some((c) => c.kind === 'lost')) lines.push('You lost a star. Everyone must stay on Mars for 3 stars.');
  if (changes.some((c) => c.kind === 'out-of-reach')) lines.push(`The third star needs all ${CREW_SIZE} crew on Mars.`);
  return lines;
}
