import { DomainError } from './errors.js';
import { IdSchema, InstantSchema } from '@cornerstone/contracts';
export type LegalDate = string;
function parts(value: LegalDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new DomainError('INVALID_DATE', 'Use an exact calendar date.');
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || year > 9999 || date.toISOString().slice(0, 10) !== value)
    throw new DomainError('INVALID_DATE', 'Calendar date does not exist.');
  return { year, month, day, date };
}
export function addCalendarDays(value: LegalDate, days: number): LegalDate {
  if (!Number.isSafeInteger(days) || Math.abs(days) > 20000)
    throw new DomainError('INVALID_PERIOD', 'Calendar-day adjustment is out of range.');
  const p = parts(value);
  p.date.setUTCDate(p.day + days);
  const result = p.date.toISOString().slice(0, 10);
  parts(result);
  return result;
}
export function anniversary(
  value: LegalDate,
  years: number,
  leapRule: 'february-28' | 'march-1',
): LegalDate {
  const p = parts(value);
  if (!['february-28', 'march-1'].includes(leapRule))
    throw new DomainError('LEAP_RULE_REQUIRED', 'Choose the applicable leap-day anniversary rule.');
  if (!Number.isSafeInteger(years) || years < 0 || years > 40)
    throw new DomainError('INVALID_PERIOD', 'Use a bounded term.');
  const nextYear = p.year + years;
  let date = new Date(Date.UTC(nextYear, p.month - 1, p.day));
  if (date.getUTCMonth() !== p.month - 1 && leapRule === 'february-28')
    date = new Date(Date.UTC(nextYear, 1, 28));
  const result = date.toISOString().slice(0, 10);
  parts(result);
  return result;
}
export function localDate(instant: string, timeZone: string): LegalDate {
  const stamp = new Date(instant);
  if (!Number.isFinite(stamp.getTime()) || !InstantSchema.safeParse(instant).success)
    throw new DomainError('INVALID_INSTANT', 'Use an authoritative instant with an offset.');
  parts(instant.slice(0, 10));
  try {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(stamp);
    const get = (type: string) => p.find((x) => x.type === type)!.value;
    const result = `${get('year')}-${get('month')}-${get('day')}`;
    parts(result);
    return result;
  } catch {
    throw new DomainError('INVALID_TIME_ZONE', 'A valid jurisdiction timezone is required.');
  }
}
export function deadlineDate(input: {
  triggerInstant: string;
  timeZone: string;
  days: number;
  triggerEvidenceId: string;
  ruleVersion: string;
  legalService: boolean;
}) {
  if (
    !input.legalService ||
    !IdSchema.safeParse(input.triggerEvidenceId).success ||
    !input.ruleVersion.trim() ||
    input.ruleVersion.length > 100
  )
    throw new DomainError(
      'SERVICE_NOT_ESTABLISHED',
      'A notification is not a legally sufficient deadline trigger.',
    );
  if (!Number.isSafeInteger(input.days) || input.days < 0 || input.days > 3660)
    throw new DomainError('INVALID_PERIOD', 'Use a nonnegative, bounded response period.');
  return {
    date: addCalendarDays(localDate(input.triggerInstant, input.timeZone), input.days),
    timeZone: input.timeZone,
    triggerEvidenceId: input.triggerEvidenceId,
    ruleVersion: input.ruleVersion,
    decisionAutomatic: false as const,
  };
}
