import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { CaseRecord } from '@cornerstone/contracts';
import { prepareAccess, accessRequest, accessResult } from '../packages/ui/src/access-recovery.js';
import { WorkspaceRequestError } from '../packages/ui/src/draft-review.js';
import { actionFailure } from '../packages/ui/src/action-recovery.js';
function fixture(revoke = false) {
  const record: CaseRecord = {
    id: randomUUID(),
    ownerId: randomUUID(),
    realm: 'simulation',
    kind: 'dossier',
    state: 'draft',
    version: 2,
    institutionId: null,
    jurisdiction: null,
    policyVersion: 'synthetic',
    title: 'Invented access recovery',
    data: {},
    createdAt: '2026-10-17T12:00:00Z',
    updatedAt: '2026-10-17T12:00:00Z',
  };
  const path = revoke ? 'access/revoke' : 'access/grant';
  const request = {
    recordId: record.id,
    expectedVersion: 2,
    idempotencyKey: randomUUID(),
    ...(revoke
      ? { grantId: randomUUID() }
      : {
          subjectId: randomUUID(),
          expiresAt: '2026-10-18T00:00:00Z',
          allowDraftEdits: true,
          consent: true,
        }),
  };
  const attempt = prepareAccess(path, request, record);
  const result = {
    record: { ...record, version: 3 },
    receipt: {
      id: randomUUID(),
      recordId: record.id,
      version: 3,
      action: revoke ? 'revoke_draft_access' : 'grant_draft_access',
      realm: 'simulation',
      authorityStatus: 'simulation',
      digest: 'a'.repeat(64),
      acceptedAt: record.updatedAt,
    },
  };
  return { record, path, request, attempt, result };
}
describe('exact access-change recovery', () => {
  it.each([false, true])(
    'retains the original recipient/scope or grant after callers edit their objects (%s)',
    (revoke) => {
      const f = fixture(revoke),
        original = accessRequest(f.attempt);
      f.request.expectedVersion = 999;
      const recovered = accessRequest(f.attempt);
      recovered.expectedVersion = 1000;
      expect(accessRequest(f.attempt)).toEqual(original);
      expect(Object.isFrozen(f.attempt)).toBe(true);
      expect(accessResult(f.result, f.attempt)).toEqual(f.result);
    },
  );
  it.each([false, true])(
    'rejects substituted record, state, realm, version and receipt metadata (%s)',
    (revoke) => {
      const f = fixture(revoke);
      for (const change of [
        { id: randomUUID() },
        { kind: 'claim' },
        { state: 'ready' },
        { realm: 'program' },
        { version: 2 },
        { version: 4 },
      ])
        expect(() =>
          accessResult({ ...f.result, record: { ...f.result.record, ...change } }, f.attempt),
        ).toThrow();
      for (const change of [
        { recordId: randomUUID() },
        { action: 'save_draft' },
        { version: 4 },
        { realm: 'program' },
        { authorityStatus: 'authorized' },
      ])
        expect(() =>
          accessResult({ ...f.result, receipt: { ...f.result.receipt, ...change } }, f.attempt),
        ).toThrow();
      expect(() => accessResult(null, f.attempt)).toThrow();
    },
  );
  it.each([false, true])(
    'requires the selected synthetic record and exact baseline version (%s)',
    (revoke) => {
      const f = fixture(revoke);
      for (const change of [
        { id: randomUUID() },
        { version: 3 },
        { kind: 'resolution' },
        { realm: 'program' },
      ])
        expect(() =>
          prepareAccess(f.path, f.request, { ...f.record, ...change } as CaseRecord),
        ).toThrow();
    },
  );
  it('requires consent and refuses editing permission outside a draft', () => {
    const f = fixture();
    expect(() => prepareAccess(f.path, { ...f.request, consent: false }, f.record)).toThrow();
    expect(() => prepareAccess(f.path, f.request, { ...f.record, state: 'ready' })).toThrow();
    expect(() =>
      prepareAccess(
        f.path,
        { ...f.request, allowDraftEdits: false },
        { ...f.record, state: 'ready' },
      ),
    ).not.toThrow();
  });
  it('keeps every denied retry uncertain while definitive first-request denial permits correction', () => {
    const denied = new WorkspaceRequestError(403, 'DENIED', 'Synthetic denial');
    expect(actionFailure(denied)).toBe('rejected');
    expect(actionFailure(denied, true)).toBe('uncertain');
    expect(actionFailure(Error('Connection lost'))).toBe('uncertain');
  });
});
