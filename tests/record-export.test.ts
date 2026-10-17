import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { CaseRecord } from '@cornerstone/contracts';
import { reviewRecordExport, confirmRecordExport } from '../packages/ui/src/record-export.js';
const actorId = randomUUID();
function page(records: CaseRecord[], readerId = actorId) {
  return {
    context: { actorId: readerId, realm: records[0]?.realm ?? 'simulation' },
    records,
    capabilities: records.map((record) => ({
      recordId: record.id,
      version: record.version,
      actions: [],
    })),
    nextCursor: null,
  };
}
function fixture(): CaseRecord {
  return {
    id: randomUUID(),
    ownerId: randomUUID(),
    realm: 'simulation',
    kind: 'dossier',
    title: 'Invented export',
    state: 'draft',
    version: 1,
    institutionId: null,
    jurisdiction: null,
    policyVersion: 'synthetic-only',
    data: { actionDescription: 'Invented private details', a: 0, b: false, c: null },
    createdAt: '2026-10-12T00:00:00Z',
    updatedAt: '2026-10-12T00:00:00Z',
  };
}
describe('current saved record export', () => {
  it('serializes the reviewed snapshot with explicit synthetic format and notice', () => {
    const record = fixture();
    const review = reviewRecordExport(
      { ...page([record]), secretEnvelope: 'omit me' },
      record,
      actorId,
    );
    const result = confirmRecordExport(page([record]), review, true);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw Error('not ready');
    const value = JSON.parse(result.content);
    expect(value.format).toBe('cornerstone-synthetic-record/v1');
    expect(value.notice).toContain('not a legal filing');
    expect(value.record).toEqual(record);
    expect(review.actorId).toBe(actorId);
    expect(result.content).not.toContain(actorId);
    expect(result.content).not.toContain('omit me');
    expect(result.content.endsWith('\n')).toBe(true);
  });
  it('requires affirmative consent and a second matching access result', () => {
    const record = fixture(),
      review = reviewRecordExport(page([record]), record, actorId);
    for (const consent of [false, null, undefined, 'yes'])
      expect(() => confirmRecordExport(page([record]), review, consent as boolean)).toThrow();
    for (const raw of [
      null,
      {},
      page([]),
      page([record, record]),
      { ...page([record]), records: [{ id: record.id }] },
    ])
      expect(() => confirmRecordExport(raw, review, true)).toThrow();
  });
  it('binds the initial review and confirmation to the authenticated reader and realm', () => {
    const record = fixture(),
      response = page([record]),
      review = reviewRecordExport(response, record, actorId);
    for (const raw of [
      { ...response, context: undefined },
      page([record], randomUUID()),
      { ...response, context: { actorId, realm: 'program' } },
      { ...response, context: { ...response.context, sessionToken: 'unexpected' } },
    ]) {
      expect(() => reviewRecordExport(raw, record, actorId)).toThrow();
      expect(() => confirmRecordExport(raw, review, true)).toThrow();
    }
  });
  it('requires one matching permission version for the exact record before either disclosure', () => {
    const record = fixture(),
      response = page([record]),
      review = reviewRecordExport(response, record, actorId);
    for (const capabilities of [
      undefined,
      [],
      [{ recordId: randomUUID(), version: record.version, actions: [] }],
      [{ recordId: record.id, version: record.version + 1, actions: [] }],
      [response.capabilities[0], response.capabilities[0]],
    ]) {
      const raw = { ...response, capabilities };
      expect(() => reviewRecordExport(raw, record, actorId)).toThrow();
      expect(() => confirmRecordExport(raw, review, true)).toThrow();
    }
  });
  it.each(['id', 'kind', 'realm', 'version'])('rejects unrelated or older %s results', (field) => {
    const record = { ...fixture(), version: 2 };
    const changes: Record<string, unknown> = {
      id: randomUUID(),
      kind: 'claim',
      realm: 'proposal',
      version: 1,
    };
    expect(() =>
      reviewRecordExport(page([{ ...record, [field]: changes[field] }]), record, actorId),
    ).toThrow();
  });
  it('keeps real realms gated even when the displayed and current records agree', () => {
    for (const realm of ['proposal', 'program'] as const) {
      const record = { ...fixture(), realm };
      expect(() => reviewRecordExport(page([record]), record, actorId)).toThrow();
    }
  });
  it('requires a fresh review after any later saved version, without releasing file bytes', () => {
    const record = fixture(),
      review = reviewRecordExport(page([record]), record, actorId);
    const later = { ...record, version: 2, data: { changed: 'New saved details' } };
    const result = confirmRecordExport(page([later]), review, true);
    expect(result.status).toBe('changed');
    expect(result).not.toHaveProperty('content');
    if (result.status !== 'changed') throw Error('not changed');
    expect(result.review.record.version).toBe(2);
    expect(confirmRecordExport(page([later]), result.review, true).status).toBe('ready');
  });
  it('rejects unexplained content drift within a reviewed version', () => {
    const record = fixture(),
      review = reviewRecordExport(page([record]), record, actorId);
    expect(() =>
      confirmRecordExport(page([{ ...record, data: { altered: true } }]), review, true),
    ).toThrow(/without a version/);
  });
  it('does not treat JSON object property order as a content change', () => {
    const record = fixture(),
      review = reviewRecordExport(page([record]), record, actorId);
    const reordered = {
      ...record,
      data: Object.fromEntries(Object.entries(record.data).reverse()),
    };
    expect(confirmRecordExport(page([reordered]), review, true).status).toBe('ready');
  });
  it.each([undefined, NaN, Infinity, BigInt(1), new Date(), () => 'computed'])(
    'rejects non-JSON data instead of silently losing it: %s',
    (value) => {
      const record = { ...fixture(), data: { value } };
      expect(() => reviewRecordExport(page([record]), record, actorId)).toThrow();
    },
  );
  it('rejects cycles, excess nesting and oversized UTF-8 content', () => {
    const cycle: Record<string, unknown> = {};
    cycle['cycle'] = cycle;
    let deep: unknown = 'leaf';
    for (let i = 0; i < 55; i++) deep = [deep];
    for (const data of [cycle, { deep }, { text: '\u00e9'.repeat(1_000_001) }]) {
      const record = { ...fixture(), data };
      expect(() => reviewRecordExport(page([record]), record, actorId)).toThrow();
    }
  });
  it('preserves arrays, explicit clearing values and inert text without HTML execution', () => {
    const record = {
      ...fixture(),
      data: { rows: [0, false, null, ''], text: '<script>not executable</script>' },
    };
    const review = reviewRecordExport(page([record]), record, actorId);
    expect(JSON.parse(review.content).record.data).toEqual(record.data);
  });
});
