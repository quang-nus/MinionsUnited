import type { RngStreams, StreamName } from './types';

export interface Draw {
  value: number; // 0 up to (not including) 1
  nextState: number;
}

/** One step of mulberry32. Pure: same state in, same draw out. */
export function mulberry32(state: number): Draw {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let t = nextState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextState };
}

/** Takes `count` draws in a row from one stream. */
export function drawMany(state: number, count: number): { values: number[]; nextState: number } {
  const values: number[] = [];
  let current = state >>> 0;
  for (let i = 0; i < count; i += 1) {
    const draw = mulberry32(current);
    values.push(draw.value);
    current = draw.nextState;
  }
  return { values, nextState: current };
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a 32-bit hash of the UTF-8 bytes of a string. */
export function fnv1a(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

export const STREAM_NAMES: readonly StreamName[] = ['sickness', 'storm', 'research', 'comms'];

/** Start state of each stream = fnv1a(seed as decimal + ":" + stream name). */
export function deriveStreams(seed: number): RngStreams {
  const make = (name: StreamName) => fnv1a(`${seed >>> 0}:${name}`);
  return {
    sickness: make('sickness'),
    storm: make('storm'),
    research: make('research'),
    comms: make('comms'),
  };
}

/** True with the given percent chance, using one draw value. */
export function chance(value: number, percent: number): boolean {
  return value < percent / 100;
}

/** A whole number from min to max (both included), picked evenly using one draw value. */
export function wholeBetween(value: number, min: number, max: number): number {
  return min + Math.floor(value * (max - min + 1));
}

/** An index from 0 to count - 1, picked evenly using one draw value. */
export function pickIndex(value: number, count: number): number {
  return Math.floor(value * count);
}
