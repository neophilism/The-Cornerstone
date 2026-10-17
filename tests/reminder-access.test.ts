import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { CaseRecord } from '@cornerstone/contracts';
import { personalCalendarReminder } from '@cornerstone/domain/reminders';
import { verifyReminderAccess } from '../packages/ui/src/reminder-access.js';
import {
  disclosePrivate,
  preparePrivateDisclosure,
} from '../packages/ui/src/private-disclosure.js';
const actorId = randomUUID();
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
const capability = { recordId: record.id, version: record.version, actions: [] };
const authorized = {
  context: { actorId, realm: record.realm },
  records: [record],
  capabilities: [capability],
  nextCursor: null,
};
describe('calendar access-check response boundary', () => {
  it('accepts one valid matching record without returning or mutating private data', () => {
    const response = structuredClone(authorized);
    const before = structuredClone(response);
    expect(verifyReminderAccess(response, record, actorId)).toBeUndefined();
    expect(response).toEqual(before);
  });
  it.each([
    null,
    undefined,
    true,
    [],
    {},
    { ...authorized, records: null },
    { ...authorized, records: [] },
    { ...authorized, records: [{ id: record.id }] },
    { ...authorized, records: [null] },
    { ...authorized, records: [record, record] },
    { ...authorized, records: [{ ...record, id: randomUUID() }] },
    { ...authorized, records: [{ ...record, realm: 'unknown' }] },
    { ...authorized, records: [{ ...record, version: 0 }] },
    { ...authorized, records: [{ ...record, title: null }] },
    { ...authorized, records: [{ ...record, data: null }] },
    { ...authorized, records: [{ ...record, extra: 'unexpected' }] },
  ])('refuses malformed, partial, ambiguous or mismatched response %#', (raw) => {
    expect(() => verifyReminderAccess(raw, record, actorId)).toThrow('No reminder was exported.');
  });
  it('refuses an invalid requested identifier even when the response repeats it', () => {
    expect(() =>
      verifyReminderAccess(
        { ...authorized, records: [{ ...record, id: 'not-an-id' }] },
        { ...record, id: 'not-an-id' },
        actorId,
      ),
    ).toThrow();
  });
  it.each([
    { ...authorized, context: undefined },
    { ...authorized, context: { actorId: randomUUID(), realm: record.realm } },
    { ...authorized, context: { actorId, realm: 'proposal' } },
    { ...authorized, records: [{ ...record, realm: 'proposal' }] },
    { ...authorized, capabilities: undefined },
    { ...authorized, capabilities: [] },
    { ...authorized, capabilities: [{ ...capability, recordId: randomUUID() }] },
    { ...authorized, capabilities: [{ ...capability, version: 2 }] },
    { ...authorized, capabilities: [capability, capability] },
    { ...authorized, nextCursor: 'unrelated-next-page' },
    { ...authorized, nextCursor: undefined },
  ])('refuses uncorrelated reader, realm or current capability response %#', (raw) => {
    expect(() => verifyReminderAccess(raw, record, actorId)).toThrow('No reminder was exported.');
  });
  it('rejects a substituted complete record even when its own capabilities are valid', () => {
    const other = { ...record, id: randomUUID() };
    expect(() =>
      verifyReminderAccess(
        {
          ...authorized,
          records: [other],
          capabilities: [{ ...capability, recordId: other.id }],
        },
        record,
        actorId,
      ),
    ).toThrow('No reminder was exported.');
  });
  it('rejects a previously authorized version older than the displayed record', () => {
    expect(() => verifyReminderAccess(authorized, { ...record, version: 2 }, actorId)).toThrow(
      'No reminder was exported.',
    );
  });
  it('accepts a newer saved version only with its matching current capability', () => {
    expect(
      verifyReminderAccess(
        {
          ...authorized,
          records: [{ ...record, version: 2 }],
          capabilities: [{ ...capability, version: 2 }],
        },
        record,
        actorId,
      ),
    ).toBeUndefined();
  });
  it.each([0, -1, Number.NaN, 1.5])('refuses an invalid displayed version %s', (version) => {
    expect(() => verifyReminderAccess(authorized, { ...record, version }, actorId)).toThrow(
      'No reminder was exported.',
    );
  });
});

describe('calendar session boundary at the file sink', () => {
  it('releases only generic calendar bytes after the current authenticated read', async () => {
    const content = personalCalendarReminder({ date: '2032-02-29', consent: true });
    const disclosure = await preparePrivateDisclosure(
      async () => ({ data: authorized, isCurrent: () => true }),
      'records?recordId=' + record.id,
      (raw) => {
        verifyReminderAccess(raw, record, actorId);
        return content;
      },
    );
    const output = vi.fn();
    disclosePrivate(disclosure, output);
    expect(output).toHaveBeenCalledExactlyOnceWith(content);
    expect(content).toContain('DTSTART;VALUE=DATE:20320229\r\n');
    for (const privateValue of [record.id, actorId, record.ownerId, record.title])
      expect(content).not.toContain(privateValue);
  });
  it.each(['session replacement', 'cancelled read'])(
    'rechecks %s after validation and before creating any file',
    async (change) => {
      const request = new AbortController();
      let current = true;
      const content = personalCalendarReminder({ date: '2032-02-29', consent: true });
      const disclosure = await preparePrivateDisclosure(
        async () => ({
          data: authorized,
          isCurrent: () => current && !request.signal.aborted,
        }),
        'records?recordId=' + record.id,
        (raw) => {
          verifyReminderAccess(raw, record, actorId);
          queueMicrotask(() => {
            if (change === 'session replacement') current = false;
            else request.abort();
          });
          return content;
        },
      );
      expect(disclosure.value).toBe(content);
      const output = vi.fn();
      expect(() => disclosePrivate(disclosure, output)).toThrow(/session changed/);
      expect(output).not.toHaveBeenCalled();
    },
  );
});
