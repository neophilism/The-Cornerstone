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
describe('current record reference', () => {
  it('returns only the identifier after a current matching read, including newer versions', () => {
    const record = fixture();
    expect(currentRecordReference({ records: [record] }, record)).toBe(record.id);
    expect(currentRecordReference({ records: [{ ...record, version: 3 }] }, record)).toBe(
      record.id,
    );
  });
  it('rejects denied, absent, ambiguous or malformed results without a cached fallback', () => {
    const record = fixture();
    for (const raw of [
      null,
      {},
      { records: [] },
      { records: [record, record] },
      { records: [{ id: record.id }] },
    ])
      expect(() => currentRecordReference(raw, record)).toThrow();
  });
  it.each([{ id: randomUUID() }, { kind: 'claim' }, { realm: 'proposal' }, { version: 1 }])(
    'rejects mismatched results %j',
    (change) => {
      const record = fixture();
      expect(() =>
        currentRecordReference({ records: [{ ...record, ...change }] }, record),
      ).toThrow();
    },
  );
  it('does not enable program references even when both records agree', () => {
    const record = { ...fixture(), realm: 'program' as const };
    expect(() => currentRecordReference({ records: [record] }, record)).toThrow();
  });
});
