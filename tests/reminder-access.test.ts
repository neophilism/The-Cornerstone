import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { CaseRecord } from '@cornerstone/contracts';
import { verifyReminderAccess } from '../packages/ui/src/reminder-access.js';
const record: CaseRecord = {
  id: randomUUID(),
  realm: 'simulation',
  kind: 'dossier',
  state: 'draft',
  version: 1,
  ownerId: randomUUID(),
  institutionId: null,
  jurisdiction: null,
  policyVersion: 'test',
  title: 'Invented private case',
  data: { details: 'Not included in a calendar export' },
  createdAt: '2026-10-12T00:00:00Z',
  updatedAt: '2026-10-12T00:00:00Z',
};
describe('calendar access-check response boundary', () => {
  it('accepts one valid matching record without returning or mutating private data', () => {
    const response = { records: [structuredClone(record)], capabilities: [], nextCursor: null };
    const before = structuredClone(response);
    expect(verifyReminderAccess(response, record.id)).toBeUndefined();
    expect(response).toEqual(before);
  });
  it.each([
    null,
    undefined,
    true,
    [],
    {},
    { records: null },
    { records: [] },
    { records: [{ id: record.id }] },
    { records: [null] },
    { records: [record, record] },
    { records: [{ ...record, id: randomUUID() }] },
    { records: [{ ...record, realm: 'unknown' }] },
    { records: [{ ...record, version: 0 }] },
    { records: [{ ...record, title: null }] },
    { records: [{ ...record, data: null }] },
    { records: [{ ...record, extra: 'unexpected' }] },
  ])('refuses malformed, partial, ambiguous or mismatched response %#', (raw) => {
    expect(() => verifyReminderAccess(raw, record.id)).toThrow('No reminder was exported.');
  });
  it('refuses an invalid requested identifier even when the response repeats it', () => {
    expect(() =>
      verifyReminderAccess({ records: [{ ...record, id: 'not-an-id' }] }, 'not-an-id'),
    ).toThrow();
  });
});
