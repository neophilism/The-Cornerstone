import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { type CaseRecord } from '@cornerstone/contracts';
import {
  actionFailure,
  actionRequest,
  actionResult,
  prepareAction,
} from '../packages/ui/src/action-recovery.js';
import { WorkspaceRequestError } from '../packages/ui/src/draft-review.js';

function fixture() {
  const record: CaseRecord = {
    id: randomUUID(),
    ownerId: randomUUID(),
    realm: 'simulation',
    kind: 'dossier',
    state: 'draft',
    version: 1,
    institutionId: null,
    jurisdiction: null,
    policyVersion: 'synthetic',
    title: 'Invented action recovery',
    data: {},
    createdAt: '2026-10-16T12:00:00Z',
    updatedAt: '2026-10-16T12:00:00Z',
  };
  const command = {
    recordId: record.id,
    action: 'mark_ready',
    expectedVersion: 1,
    idempotencyKey: randomUUID(),
    input: { nested: { note: 'Invented intent' } },
  };
  const attempt = prepareAction(command, record);
  const result = {
    record: { ...record, version: 2, state: 'ready' },
    receipt: {
      id: randomUUID(),
      recordId: record.id,
      version: 2,
      action: 'mark_ready',
      realm: record.realm,
      authorityStatus: 'simulation',
      digest: 'a'.repeat(64),
      acceptedAt: record.updatedAt,
    },
  };
  return { record, command, attempt, result };
}

describe('exact workflow action recovery', () => {
  it('freezes original bytes and returns fresh copies for every attempt', () => {
    const f = fixture();
    f.command.input.nested.note = 'Changed after capture';
    const first = actionRequest(f.attempt);
    (first.input['nested'] as { note: string }).note = 'Mutated request';
    expect(actionRequest(f.attempt).input).toEqual({ nested: { note: 'Invented intent' } });
    expect(actionRequest(f.attempt).idempotencyKey).toBe(f.command.idempotencyKey);
    expect(Object.isFrozen(f.attempt)).toBe(true);
  });
  it('rejects wrong records, stale versions and actions unavailable from the original state', () => {
    const f = fixture();
    for (const patch of [
      { recordId: randomUUID() },
      { expectedVersion: 2 },
      { action: 'reopen' },
      { action: 'save_draft' },
      { action: 'unknown' },
    ])
      expect(() => prepareAction({ ...f.command, ...patch }, f.record)).toThrow();
  });
  it('accepts a correlated historical receipt without treating it as current state', () => {
    const f = fixture();
    expect(actionResult(f.result, f.attempt)).toEqual(f.result);
  });
  it.each(['id', 'kind', 'realm', 'version', 'state'])('rejects mismatched record %s', (field) => {
    const f = fixture();
    const wrong: Record<string, unknown> = {
      id: randomUUID(),
      kind: 'claim',
      realm: 'proposal',
      version: 3,
      state: 'draft',
    };
    expect(() =>
      actionResult(
        { ...f.result, record: { ...f.result.record, [field]: wrong[field] } },
        f.attempt,
      ),
    ).toThrow();
  });
  it.each(['recordId', 'realm', 'version', 'action', 'authorityStatus'])(
    'rejects mismatched receipt %s',
    (field) => {
      const f = fixture();
      const wrong: Record<string, unknown> = {
        recordId: randomUUID(),
        realm: 'program',
        version: 3,
        action: 'reopen',
        authorityStatus: 'authorized',
      };
      expect(() =>
        actionResult(
          { ...f.result, receipt: { ...f.result.receipt, [field]: wrong[field] } },
          f.attempt,
        ),
      ).toThrow();
    },
  );
  it('never treats a denied retry as proof the original request failed', () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      const error = new WorkspaceRequestError(
        status,
        status === 409 ? 'STALE_VERSION' : 'DENIED',
        'Synthetic denial',
      );
      expect(actionFailure(error)).toBe('rejected');
      expect(actionFailure(error, true)).toBe('uncertain');
    }
    for (const error of [
      new Error('Connection interrupted'),
      new WorkspaceRequestError(408, 'TIMEOUT', 'Unknown'),
      new WorkspaceRequestError(503, 'UNAVAILABLE', 'Unknown'),
    ])
      expect(actionFailure(error)).toBe('uncertain');
  });
});
