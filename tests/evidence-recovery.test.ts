import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { CaseRecord } from '@cornerstone/contracts';
import {
  prepareEvidence,
  evidenceRequest,
  evidenceResult,
} from '../packages/ui/src/evidence-recovery.js';
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
    title: 'Invented evidence',
    data: {},
    createdAt: '2026-10-16T00:00:00Z',
    updatedAt: '2026-10-16T00:00:00Z',
  };
  const upload = {
    recordId: record.id,
    expectedVersion: 1,
    idempotencyKey: randomUUID(),
    filename: 'invented.txt',
    description: 'Invented text',
    base64: btoa('Invented bytes'),
    attestedSynthetic: true,
  };
  return { record, upload };
}
describe('frozen evidence intent', () => {
  it('retains exact bytes, metadata and key independent of mutable form state', () => {
    const { record, upload } = fixture(),
      attempt = prepareEvidence('evidence/upload', upload, record);
    upload.base64 = btoa('Changed');
    upload.description = 'Changed';
    const first = evidenceRequest(attempt);
    expect((first as any).base64).toBe(btoa('Invented bytes'));
    first.idempotencyKey = randomUUID();
    expect(evidenceRequest(attempt).idempotencyKey).toBe(upload.idempotencyKey);
  });
  it('rejects mismatched record, stale version, malformed requests and non-synthetic drafts', () => {
    const { record, upload } = fixture();
    for (const changes of [
      { recordId: randomUUID() },
      { expectedVersion: 2 },
      { attestedSynthetic: false },
      { base64: '!' },
    ])
      expect(() => prepareEvidence('evidence/upload', { ...upload, ...changes }, record)).toThrow();
    for (const changes of [{ realm: 'program' }, { state: 'ready' }])
      expect(() =>
        prepareEvidence('evidence/upload', upload, { ...record, ...changes } as CaseRecord),
      ).toThrow();
  });
  it('freezes financial appeal evidence only while its hearing record is open', () => {
    const { record, upload } = fixture();
    for (const state of ['review_requested', 'calculation_review']) {
      const attempt = prepareEvidence('evidence/upload', upload, {
        ...record,
        kind: 'financial_schedule',
        state,
      });
      expect(attempt.state).toBe(state);
      expect(evidenceRequest(attempt)).toEqual(upload);
    }
    for (const state of ['calculated', 'calculation_heard', 'review_decided'])
      expect(() =>
        prepareEvidence('evidence/upload', upload, {
          ...record,
          kind: 'financial_schedule',
          state,
        }),
      ).toThrow();
  });
  it.each(['evidence/upload', 'evidence/validate'] as const)(
    'correlates the exact %s receipt and historical record',
    (path) => {
      const { record, upload } = fixture();
      const request =
        path === 'evidence/upload'
          ? upload
          : {
              recordId: record.id,
              expectedVersion: 1,
              idempotencyKey: randomUUID(),
              evidenceId: randomUUID(),
            };
      const attempt = prepareEvidence(path, request, record);
      const result = {
        record: { ...record, version: 2 },
        receipt: {
          id: randomUUID(),
          recordId: record.id,
          version: 2,
          action:
            path === 'evidence/upload'
              ? 'upload_synthetic_evidence'
              : 'validate_synthetic_evidence',
          digest: 'a'.repeat(64),
          acceptedAt: record.updatedAt,
          realm: 'simulation',
          authorityStatus: 'simulation',
        },
      };
      expect(evidenceResult(result, attempt)).toEqual(result);
      for (const change of [
        { id: randomUUID() },
        { version: 3 },
        { state: 'ready' },
        { realm: 'program' },
      ])
        expect(() =>
          evidenceResult({ ...result, record: { ...result.record, ...change } }, attempt),
        ).toThrow();
      for (const change of [
        { recordId: randomUUID() },
        { version: 3 },
        { action: 'create' },
        { realm: 'program' },
        { authorityStatus: 'authorized' },
      ])
        expect(() =>
          evidenceResult({ ...result, receipt: { ...result.receipt, ...change } }, attempt),
        ).toThrow();
    },
  );
});
