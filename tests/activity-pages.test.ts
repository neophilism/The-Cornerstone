import { describe, expect, it } from 'vitest';
import {
  ActivityCursorSchema,
  ActivityPageQuerySchema,
  ActivityPageSchema,
  ActivityReadResultSchema,
} from '@cornerstone/contracts';

describe('bounded scoped activity contracts', () => {
  it('defaults to a bounded page and accepts explicit valid limits', () => {
    expect(ActivityPageQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(ActivityPageQuerySchema.parse({ limit: '100' })).toEqual({ limit: 100 });
  });
  it.each([
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { limit: 'no' },
    { cursor: '!' },
    { cursor: 'a'.repeat(2049) },
    { recipientId: 'other' },
  ])('rejects malformed or recipient-directed input %j', (input) => {
    expect(ActivityPageQuerySchema.safeParse(input).success).toBe(false);
  });
  it('preserves microsecond cursor instants and rejects extra claims', () => {
    const cursor = {
      version: 1,
      id: '11111111-1111-4111-8111-111111111111',
      createdAt: '2000-01-01T00:00:00.000001Z',
    };
    expect(ActivityCursorSchema.parse(cursor)).toEqual(cursor);
    expect(ActivityCursorSchema.safeParse({ ...cursor, recipientId: cursor.id }).success).toBe(
      false,
    );
  });
  it('does not confuse page size with total unread or reading with legal service', () => {
    expect(
      ActivityPageSchema.parse({ notifications: [], nextCursor: null, unreadCount: 230 })
        .unreadCount,
    ).toBe(230);
    expect(
      ActivityPageSchema.safeParse({ notifications: [], nextCursor: null, unreadCount: -1 })
        .success,
    ).toBe(false);
    expect(
      ActivityReadResultSchema.safeParse({
        read: true,
        legalService: true,
        marked: [],
        unreadCount: 0,
      }).success,
    ).toBe(false);
  });
});
