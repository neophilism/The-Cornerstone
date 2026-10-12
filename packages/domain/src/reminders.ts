import { DateSchema } from '@cornerstone/contracts';
import { addCalendarDays } from './calendar.js';
import { DomainError } from './errors.js';

// RFC 5545 section 3.1: count UTF-8 octets, including continuation whitespace.
export function foldCalendarLine(line: string): string {
  if (/[\u0000-\u001f\u007f]/u.test(line))
    throw new DomainError('INVALID_CALENDAR_LINE', 'Calendar content cannot contain controls.');
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = '',
    width = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (width + bytes > 75) {
      lines.push(current);
      current = ' ';
      width = 1;
    }
    current += character;
    width += bytes;
  }
  return [...lines, current].join('\r\n');
}

/** This boundary deliberately accepts no case data, links, contacts or free text. */
export function personalCalendarReminder(input: unknown): string {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => key !== 'date' && key !== 'consent') ||
    !('consent' in input) ||
    input.consent !== true ||
    !('date' in input) ||
    !DateSchema.safeParse(input.date).success
  )
    throw new DomainError(
      'REMINDER_CONSENT_REQUIRED',
      'Choose a date and explicitly consent to a generic calendar export.',
    );
  const date = input.date as string;
  const end = addCalendarDays(date, 1); // Rejects nonexistent dates and year overflow.
  const uid = crypto.randomUUID();
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  if (!/^\d{8}T\d{6}Z$/.test(stamp))
    throw new DomainError('INVALID_CALENDAR_CLOCK', 'The calendar export clock is unavailable.');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Cornerstone//Personal preparation reminder//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:urn:uuid:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${date.replaceAll('-', '')}`,
    `DTEND;VALUE=DATE:${end.replaceAll('-', '')}`,
    'SUMMARY:Personal preparation reminder',
    'DESCRIPTION:Personal reminder only. Not legal service or an official deadline. Open your workspace separately and verify applicable requirements. Choose notifications in your calendar yourself.',
    'CLASS:PRIVATE',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ]
    .map(foldCalendarLine)
    .join('\r\n');
}
