// Downloads NASA DONKI solar flare data for one 28-day window and saves it as a scenario.
//
// Usage:
//   npx tsx scripts/fetch-donki.ts --start 2017-09-01 --id storm-2017 --name "Storm Month"

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FLARE_THRESHOLDS_HIGH_TO_LOW,
  MAX_FLARE_SOLS_BEFORE_WARNING,
  MIN_FLARE_SOLS_PER_SCENARIO,
  SCENARIO_END_OFFSET_DAYS,
  SCENARIO_LENGTH_DAYS,
} from '../src/engine/constants';
import { addDays, flareSolsAt, isReadableFlare, isValidDate, solOf } from '../src/engine/flares';
import type { FlareRecord, FlareThreshold, Scenario } from '../src/engine/types';

const DONKI_FLR_URL = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR';
const REQUEST_TIMEOUT_MS = 30_000;
const ID_PATTERN = /^[a-z0-9-]+$/;

const SCENARIO_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'scenarios');

function fail(message: string): never {
  console.error(`\nError: ${message}\n`);
  process.exit(1);
}

// ---------- Arguments ----------

interface Args {
  start: string;
  id: string;
  name: string;
}

function parseArgs(argv: readonly string[]): Args {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === undefined || !key.startsWith('--')) {
      fail(`Unexpected argument "${key}". Use --start, --id and --name.`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      fail(`${key} needs a value.`);
    }
    values[key.slice(2)] = value;
    i += 1;
  }

  const { start, id, name } = values;
  if (!start || !id || !name) {
    fail(
      'Missing arguments.\n' +
        'Usage: npx tsx scripts/fetch-donki.ts --start YYYY-MM-DD --id some-id --name "Some Name"',
    );
  }
  if (!isValidDate(start)) {
    fail(`--start must be a real date written as YYYY-MM-DD (got "${start}").`);
  }
  if (!ID_PATTERN.test(id)) {
    fail(`--id may only use lowercase letters, digits and dashes (got "${id}").`);
  }
  if (id.startsWith('test')) {
    fail('--id must not start with "test"; that prefix is kept for made-up test data.');
  }
  return { start, id, name: name.trim() };
}

// ---------- Download ----------

async function fetchFlares(startDate: string, endDate: string): Promise<unknown[]> {
  const url = `${DONKI_FLR_URL}?startDate=${startDate}&endDate=${endDate}`;
  console.log(`Requesting ${url}`);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'TimeoutError'
        ? `no answer within ${REQUEST_TIMEOUT_MS / 1000} seconds`
        : error instanceof Error
          ? (error.cause instanceof Error ? error.cause.message : error.message)
          : String(error);
    fail(`Could not reach NASA DONKI (${reason}). Check your internet connection and try again.`);
  }

  if (!response.ok) {
    fail(`NASA DONKI answered with HTTP ${response.status} ${response.statusText}. Try again later.`);
  }

  const body = (await response.text()).trim();
  if (body === '') {
    return []; // DONKI sends an empty body when there are no flares
  }
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    fail(`NASA DONKI sent something that is not JSON. First 200 characters:\n${body.slice(0, 200)}`);
  }
  if (!Array.isArray(data)) {
    fail('NASA DONKI sent JSON, but not a list of flares.');
  }
  return data;
}

/** Keeps flrID, peakTime and classType exactly as NASA returned them. */
function keepFields(raw: readonly unknown[]): { flares: FlareRecord[]; withoutId: number } {
  const flares: FlareRecord[] = [];
  let withoutId = 0;
  for (const item of raw) {
    const record = (item ?? {}) as Record<string, unknown>;
    if (typeof record.flrID !== 'string' || record.flrID === '') {
      withoutId += 1;
      continue;
    }
    flares.push({
      flrID: record.flrID,
      peakTime: typeof record.peakTime === 'string' ? record.peakTime : null,
      classType: typeof record.classType === 'string' ? record.classType : null,
    });
  }
  return { flares, withoutId };
}

// ---------- Main ----------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const endDate = addDays(args.start, SCENARIO_END_OFFSET_DAYS);

  const raw = await fetchFlares(args.start, endDate);
  const { flares, withoutId } = keepFields(raw);

  const unreadable = flares.filter((f) => !isReadableFlare(f)).length;
  const outside = flares.filter((f) => {
    const sol = isReadableFlare(f) ? solOf(f.peakTime, args.start) : null;
    return sol !== null && (sol < 1 || sol > SCENARIO_LENGTH_DAYS);
  }).length;

  console.log(`\nWindow: ${args.start} to ${endDate} (${SCENARIO_LENGTH_DAYS} sols)`);
  console.log(`Flare records received: ${raw.length}`);
  if (withoutId > 0) {
    console.log(`Skipped ${withoutId} record(s) with no flrID (not saved, not in the seed).`);
  }
  console.log(
    `Skipped ${unreadable} record(s) with a missing or unreadable classType or peakTime ` +
      '(kept in the file and the seed, never a flare sol).',
  );
  if (outside > 0) {
    console.log(`${outside} flare(s) peaked outside the 28 sols and never count.`);
  }

  const solsByThreshold = new Map<FlareThreshold, number[]>();
  for (const threshold of FLARE_THRESHOLDS_HIGH_TO_LOW) {
    solsByThreshold.set(threshold, flareSolsAt(flares, args.start, threshold));
  }

  console.log('\nThreshold   Flare sols   Which sols');
  console.log('---------   ----------   ----------');
  for (const threshold of FLARE_THRESHOLDS_HIGH_TO_LOW) {
    const sols = solsByThreshold.get(threshold) ?? [];
    const label = threshold === 'X' ? 'X' : `${threshold} and up`;
    console.log(`${label.padEnd(12)}${String(sols.length).padEnd(13)}${sols.join(', ') || '-'}`);
  }

  const chosen = FLARE_THRESHOLDS_HIGH_TO_LOW.find(
    (t) => (solsByThreshold.get(t) ?? []).length >= MIN_FLARE_SOLS_PER_SCENARIO,
  );
  if (chosen === undefined) {
    fail(
      `Even M1 and up gives fewer than ${MIN_FLARE_SOLS_PER_SCENARIO} flare sols. ` +
        'Nothing was saved. Try a different start date (busy years: 2011-2015, 2017, 2022-2025).',
    );
  }

  const chosenSols = solsByThreshold.get(chosen) ?? [];
  console.log(`\nChosen threshold: ${chosen} (${chosenSols.length} flare sols)`);
  if (chosenSols.length > MAX_FLARE_SOLS_BEFORE_WARNING) {
    console.warn(
      `Warning: ${chosenSols.length} flare sols is more than ${MAX_FLARE_SOLS_BEFORE_WARNING}. ` +
        'This scenario may be very hard. Saving anyway.',
    );
  }

  const scenario: Scenario = {
    id: args.id,
    name: args.name,
    startDate: args.start,
    endDate,
    threshold: chosen,
    fetchedAt: new Date().toISOString(),
    flares,
  };

  mkdirSync(SCENARIO_DIR, { recursive: true });
  const file = join(SCENARIO_DIR, `${args.id}.json`);
  const replacing = existsSync(file);
  writeFileSync(file, `${JSON.stringify(scenario, null, 2)}\n`, 'utf8');
  console.log(`${replacing ? 'Replaced' : 'Saved'} ${file}\n`);
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
