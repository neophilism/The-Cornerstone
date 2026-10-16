import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { CaseRecord } from '@cornerstone/contracts';
import {
  prepareMembershipAction,
  membershipRequest,
  membershipResult,
} from '../packages/ui/src/membership-recovery.js';
function fixture(ballot = false) {
  const record: CaseRecord = {
    id: randomUUID(),
    ownerId: randomUUID(),
    realm: 'simulation',
    kind: ballot ? 'resolution' : 'association',
    state: ballot ? 'voting' : 'review',
    version: 4,
    institutionId: null,
    jurisdiction: null,
    policyVersion: 'synthetic',
    title: 'Invented membership',
    data: {},
    createdAt: '2026-10-16T12:00:00Z',
    updatedAt: '2026-10-16T12:00:00Z',
  };
  const request = {
    recordId: record.id,
    expectedVersion: 4,
    idempotencyKey: randomUUID(),
    ...(ballot
      ? { action: 'record_vote', input: { unitId: randomUUID(), choice: 'yes' } }
      : {
          invitationId: randomUUID(),
          response: 'accepted',
          rightsAcknowledged: true,
          scaleChoice: 'no',
        }),
  };
  const attempt = prepareMembershipAction(
    ballot ? 'commands' : 'memberships/respond',
    request,
    record,
  );
  const result = {
    record: { ...record, version: 5 },
    receipt: {
      id: randomUUID(),
      recordId: record.id,
      version: 5,
      action: ballot ? 'record_vote' : 'founding_response',
      realm: 'simulation',
      authorityStatus: 'simulation',
      digest: 'a'.repeat(64),
      acceptedAt: record.updatedAt,
    },
  };
  return { record, request, attempt, result };
}
describe('membership recovery intent', () => {
  it.each([false, true])('preserves exact original consent/ballot bytes (%s)', (ballot) => {
    const f = fixture(ballot),
      original = JSON.stringify(membershipRequest(f.attempt));
    f.request.expectedVersion = 99;
    const parsed = membershipRequest(f.attempt);
    parsed.expectedVersion = 100;
    expect(JSON.stringify(membershipRequest(f.attempt))).toBe(original);
    expect(Object.isFrozen(f.attempt)).toBe(true);
    expect(membershipResult(f.result, f.attempt)).toEqual(f.result);
  });
  it.each([false, true])('rejects mismatched records, versions and receipts (%s)', (ballot) => {
    const f = fixture(ballot);
    for (const change of [
      { recordId: randomUUID() },
      { version: 6 },
      { action: 'create' },
      { authorityStatus: 'authorized' },
    ])
      expect(() =>
        membershipResult({ ...f.result, receipt: { ...f.result.receipt, ...change } }, f.attempt),
      ).toThrow();
    expect(() =>
      membershipResult({ ...f.result, record: { ...f.result.record, state: 'ready' } }, f.attempt),
    ).toThrow();
    expect(() => membershipResult({ receipt: f.result.receipt }, f.attempt)).toThrow();
  });
  it('requires the matching open synthetic association and acknowledged consent', () => {
    const f = fixture();
    for (const change of [
      { state: 'ready' },
      { realm: 'program' },
      { kind: 'dossier' },
      { version: 9 },
    ])
      expect(() =>
        prepareMembershipAction('memberships/respond', f.request, {
          ...f.record,
          ...change,
        } as CaseRecord),
      ).toThrow();
    expect(() =>
      prepareMembershipAction(
        'memberships/respond',
        { ...f.request, rightsAcknowledged: false },
        f.record,
      ),
    ).toThrow();
  });
  it('accepts only the personal voting command for a voting resolution', () => {
    const f = fixture(true);
    expect(() =>
      prepareMembershipAction('commands', { ...f.request, action: 'tally' }, f.record),
    ).toThrow();
    expect(() =>
      prepareMembershipAction('commands', f.request, { ...f.record, state: 'tallied' }),
    ).toThrow();
  });
});
