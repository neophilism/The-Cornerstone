import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { type Actor } from '@cornerstone/contracts';
import {
  creationFailure,
  creationRequest,
  creationResult,
  prepareCreation,
} from '../packages/ui/src/creation.js';
import { WorkspaceRequestError } from '../packages/ui/src/draft-review.js';
function fixture() {
  const actor: Pick<Actor, 'id' | 'realm'> = { id: randomUUID(), realm: 'simulation' };
  const raw = {
    kind: 'dossier',
    title: '  Invented new record  ',
    input: {
      actionDescription: 'Invented action',
      livelihood: 'Invented work',
      lossDescription: 'Invented loss',
    },
    idempotencyKey: randomUUID(),
  };
  const attempt = prepareCreation(raw, actor);
  const record = {
    id: randomUUID(),
    ownerId: actor.id,
    realm: actor.realm,
    kind: 'dossier',
    state: 'draft',
    version: 1,
    institutionId: null,
    jurisdiction: null,
    policyVersion: 'test-only',
    title: 'Invented new record',
    data: { ...raw.input },
    createdAt: '2026-10-12T12:00:00Z',
    updatedAt: '2026-10-12T12:00:00Z',
  };
  const receipt = {
    id: randomUUID(),
    recordId: record.id,
    version: 1,
    action: 'create',
    realm: actor.realm,
    digest: 'a'.repeat(64),
    authorityStatus: 'simulation',
    acceptedAt: record.createdAt,
  };
  return { actor, raw, attempt, result: { record, receipt } };
}
describe('one immutable new-record creation intent', () => {
  it('normalizes the title and keeps exactly the same key and request through retries', () => {
    const f = fixture();
    expect(creationRequest(f.attempt).title).toBe('Invented new record');
    expect(Object.isFrozen(f.attempt)).toBe(true);
    f.raw.input.livelihood = 'Changed after capture';
    const first = creationRequest(f.attempt);
    first.input['livelihood'] = 'Mutated caller copy';
    expect(creationRequest(f.attempt).input['livelihood']).toBe('Invented work');
    expect(creationRequest(f.attempt).idempotencyKey).toBe(f.raw.idempotencyKey);
    expect(JSON.stringify(creationRequest(f.attempt))).toBe(f.attempt.wire);
  });
  it('rejects missing intent, invalid keys and invalid actor scope before sending', () => {
    const f = fixture();
    for (const raw of [
      null,
      {},
      { ...f.raw, title: ' ' },
      { ...f.raw, idempotencyKey: 'bad' },
      { ...f.raw, kind: 'other' },
    ])
      expect(() => prepareCreation(raw, f.actor)).toThrow();
    expect(() => prepareCreation(f.raw, { ...f.actor, id: 'bad' })).toThrow();
  });
  it('accepts only an initial snapshot bound to a create receipt', () => {
    const f = fixture();
    expect(creationResult(f.result, f.attempt)).toEqual(f.result);
  });
  it.each([
    ['ownerId', () => randomUUID()],
    ['realm', () => 'proposal'],
    ['kind', () => 'claim'],
    ['title', () => 'Unrelated title'],
    ['state', () => 'ready'],
    ['version', () => 2],
  ])('rejects a response with mismatched record %s', (field, value) => {
    const f = fixture();
    expect(() =>
      creationResult(
        {
          ...f.result,
          record: { ...f.result.record, [field as string]: (value as () => unknown)() },
        },
        f.attempt,
      ),
    ).toThrow();
  });
  it.each([
    ['recordId', () => randomUUID()],
    ['realm', () => 'proposal'],
    ['action', () => 'save_draft'],
    ['version', () => 2],
    ['authorityStatus', () => 'authorized'],
  ])('rejects a response with mismatched receipt %s', (field, value) => {
    const f = fixture();
    expect(() =>
      creationResult(
        {
          ...f.result,
          receipt: { ...f.result.receipt, [field as string]: (value as () => unknown)() },
        },
        f.attempt,
      ),
    ).toThrow();
  });
  it('rejects missing, ID-only, malformed and null success payloads', () => {
    const f = fixture();
    for (const raw of [
      null,
      {},
      { record: f.result.record },
      { ...f.result, record: { id: f.result.record.id } },
      { ...f.result, receipt: null },
    ])
      expect(() => creationResult(raw, f.attempt)).toThrow();
  });
  it('does not mistake changed historical records for the original creation snapshot', () => {
    const f = fixture();
    expect(() =>
      creationResult({ ...f.result, record: { ...f.result.record, version: 3 } }, f.attempt),
    ).toThrow();
    expect(creationResult(f.result, f.attempt).record.version).toBe(1);
  });
  it.each([400, 401, 403, 404, 409, 422, 429])(
    'unlocks a first definite %s rejection but never a denied uncertain retry',
    (status) => {
      const error = new WorkspaceRequestError(status, 'REJECTED', 'Not accepted');
      expect(creationFailure(error, false)).toBe('rejected');
      expect(creationFailure(error, true)).toBe('uncertain');
    },
  );
  it.each([408, 500, 502, 503, 504])(
    'keeps status %s uncertain from the first request',
    (status) => {
      expect(creationFailure(new WorkspaceRequestError(status, 'UNKNOWN', 'Unknown'), false)).toBe(
        'uncertain',
      );
    },
  );
  it('keeps transport, invalid response and unexpected stale-create errors uncertain', () => {
    for (const e of [
      new TypeError('Failed fetch'),
      new Error('Malformed result'),
      null,
      new WorkspaceRequestError(409, 'STALE_VERSION', 'Unexpected'),
    ])
      expect(creationFailure(e, false)).toBe('uncertain');
  });
});
