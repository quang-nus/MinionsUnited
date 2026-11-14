const MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const FULL = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function toDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** "1 to 28 September 2017", or "15 October to 11 November 2014". */
export function dateRange(start: string, end: string): string {
  const a = toDate(start);
  const b = toDate(end);
  if (a.getUTCFullYear() !== b.getUTCFullYear()) {
    return `${FULL.format(a)} to ${FULL.format(b)}`;
  }
  if (a.getUTCMonth() !== b.getUTCMonth()) {
    return `${DAY_MONTH.format(a)} to ${FULL.format(b)}`;
  }
  return `${a.getUTCDate()} to ${b.getUTCDate()} ${MONTH_YEAR.format(b)}`;
}

/** "6 September 2017" */
export function formatDate(date: string): string {
  return FULL.format(toDate(date));
}

const PEAK = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

/** "on 6 September 2017 at 12:02 UTC", from a DONKI peak time like 2017-09-06T12:02Z. */
export function formatPeak(peakTime: string): string {
  const ms = Date.parse(peakTime);
  if (Number.isNaN(ms)) return 'at an unknown time';
  const parts = PEAK.formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `on ${get('day')} ${get('month')} ${get('year')} at ${get('hour')}:${get('minute')} UTC`;
}
