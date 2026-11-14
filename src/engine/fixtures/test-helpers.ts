// TEST ONLY helpers. Never import this file outside *.test.ts files.

import { expect } from 'vitest';
import { SICKNESS_DRAWS_PER_SOL } from '../constants';
import { lifeSupportTonight } from '../day';
import { drawMany, fnv1a } from '../rng';
import type { ActionResult, CrewMember, CrewStatus, GameState } from '../types';

export function ok(result: ActionResult): GameState {
  expect(result.error).toBeUndefined();
  return result.state;
}

export function withCrew(
  state: GameState,
  changes: Partial<Record<number, Partial<CrewMember>>>,
): GameState {
  return { ...state, crew: state.crew.map((m) => ({ ...m, ...changes[m.id] })) };
}

export function crewMember(state: GameState, id: number): CrewMember {
  const member = state.crew.find((m) => m.id === id);
  if (member === undefined) throw new Error(`no crew ${id}`);
  return member;
}

export function statuses(state: GameState): CrewStatus[] {
  return state.crew.map((m) => m.status);
}

export function countStatus(state: GameState, status: CrewStatus): number {
  return state.crew.filter((m) => m.status === status).length;
}

/** Life support the crew will need at the end of this sol (the engine's own rule). */
export function lifeSupportNeed(state: GameState): number {
  return lifeSupportTonight(state);
}

let quietStream: number | undefined;

/**
 * A sickness stream state where, for one whole night and the next morning,
 * no sickness roll succeeds (shielding 30%, return up to 55%, new 5%) and
 * nobody recovers (first-morning chance 60%). Lets tests check exact statuses.
 */
export function quietSicknessStream(): number {
  if (quietStream !== undefined) return quietStream;
  for (let i = 0; ; i += 1) {
    const candidate = fnv1a(`quiet-${i}`);
    const v = drawMany(candidate, SICKNESS_DRAWS_PER_SOL).values;
    const atLeast = (from: number, to: number, min: number) =>
      v.slice(from, to).every((x) => x >= min);
    if (atLeast(0, 4, 0.3) && atLeast(4, 8, 0.55) && atLeast(8, 12, 0.05) && atLeast(12, 16, 0.6)) {
      quietStream = candidate;
      return candidate;
    }
  }
}

/** The same state with the quiet sickness stream. */
export function quiet(state: GameState): GameState {
  return { ...state, rng: { ...state.rng, sickness: quietSicknessStream() } };
}
