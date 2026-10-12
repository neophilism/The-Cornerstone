import { afterEach, describe, expect, it, vi } from 'vitest';
import { foldCalendarLine, personalCalendarReminder } from '@cornerstone/domain/reminders';
const unfold = (text: string) => text.replace(/\r\n[ \t]/g, '');
afterEach(() => vi.useRealTimers());
describe('privacy-minimal personal calendar export', () => {
  it.each([
    ['2032-02-29', '20320301'],
    ['2031-02-28', '20310301'],
    ['2030-12-31', '20310101'],
    ['1000-01-01', '10000102'],
    ['9999-12-30', '99991231'],
  ])('keeps %s all-day with an exclusive following-day end', (date, end) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T13:45:00Z'));
    const text = personalCalendarReminder({ date, consent: true });
    expect(text).toContain(`DTSTART;VALUE=DATE:${date.replaceAll('-', '')}\r\n`);
    expect(text).toContain(`DTEND;VALUE=DATE:${end}\r\n`);
    expect(text).toContain('DTSTAMP:20261012T134500Z\r\n');
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(text.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true);
    expect(text.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    for (const line of text.split('\r\n'))
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    expect(unfold(text)).toContain('SUMMARY:Personal preparation reminder\r\n');
    expect(unfold(text)).not.toMatch(
      /(?:ATTENDEE|ORGANIZER|LOCATION|ATTACH|URL|VALARM|METHOD|TZID)[;:]/,
    );
  });
  it.each([
    '2031-02-29',
    '2032-02-30',
    '2030-00-01',
    '2030-13-01',
    '2030-01-00',
    '0999-01-01',
    '9999-12-31',
    '2030-1-01',
    '2030-01-01\r\nATTENDEE:private',
  ])('rejects invalid or unsafe date %s', (date) => {
    expect(() => personalCalendarReminder({ date, consent: true })).toThrow();
  });
  it.each([
    null,
    [],
    {},
    { date: '2030-01-01' },
    { date: '2030-01-01', consent: false },
    { date: '2030-01-01', consent: 'true' },
    { date: '2030-01-01', consent: true, title: 'Private title' },
    { date: '2030-01-01', consent: true, recordId: 'Private ID' },
  ])('rejects missing consent and additional fields %#', (input) => {
    expect(() => personalCalendarReminder(input)).toThrow();
  });
  it('creates independent random identifiers with no case-derived inputs', () => {
    const ids = Array.from(
      { length: 20 },
      () =>
        personalCalendarReminder({ date: '2030-01-01', consent: true }).match(
          /^UID:urn:uuid:([^\r\n]+)$/m,
        )?.[1],
    );
    expect(ids.every((id) => /^[a-f0-9-]{36}$/.test(id || ''))).toBe(true);
    expect(new Set(ids).size).toBe(20);
  });
  it('folds multibyte Unicode without splitting characters', () => {
    const line = 'DESCRIPTION:' + '\u{1f33b}\u00e9'.repeat(70);
    const text = foldCalendarLine(line);
    expect(unfold(text)).toBe(line);
    expect(text).not.toContain('\ufffd');
    for (const part of text.split('\r\n'))
      expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75);
  });
  it.each(['\n', '\r', '\t', '\0', '\u007f'])('refuses control character %#', (control) => {
    expect(() => foldCalendarLine('SUMMARY:Generic' + control + 'ATTENDEE:private')).toThrow();
  });
});
