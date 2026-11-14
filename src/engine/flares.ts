import {
  FLARE_CLASS_ORDER,
  FLARE_THRESHOLD_MIN_CLASS,
  SCENARIO_LENGTH_DAYS,
  SEED_FLARE_ID_SEPARATOR,
} from './constants';
import { fnv1a } from './rng';
import type { FlareRecord, FlareThreshold, Scenario } from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PEAK_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;
const CLASS_PATTERN = /^([A-Z])(\d+(?:\.\d+)?)$/;

// ---------- Flare classes ----------

interface ParsedClass {
  rank: number; // position in A, B, C, M, X
  size: number; // the number after the letter
}

/** Reads a class such as "M2.3". Returns null if it cannot be read. */
export function parseClass(classType: string | null | undefined): ParsedClass | null {
  if (typeof classType !== 'string') {
    return null;
  }
  const match = CLASS_PATTERN.exec(classType.trim());
  if (!match) {
    return null;
  }
  const rank = FLARE_CLASS_ORDER.indexOf(match[1] ?? '');
  const size = Number(match[2]);
  if (rank < 0 || !Number.isFinite(size)) {
    return null;
  }
  return { rank, size };
}

/**
 * Negative if a is weaker than b, 0 if equal, positive if stronger.
 * Ranks by letter (A < B < C < M < X), then by the number.
 * A class that cannot be read ranks below every readable class.
 */
export function compareClass(a: string, b: string): number {
  const pa = parseClass(a);
  const pb = parseClass(b);
  if (!pa || !pb) {
    return (pa ? 1 : 0) - (pb ? 1 : 0);
  }
  if (pa.rank !== pb.rank) {
    return pa.rank - pb.rank;
  }
  return pa.size - pb.size;
}

/** True if the class is at or above the scenario threshold. */
export function meetsThreshold(classType: string | null | undefined, threshold: FlareThreshold): boolean {
  if (parseClass(classType) === null) {
    return false;
  }
  return compareClass(classType as string, FLARE_THRESHOLD_MIN_CLASS[threshold]) >= 0;
}

// ---------- Dates and sols ----------

/** Milliseconds for 00:00 UTC on a YYYY-MM-DD date, or null if unreadable. */
function dateStartMs(date: string): number | null {
  if (!DATE_PATTERN.test(date)) {
    return null;
  }
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const ms = dateStartMs(date);
  if (ms === null) {
    throw new Error(`Not a valid date: ${date}`);
  }
  return new Date(ms + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** True if the text is a real YYYY-MM-DD date. */
export function isValidDate(date: string): boolean {
  const ms = dateStartMs(date);
  return ms !== null && new Date(ms).toISOString().slice(0, 10) === date;
}

/**
 * Sol of a peak time: whole days since startDate 00:00 UTC, plus 1.
 * Returns null if the peak time cannot be read. May be outside 1 to 28.
 */
export function solOf(peakTime: string | null | undefined, startDate: string): number | null {
  if (typeof peakTime !== 'string' || !PEAK_TIME_PATTERN.test(peakTime)) {
    return null;
  }
  const start = dateStartMs(startDate);
  const peak = Date.parse(peakTime);
  if (start === null || Number.isNaN(peak)) {
    return null;
  }
  return Math.floor((peak - start) / MS_PER_DAY) + 1;
}

/** True if the record has a readable classType and peakTime. */
export function isReadableFlare(flare: FlareRecord): boolean {
  return parseClass(flare.classType) !== null && solOf(flare.peakTime, '2000-01-01') !== null;
}

/** Sorted flare sols for a list of flares at a given threshold. */
export function flareSolsAt(
  flares: readonly FlareRecord[],
  startDate: string,
  threshold: FlareThreshold,
): number[] {
  const sols = new Set<number>();
  for (const flare of flares) {
    if (!meetsThreshold(flare.classType, threshold)) {
      continue;
    }
    const sol = solOf(flare.peakTime, startDate);
    if (sol !== null && sol >= 1 && sol <= SCENARIO_LENGTH_DAYS) {
      sols.add(sol);
    }
  }
  return [...sols].sort((a, b) => a - b);
}

/**
 * The flares that make each flare sol, strongest first, for showing the real
 * dates and classes behind the game. Only flares at or above the threshold,
 * inside the 28 sols.
 */
export function flaresBySol(scenario: Scenario): Map<number, FlareRecord[]> {
  const bySol = new Map<number, FlareRecord[]>();
  for (const flare of scenario.flares) {
    if (!meetsThreshold(flare.classType, scenario.threshold)) {
      continue;
    }
    const sol = solOf(flare.peakTime, scenario.startDate);
    if (sol === null || sol < 1 || sol > SCENARIO_LENGTH_DAYS) {
      continue;
    }
    bySol.set(sol, [...(bySol.get(sol) ?? []), flare]);
  }
  for (const [sol, flares] of bySol) {
    bySol.set(
      sol,
      [...flares].sort((a, b) => compareClass(b.classType ?? '', a.classType ?? '')),
    );
  }
  return bySol;
}

/** The scenario's flare sols, sorted. */
export function flareSols(scenario: Scenario): number[] {
  return flareSolsAt(scenario.flares, scenario.startDate, scenario.threshold);
}

// ---------- Seed ----------

/**
 * FNV-1a of every flrID in the file (including flares below the threshold,
 * outside the 28 sols, or unreadable), sorted as plain strings and joined with "|".
 */
export function seedFor(scenario: Scenario): number {
  const ids = scenario.flares.map((f) => f.flrID).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return fnv1a(ids.join(SEED_FLARE_ID_SEPARATOR));
}

// ---------- Scenario files ----------

/**
 * Every scenario file in src/data/scenarios, sorted by id.
 * The files are bundled at build time; nothing is read from the page or network.
 * Works under Vite and Vitest only (not under plain Node / tsx).
 */
export function loadScenarios(): Scenario[] {
  const modules = import.meta.glob<Scenario>('../data/scenarios/*.json', {
    eager: true,
    import: 'default',
  });
  return Object.values(modules).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
