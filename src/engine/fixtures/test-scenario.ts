// TEST ONLY. These flares are made up.
// Never import this file outside *.test.ts files: players may only see real NASA data.
// A test in flares.test.ts fails if anything else imports it.

import type { Scenario } from '../types';

export const TEST_ONLY_SCENARIO: Scenario = {
  id: 'test-only-made-up',
  name: 'TEST ONLY - made-up flares',
  startDate: '2000-01-01',
  endDate: '2000-01-28',
  threshold: 'M5',
  fetchedAt: '2000-01-01T00:00:00.000Z',
  flares: [
    // 23:59 on the first date: sol 1
    { flrID: 'TEST-FLR-01', peakTime: '2000-01-01T23:59Z', classType: 'X1.2' },
    // 00:00 on the next date: sol 2
    { flrID: 'TEST-FLR-02', peakTime: '2000-01-02T00:00Z', classType: 'M5.0' },
    // below the M5 threshold: ignored
    { flrID: 'TEST-FLR-03', peakTime: '2000-01-05T10:00Z', classType: 'M4.9' },
    { flrID: 'TEST-FLR-04', peakTime: '2000-01-06T10:00Z', classType: 'C9.6' },
    // two flares on the same sol: counts once
    { flrID: 'TEST-FLR-05', peakTime: '2000-01-10T03:00Z', classType: 'M7.1' },
    { flrID: 'TEST-FLR-06', peakTime: '2000-01-10T20:00Z', classType: 'X2.0' },
    // unreadable: never a flare sol, still part of the seed
    { flrID: 'TEST-FLR-07', peakTime: '2000-01-12T10:00Z', classType: null },
    { flrID: 'TEST-FLR-08', peakTime: 'sometime', classType: 'X9.0' },
    // outside the 28 sols: dropped
    { flrID: 'TEST-FLR-09', peakTime: '2000-01-29T00:00Z', classType: 'X5.0' },
    // last sol
    { flrID: 'TEST-FLR-10', peakTime: '2000-01-28T23:59Z', classType: 'M6.0' },
  ],
};
