import { describe, expect, it } from 'vitest';
import { FLARE_THRESHOLDS_HIGH_TO_LOW, MIN_FLARE_SOLS_PER_SCENARIO, SCENARIO_END_OFFSET_DAYS } from './constants';
import { TEST_ONLY_SCENARIO } from './fixtures/test-scenario';
import {
  addDays,
  compareClass,
  flareSols,
  flareSolsAt,
  isReadableFlare,
  isValidDate,
  loadScenarios,
  meetsThreshold,
  seedFor,
  solOf,
} from './flares';
import type { Scenario } from './types';

describe('compareClass', () => {
  it('ranks by letter first', () => {
    expect(compareClass('A9.9', 'B1.0')).toBeLessThan(0);
    expect(compareClass('C9.6', 'M1.0')).toBeLessThan(0);
    expect(compareClass('M9.9', 'X1.0')).toBeLessThan(0);
    expect(compareClass('X1.0', 'M9.9')).toBeGreaterThan(0);
  });

  it('then by the number', () => {
    expect(compareClass('M2.3', 'M5.0')).toBeLessThan(0);
    expect(compareClass('X10.0', 'X9.9')).toBeGreaterThan(0);
    expect(compareClass('X1', 'X1.0')).toBe(0);
  });

  it('sorts a list correctly', () => {
    const sorted = ['X1.0', 'C9.6', 'M2.3', 'B5.0', 'X10.2', 'M10.0'].sort(compareClass);
    expect(sorted).toEqual(['B5.0', 'C9.6', 'M2.3', 'M10.0', 'X1.0', 'X10.2']);
  });

  it('puts unreadable classes below every readable class', () => {
    expect(compareClass('', 'A1.0')).toBeLessThan(0);
    expect(compareClass('Z1.0', 'A1.0')).toBeLessThan(0);
  });

  it('applies the thresholds', () => {
    expect(meetsThreshold('X1.0', 'X')).toBe(true);
    expect(meetsThreshold('M9.9', 'X')).toBe(false);
    expect(meetsThreshold('M5.0', 'M5')).toBe(true);
    expect(meetsThreshold('M4.9', 'M5')).toBe(false);
    expect(meetsThreshold('X1.0', 'M5')).toBe(true);
    expect(meetsThreshold('M1.0', 'M1')).toBe(true);
    expect(meetsThreshold('C9.9', 'M1')).toBe(false);
    expect(meetsThreshold(null, 'M1')).toBe(false);
  });
});

describe('sols', () => {
  it('23:59 on the first date is sol 1, 00:00 on the next date is sol 2', () => {
    expect(solOf('2000-01-01T23:59Z', '2000-01-01')).toBe(1);
    expect(solOf('2000-01-02T00:00Z', '2000-01-01')).toBe(2);
    expect(solOf('2000-01-01T00:00Z', '2000-01-01')).toBe(1);
    expect(solOf('1999-12-31T23:59Z', '2000-01-01')).toBe(0);
  });

  it('reads NASA times with or without seconds, and rejects others', () => {
    expect(solOf('2016-01-02T00:11Z', '2016-01-01')).toBe(2);
    expect(solOf('2016-01-02T00:11:30Z', '2016-01-01')).toBe(2);
    expect(solOf('sometime', '2016-01-01')).toBeNull();
    expect(solOf(null, '2016-01-01')).toBeNull();
  });

  it('gives the fixture its expected flare sols at M5', () => {
    // sol 1 and 2 (boundaries), 10 (two flares, counted once), 28 (last sol)
    expect(flareSols(TEST_ONLY_SCENARIO)).toEqual([1, 2, 10, 28]);
  });

  it('ignores flares below the threshold', () => {
    const { flares, startDate } = TEST_ONLY_SCENARIO;
    expect(flareSolsAt(flares, startDate, 'X')).toEqual([1, 10]);
    expect(flareSolsAt(flares, startDate, 'M5')).toEqual([1, 2, 10, 28]);
    expect(flareSolsAt(flares, startDate, 'M1')).toEqual([1, 2, 5, 10, 28]);
  });

  it('never counts unreadable flares or flares outside the 28 sols', () => {
    const { flares, startDate } = TEST_ONLY_SCENARIO;
    expect(flares.filter((f) => !isReadableFlare(f)).map((f) => f.flrID)).toEqual([
      'TEST-FLR-07',
      'TEST-FLR-08',
    ]);
    expect(flareSolsAt(flares, startDate, 'M1')).not.toContain(29);
  });

  it('adds days and checks dates', () => {
    expect(addDays('2017-09-01', 27)).toBe('2017-09-28');
    expect(addDays('2016-02-15', 27)).toBe('2016-03-13');
    expect(isValidDate('2017-09-01')).toBe(true);
    expect(isValidDate('2017-02-30')).toBe(false);
    expect(isValidDate('2017-9-1')).toBe(false);
  });
});

describe('seedFor', () => {
  it('the same scenario always gives the same seed', () => {
    expect(seedFor(TEST_ONLY_SCENARIO)).toBe(seedFor(structuredClone(TEST_ONLY_SCENARIO)));
  });

  it('does not depend on the order of the records', () => {
    const reversed: Scenario = { ...TEST_ONLY_SCENARIO, flares: [...TEST_ONLY_SCENARIO.flares].reverse() };
    expect(seedFor(reversed)).toBe(seedFor(TEST_ONLY_SCENARIO));
  });

  it('includes every flrID, even unreadable and ignored ones', () => {
    const withoutUnreadable: Scenario = {
      ...TEST_ONLY_SCENARIO,
      flares: TEST_ONLY_SCENARIO.flares.filter((f) => f.flrID !== 'TEST-FLR-07'),
    };
    expect(seedFor(withoutUnreadable)).not.toBe(seedFor(TEST_ONLY_SCENARIO));
  });
});

describe('real scenario files', () => {
  const scenarios = loadScenarios();

  it.each(scenarios.map((s) => [s.id, s] as const))('%s follows the specification', (_id, scenario) => {
    expect(scenario.id).toMatch(/^[a-z0-9-]+$/);
    expect(scenario.name.length).toBeGreaterThan(0);
    expect(isValidDate(scenario.startDate)).toBe(true);
    expect(scenario.endDate).toBe(addDays(scenario.startDate, SCENARIO_END_OFFSET_DAYS));
    expect(FLARE_THRESHOLDS_HIGH_TO_LOW).toContain(scenario.threshold);
    expect(flareSols(scenario).length).toBeGreaterThanOrEqual(MIN_FLARE_SOLS_PER_SCENARIO);
    expect(scenario.id.startsWith('test')).toBe(false);
  });

  it('have unique ids', () => {
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
  });
});

describe('test fixture', () => {
  it('is never imported outside test files', () => {
    const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith('.test.ts') && !path.includes('/fixtures/'))
      .filter(([, source]) => /fixtures\//.test(source))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});

describe('flaresBySol', () => {
  it('lists the flares behind each flare sol, strongest first', async () => {
    const { flaresBySol } = await import('./flares');
    const bySol = flaresBySol(TEST_ONLY_SCENARIO);
    expect([...bySol.keys()].sort((a, b) => a - b)).toEqual(flareSols(TEST_ONLY_SCENARIO));
    expect(bySol.get(10)?.map((f) => f.classType)).toEqual(['X2.0', 'M7.1']);
    expect(bySol.has(5)).toBe(false); // M4.9 is below the M5 threshold
  });
});
