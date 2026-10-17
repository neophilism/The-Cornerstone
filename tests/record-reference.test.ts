import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { CaseRecord } from '@cornerstone/contracts';
import { currentRecordReference } from '../packages/ui/src/record-reference.js';
const fixture = (): CaseRecord => ({
  id: randomUUID(),
  ownerId: randomUUID(),
  kind: 'dossier',
  realm: 'simulation',
  version: 2,
  state: 'draft',
  title: 'Invented private title',
  data: { private: 'Invented details' },
  policyVersion: 'synthetic',
  institutionId: null,
  jurisdiction: null,
  createdAt: '2026-10-16T00:00:00Z',
  updatedAt: '2026-10-16T00:00:00Z',
});
const page = (record: CaseRecord, actorId = record.ownerId) => ({
  context: { actorId, realm: record.realm },
  records: [record],
  capabilities: [{ recordId: record.id, version: record.version, actions: [] }],
  nextCursor: null,
});
describe('current record reference', () => {
  it('returns only the identifier after a current matching read, including newer versions', () => {
    const record = fixture();
    expect(currentRecordReference(page(record), record, record.ownerId)).toBe(record.id);
    expect(currentRecordReference(page({ ...record, version: 3 }), record, record.ownerId)).toBe(
      record.id,
    );
  });
  it('binds an authorized non-owner read to the actual reader rather than the record owner', () => {
    const record = fixture(),
      reader = randomUUID();
    expect(currentRecordReference(page(record, reader), record, reader)).toBe(record.id);
    expect(() => currentRecordReference(page(record, reader), record, record.ownerId)).toThrow();
  });
  it('rejects a response without current matching capability metadata', () => {
    const record = fixture();
    for (const capabilities of [[], [{ recordId: record.id, version: 1, actions: [] }]])
      expect(() =>
        currentRecordReference({ ...page(record), capabilities }, record, record.ownerId),
      ).toThrow();
  });
  it('rejects denied, absent, ambiguous or malformed results without a cached fallback', () => {
    const record = fixture();
    for (const raw of [
      null,
      {},
      { ...page(record), records: [] },
      { ...page(record), records: [record, record] },
      { ...page(record), records: [{ id: record.id }] },
    ])
      expect(() => currentRecordReference(raw, record, record.ownerId)).toThrow();
  });
  it.each([{ id: randomUUID() }, { kind: 'claim' }, { realm: 'proposal' }, { version: 1 }])(
    'rejects mismatched results %j',
    (change) => {
      const record = fixture();
      expect(() =>
        currentRecordReference(
          page({ ...record, ...change } as CaseRecord),
          record,
          record.ownerId,
        ),
      ).toThrow();
    },
  );
  it('does not enable program references even when both records agree', () => {
    const record = { ...fixture(), realm: 'program' as const };
    expect(() => currentRecordReference(page(record), record, record.ownerId)).toThrow();
  });
});
