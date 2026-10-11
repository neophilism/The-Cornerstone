import { describe, expect, it } from 'vitest';
import { addCalendarDays, anniversary, deadlineDate, localDate } from '@cornerstone/domain';
import { ActivityNotificationSchema } from '@cornerstone/contracts';

describe('jurisdiction calendar rules', () => {
  it('counts local calendar days across DST and offset boundaries', () => {
    expect(localDate('2026-03-08T04:30:00Z', 'America/New_York')).toBe('2026-03-07');
    expect(localDate('2026-03-08T07:30:00Z', 'America/New_York')).toBe('2026-03-08');
    expect(localDate('2026-11-01T06:30:00Z', 'America/New_York')).toBe('2026-11-01');
    expect(addCalendarDays('2026-03-07', 2)).toBe('2026-03-09');
    expect(addCalendarDays('2028-03-01', -1)).toBe('2028-02-29');
  });
  it('requires an explicit leap-day rule for the pure anniversary helper', () => {
    expect(anniversary('2024-02-29', 30)).toBe('2054-02-28');
    expect(anniversary('2024-02-29', 10, 'march-1')).toBe('2034-03-01');
    expect(anniversary('2024-02-29', 4, 'march-1')).toBe('2028-02-29');
  });
  it('rejects rolled dates, invalid zones, out-of-range periods and instants without offsets', () => {
    expect(() => addCalendarDays('2026-02-30', 1)).toThrow(/does not exist/);
    expect(() => addCalendarDays('2026-01-01', 0.5)).toThrow(/out of range/);
    expect(() => localDate('2026-03-08T04:30:00Z', 'Imaginary/Zone')).toThrow(/timezone/);
    expect(() => localDate('2026-03-08T04:30:00', 'UTC')).toThrow(/offset/);
  });
  it('keeps activity and legal service separate and never makes a default decision', () => {
    const input = {
      triggerInstant: '2026-03-08T04:30:00Z',
      timeZone: 'America/New_York',
      days: 30,
      triggerEvidenceId: '11111111-1111-4111-8111-111111111111',
      ruleVersion: 'reviewed-example-v1',
      legalService: true,
    };
    expect(deadlineDate(input)).toEqual({
      date: '2026-04-06',
      timeZone: input.timeZone,
      triggerEvidenceId: input.triggerEvidenceId,
      ruleVersion: input.ruleVersion,
      decisionAutomatic: false,
    });
    expect(() => deadlineDate({ ...input, legalService: false })).toThrow(
      /not a legally sufficient/,
    );
    expect(() => deadlineDate({ ...input, triggerEvidenceId: '' })).toThrow(
      /not a legally sufficient/,
    );
    expect(() => deadlineDate({ ...input, days: -1 })).toThrow(/response period/);
    expect(
      ActivityNotificationSchema.safeParse({
        id: input.triggerEvidenceId,
        recordId: input.triggerEvidenceId,
        receiptId: input.triggerEvidenceId,
        version: 1,
        action: 'create',
        createdAt: input.triggerInstant,
        readAt: null,
        classification: 'activity',
        channel: 'in_app',
        legalService: true,
        realm: 'simulation',
      }).success,
    ).toBe(false);
  });
});
