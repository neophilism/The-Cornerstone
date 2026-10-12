import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { RecordSchema, type CaseRecord, type Command } from '@cornerstone/contracts';
import {
  WorkspaceRequestError,
  currentDraft,
  draftSaveResult,
  resolveDraft,
  reviewDraft,
  saveFailure,
  showDraftValue,
} from '../packages/ui/src/draft-review.js';
const fields = ['actionDescription', 'livelihood', 'lossDescription'];
const base = {
  actionDescription: 'Original action',
  livelihood: 'Original work',
  lossDescription: 'Original loss',
};
function record(delta: Partial<CaseRecord> = {}) {
  return RecordSchema.parse({
    id: randomUUID(),
    realm: 'simulation',
    kind: 'dossier',
    state: 'draft',
    version: 1,
    ownerId: randomUUID(),
    institutionId: null,
    jurisdiction: null,
    policyVersion: 'test-only',
    title: 'Invented recovery draft',
    data: base,
    createdAt: '2026-10-12T12:00:00Z',
    updatedAt: '2026-10-12T12:00:00Z',
    ...delta,
  });
}
function envelope(baseline: CaseRecord, version = 2, editable = true) {
  return {
    records: [{ ...baseline, version }],
    capabilities: [{ recordId: baseline.id, version, actions: editable ? ['save_draft'] : [] }],
    nextCursor: null,
  };
}
describe('explicit three-way draft review', () => {
  it('combines independent edits without writing or carrying hidden fields', () => {
    const local = { ...base, actionDescription: 'My action', internalReview: 'not editable' };
    const saved = { ...base, livelihood: 'Their work', privileged: true };
    const review = reviewDraft(fields, base, local, saved);
    expect(review.conflicts).toEqual([]);
    expect(resolveDraft(review, {})).toEqual({
      ...base,
      actionDescription: 'My action',
      livelihood: 'Their work',
    });
    expect(local.internalReview).toBe('not editable');
    expect(review.changed).toEqual(['actionDescription', 'livelihood']);
  });
  it('requires explicit choices for each overlap and rejects unrelated choices', () => {
    const local = { ...base, actionDescription: 'My action', livelihood: 'My work' };
    const saved = { ...base, actionDescription: 'Their action', livelihood: 'Their work' };
    const review = reviewDraft(fields, base, local, saved);
    expect(review.conflicts).toHaveLength(2);
    expect(() => resolveDraft(review, {})).toThrow(/every conflicting/);
    expect(() => resolveDraft(review, { actionDescription: 'local' })).toThrow(/every conflicting/);
    expect(() =>
      resolveDraft(review, { actionDescription: 'local', livelihood: 'current', hidden: 'local' }),
    ).toThrow(/does not belong/);
    expect(resolveDraft(review, { actionDescription: 'local', livelihood: 'current' })).toEqual({
      ...base,
      actionDescription: 'My action',
      livelihood: 'Their work',
    });
  });
  it('does not create an overlap for identical edits or object-key order', () => {
    const review = reviewDraft(
      ['a'],
      { a: { x: 1, y: 2 } },
      { a: { y: 2, x: 1 } },
      { a: { x: 1, y: 2 } },
    );
    expect(review.changed).toEqual([]);
    expect(review.conflicts).toEqual([]);
    expect(reviewDraft(['a'], { a: 1 }, { a: 2 }, { a: 2 }).conflicts).toEqual([]);
  });
  it('treats arrays and structured fields atomically, with no guessed element merge', () => {
    const review = reviewDraft(
      ['items'],
      { items: ['one'] },
      { items: ['one', 'local'] },
      { items: ['one', 'current'] },
    );
    expect(review.conflicts).toHaveLength(1);
    expect(resolveDraft(review, { items: 'current' })).toEqual({ items: ['one', 'current'] });
  });
  it('preserves deliberate removal and distinguishes falsy values', () => {
    const review = reviewDraft(
      ['optional', 'zero', 'flag', 'text'],
      { optional: 'old', zero: 5, flag: true, text: 'old' },
      { zero: 0, flag: false, text: '' },
      { optional: 'updated', zero: 5, flag: true, text: 'old' },
    );
    const result = resolveDraft(review, { optional: 'local' });
    expect(Object.hasOwn(result, 'optional')).toBe(false);
    expect(result).toEqual({ zero: 0, flag: false, text: '' });
  });
  it('clones data and decisions so review does not mutate the unsaved draft', () => {
    const local = { a: [{ value: 'mine' }] },
      current = { a: [{ value: 'theirs' }] };
    const review = reviewDraft(['a', 'a'], { a: [] }, local, current);
    const result = resolveDraft(review, { a: 'local' });
    (result.a as { value: string }[])[0]!.value = 'mutated';
    expect(local.a[0]!.value).toBe('mine');
    expect(review.conflicts[0]!.local).toEqual([{ value: 'mine' }]);
    expect(review.conflicts).toHaveLength(1);
  });
  it('defines a literal key without mutating the result prototype', () => {
    const raw = JSON.parse('{"__proto__":{"polluted":true}}');
    const result = resolveDraft(reviewDraft(['__proto__'], {}, raw, {}), {});
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('renders empty, missing, boolean and numeric values distinctly', () => {
    expect(showDraftValue(undefined)).toMatch(/cleared/);
    expect(showDraftValue('')).toBe('(empty)');
    expect(showDraftValue(0)).toBe('0');
    expect(showDraftValue(false)).toBe('false');
  });
});
describe('draft outcome and current-access checks', () => {
  it.each([400, 403, 404, 408, 409, 422, 429, 503])(
    'keeps an uncertain intent frozen when a later retry is rejected with %s',
    (status) => {
      expect(saveFailure(new WorkspaceRequestError(status, 'REJECTED', 'denied'), true)).toBe(
        'uncertain',
      );
    },
  );
  it('does not rebase an unconfirmed original save after a later stale retry response', () => {
    const error = new WorkspaceRequestError(409, 'STALE_VERSION', 'changed');
    expect(saveFailure(error)).toBe('stale');
    expect(saveFailure(error, true)).toBe('uncertain');
  });
  it.each([
    new Error('network interruption'),
    new TypeError('invalid JSON'),
    new WorkspaceRequestError(500, 'UNAVAILABLE', 'server'),
    new WorkspaceRequestError(408, 'TIMEOUT', 'timed out'),
  ])('retains the exact request for unconfirmed outcomes %#', (error) => {
    expect(saveFailure(error)).toBe('uncertain');
  });
  it('recognizes only the explicit stale-version rejection as a review state', () => {
    expect(saveFailure(new WorkspaceRequestError(409, 'STALE_VERSION', 'conflict'))).toBe('stale');
    expect(saveFailure(new WorkspaceRequestError(409, 'IDEMPOTENCY_CONFLICT', 'conflict'))).toBe(
      'rejected',
    );
    expect(saveFailure(new WorkspaceRequestError(403, 'FORBIDDEN', 'denied'))).toBe('rejected');
  });
  it('requires an exact current record and version-specific edit capability', () => {
    const baseline = record();
    expect(currentDraft(envelope(baseline), baseline).editable).toBe(true);
    expect(currentDraft(envelope(baseline, 2, false), baseline).editable).toBe(false);
    const wrongVersion = envelope(baseline);
    wrongVersion.capabilities[0]!.version = 1;
    expect(currentDraft(wrongVersion, baseline).editable).toBe(false);
    const transitioned = envelope(baseline);
    transitioned.records[0]!.state = 'ready';
    expect(currentDraft(transitioned, baseline).editable).toBe(false);
  });
  it('rejects missing, ambiguous, wrong-realm, wrong-kind and older snapshots', () => {
    const baseline = record({ version: 3 });
    for (const raw of [
      null,
      {},
      { records: [] },
      { records: [baseline, baseline] },
      envelope({ ...baseline, id: randomUUID() }, 3),
      envelope({ ...baseline, realm: 'proposal' }, 3),
      envelope({ ...baseline, kind: 'claim' }, 3),
      envelope(baseline, 2),
    ])
      expect(() => currentDraft(raw, baseline)).toThrow();
  });
  it('accepts only a correlated save record and receipt, including historical retry results', () => {
    const baseline = record();
    const command: Command = {
      recordId: baseline.id,
      action: 'save_draft',
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      input: base,
    };
    const saved = { ...baseline, version: 2 };
    const receipt = {
      id: randomUUID(),
      recordId: baseline.id,
      version: 2,
      acceptedAt: baseline.updatedAt,
      action: 'save_draft',
      digest: 'a'.repeat(64),
      realm: 'simulation',
      authorityStatus: 'simulation',
    };
    expect(draftSaveResult({ record: saved, receipt }, command, baseline).receipt.id).toBe(
      receipt.id,
    );
    for (const delta of [
      { recordId: randomUUID() },
      { version: 3 },
      { action: 'mark_ready' },
      { realm: 'program' },
      { authorityStatus: 'authorized' },
    ])
      expect(() =>
        draftSaveResult({ record: saved, receipt: { ...receipt, ...delta } }, command, baseline),
      ).toThrow();
    expect(() =>
      draftSaveResult({ record: { ...saved, version: 3 }, receipt }, command, baseline),
    ).toThrow();
    expect(() =>
      draftSaveResult({ record: saved, receipt }, { ...command, recordId: randomUUID() }, baseline),
    ).toThrow();
    expect(() => draftSaveResult({ record: saved }, command, baseline)).toThrow();
  });
});
