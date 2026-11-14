// Every tunable number from the specification, named.
// Change balance here, never inside the rule functions.

// ---- Mission ----
export const SOLS_TOTAL = 28;
export const CREW_SIZE = 4;
export const CREW_NAMES: readonly string[] = ['Ava', 'Kofi', 'Mei', 'Leo'];
export const CREW_NAME_MAX_LENGTH = 12; // characters, after cleaning

// ---- Starting values ----
export const START_SOL = 1;
export const START_POWER = 100;
export const START_LIFE_SUPPORT = 0;
export const START_SHIELDING = 0;
export const START_RESEARCH = 0;

// ---- Income (power per crew member each morning) ----
export const INCOME_BASE = 4;
export const INCOME_SICK = 3;
export const INCOME_EXPEDITION = 0;
export const INCOME_EVACUATED = 0;
export const STORM_INCOME_PENALTY = 1; // each crew member's income is this much lower during a storm

// ---- Recovery (morning) ----
export const RECOVERY_BASE_PERCENT = 50;
export const RECOVERY_PER_SOL_SICK_PERCENT = 10; // chance = 50 + 10 x solsSick

// ---- Dust storm ----
export const STORM_START_PERCENT = 6;
export const STORM_LENGTH_SOLS = 3;

// ---- Action costs ----
export const LIFE_SUPPORT_POWER_COST = 1; // power per unit
export const SHIELDING_POWER_COST = 1; // power per unit
export const RESEARCH_LAUNCH_LIFE_SUPPORT_COST = 2;
export const COMMS_POWER_COST = 7;
export const CURE_LIFE_SUPPORT_COST = 5;
export const MIN_CREW_AT_BASE_FOR_LAUNCH = 1;

// ---- Life support need at end of sol ----
export const LIFE_SUPPORT_NEED_BASE = 1;
export const LIFE_SUPPORT_NEED_SICK = 2;
export const LIFE_SUPPORT_NEED_EXPEDITION = 2;

// ---- Shielding ----
export const DAILY_SHIELDING_USE = 2;
export const SHIELDING_SHORTAGE_SICKNESS_PERCENT = 30;
export const FLARE_SHIELDING_USE = 15;
export const FLARE_EVACUATIONS_UNSHIELDED = 2; // crew at the base sent away by a flare the shields cannot stop
// Shielding does not carry over: whatever is left after the daily use and any flare wears out overnight.
// (Life support still carries over.)

// ---- Expeditions ----
export const RETURN_BASE_PERCENT = 50;
export const RETURN_PER_SOL_OUTSIDE_PERCENT = 10; // chance = 50 + 10 x solsOutside
export const RETURN_SICKNESS_BASE_PERCENT = 5;
export const RETURN_SICKNESS_PER_SOL_OUTSIDE_PERCENT = 10; // chance = 5 + 10 x solsOutside
// Research reward range by solsOutside: index 0 is 1 sol outside, index 4 is 5 sols.
export const RESEARCH_REWARD_RANGES: readonly (readonly [min: number, max: number])[] = [
  [0, 5],
  [7, 13],
  [16, 26],
  [30, 46],
  [52, 76],
];

// ---- Sickness ----
export const NEW_SICKNESS_PERCENT = 5;
export const MAX_SICK_FROM_ROLLS = 2; // a roll has no effect while this many are sick

// ---- Communication ----
export const COMMS_FORECAST_SOLS = 7; // a request on sol D covers D+1 to D+7
export const COMMS_CONFIDENCE_BASE_PERCENT = 105;
export const COMMS_CONFIDENCE_PER_SOL_PERCENT = 10; // confidence = 105 - 10 x d
export const COMMS_WRONG_SOL_OFFSETS: readonly number[] = [-2, -1, 1, 2];
export const COMMS_ALWAYS_CORRECT_DISTANCE = 1; // flare exactly one sol after the request

// ---- Fixed random draws per sol (taken every sol, used or not) ----
export const SICKNESS_DRAWS_PER_SOL = 16; // 4 recovery, 4 shielding shortage, 4 return, 4 new sickness
export const RESEARCH_DRAWS_PER_SOL = 8; // 4 return rolls, 4 reward amounts
export const COMMS_DRAWS_PER_SOL = 2; // right-or-wrong, which wrong sol
export const STORM_DRAWS_PER_SOL = 1;

// ---- Scenario data ----
export const SCENARIO_LENGTH_DAYS = 28;
export const SCENARIO_END_OFFSET_DAYS = 27; // endDate = startDate + 27 days
export const MIN_FLARE_SOLS_PER_SCENARIO = 2;
export const FLARE_CLASS_ORDER: readonly string[] = ['A', 'B', 'C', 'M', 'X'];
export const SEED_FLARE_ID_SEPARATOR = '|';
// Thresholds from highest to lowest, and the smallest class each one counts.
export const FLARE_THRESHOLDS_HIGH_TO_LOW: readonly ('X' | 'M5' | 'M1')[] = ['X', 'M5', 'M1'];
export const FLARE_THRESHOLD_MIN_CLASS: Readonly<Record<'X' | 'M5' | 'M1', string>> = {
  X: 'X1.0',
  M5: 'M5.0',
  M1: 'M1.0',
};
export const MAX_FLARE_SOLS_BEFORE_WARNING = 5; // fetch script warns above this

// ---- End screen rating (set in Step 10c from scripts/simulate.ts; see README) ----
// A won game earns 1 star, 2 stars from STARS_2_RESEARCH, 3 stars from STARS_3_RESEARCH.
export const STARS_2_RESEARCH = 100;
export const STARS_3_RESEARCH = 120;
