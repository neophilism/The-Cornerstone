import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { CaseRecord, EvidenceView } from '@cornerstone/contracts';
import {
  currentEvidenceReference,
  currentMembershipReference,
  verifiedEvidencePage,
  verifiedMemberships,
  preparePrivateReference,
  disclosePrivateReference,
} from '../packages/ui/src/private-reference.js';

function fixture() {
  const actorId = randomUUID();
  const record: CaseRecord = {
    id: randomUUID(),
    ownerId: actorId,
    kind: 'dossier',
    realm: 'simulation',
    version: 3,
    state: 'draft',
    title: 'Invented private reference',
    data: {},
    policyVersion: 'synthetic',
    institutionId: null,
    jurisdiction: null,
    createdAt: '2026-10-17T00:00:00Z',
    updatedAt: '2026-10-17T00:00:00Z',
  };
  const item: EvidenceView = {
    id: randomUUID(),
    recordId: record.id,
    uploaderId: actorId,
    filename: 'invented.txt',
    description: 'Invented reference evidence',
    plaintextSha256: 'a'.repeat(64),
    byteLength: 12,
    state: 'quarantined',
    createdAt: record.createdAt,
    checkedAt: null,
    checkMethod: null,
    rejectionCode: null,
    mediaType: 'text/plain',
    realm: 'simulation',
    classification: 'synthetic_evidence',
    securityScan: 'not_performed',
    legalAcceptance: false,
  };
  const unit = {
    unitId: randomUUID(),
    associationId: randomUUID(),
    claimId: randomUUID(),
    successor: false,
  };
  return {
    actorId,
    record,
    item,
    unit,
    membership: {
      context: { actorId, realm: 'simulation' },
      invitations: [],
      units: [unit],
      realm: 'simulation',
      officialMembership: false,
    },
    evidence: {
      context: { actorId, realm: 'simulation' },
      recordId: record.id,
      version: record.version,
      enabled: true,
      evidence: [item],
    },
  };
}

describe('currently authorized private references', () => {
  it('retains the live session check after successful validation until actual disclosure', async () => {
    const f = fixture();
    let current = true;
    const reference = await preparePrivateReference(
      async () => ({ data: f.membership, isCurrent: () => current }),
      'memberships',
      (raw) => currentMembershipReference(raw, f.unit, f.actorId),
    );
    const sink = vi.fn();
    current = false;
    expect(() => disclosePrivateReference(reference, sink)).toThrow(/session changed/);
    expect(sink).not.toHaveBeenCalled();
  });
  it('releases only the validated identifier while the initiating session remains current', async () => {
    const f = fixture();
    const reference = await preparePrivateReference(
      async () => ({ data: f.evidence, isCurrent: () => true }),
      'evidence?recordId=' + f.record.id,
      (raw) => currentEvidenceReference(raw, f.item, f.record, f.actorId),
    );
    const sink = vi.fn();
    disclosePrivateReference(reference, sink);
    expect(sink).toHaveBeenCalledExactlyOnceWith(f.item.id);
  });
  it('rejects a replaced session before validation even when the response data would match', async () => {
    const f = fixture();
    const validate = vi.fn(() => f.unit.unitId);
    await expect(
      preparePrivateReference(
        async () => ({ data: f.membership, isCurrent: () => false }),
        'memberships',
        validate,
      ),
    ).rejects.toThrow(/session changed/);
    expect(validate).not.toHaveBeenCalled();
  });
  it('returns only the current founding unit ID', () => {
    const f = fixture();
    expect(currentMembershipReference(f.membership, f.unit, f.actorId)).toBe(f.unit.unitId);
    expect(verifiedMemberships(f.membership, f.actorId).units).toEqual([f.unit]);
  });
  it('rejects a different membership actor or realm, including a missing context', () => {
    const f = fixture();
    for (const context of [
      undefined,
      { actorId: randomUUID(), realm: 'simulation' },
      { actorId: f.actorId, realm: 'program' },
    ])
      expect(() =>
        currentMembershipReference({ ...f.membership, context }, f.unit, f.actorId),
      ).toThrow();
  });
  it('rejects absent, duplicated, transferred or substituted founding units', () => {
    const f = fixture();
    for (const units of [
      [],
      [f.unit, f.unit],
      [{ ...f.unit, associationId: randomUUID() }],
      [{ ...f.unit, claimId: randomUUID() }],
      [{ ...f.unit, successor: true }],
    ])
      expect(() =>
        currentMembershipReference({ ...f.membership, units }, f.unit, f.actorId),
      ).toThrow();
  });
  it('rejects membership invitations supplied for another actor', () => {
    const f = fixture();
    const invitation = {
      id: randomUUID(),
      associationId: f.unit.associationId,
      claimId: f.unit.claimId,
      personId: randomUUID(),
      termsDigest: 'b'.repeat(64),
      closesOn: '2026-12-31',
      response: 'pending',
      respondedAt: null,
      ownScaleChoice: null,
    };
    expect(() =>
      verifiedMemberships({ ...f.membership, invitations: [invitation] }, f.actorId),
    ).toThrow();
  });
  it('returns only a current evidence ID, including quarantined metadata and newer record versions', () => {
    const f = fixture();
    expect(currentEvidenceReference(f.evidence, f.item, f.record, f.actorId)).toBe(f.item.id);
    expect(
      currentEvidenceReference({ ...f.evidence, version: 4 }, f.item, f.record, f.actorId),
    ).toBe(f.item.id);
  });
  it('rejects another evidence actor, realm, record and older record version', () => {
    const f = fixture();
    for (const change of [
      { context: undefined },
      { context: { actorId: randomUUID(), realm: 'simulation' } },
      { context: { actorId: f.actorId, realm: 'program' } },
      { recordId: randomUUID() },
      { version: 2 },
    ])
      expect(() =>
        currentEvidenceReference({ ...f.evidence, ...change }, f.item, f.record, f.actorId),
      ).toThrow();
  });
  it('rejects absent, ambiguous and substituted evidence without a cached fallback', () => {
    const f = fixture();
    for (const evidence of [
      [],
      [f.item, f.item],
      [{ ...f.item, id: randomUUID() }],
      [{ ...f.item, recordId: randomUUID() }],
      [{ ...f.item, plaintextSha256: 'c'.repeat(64) }],
      [{ ...f.item, byteLength: 13 }],
      [{ ...f.item, filename: 'changed.txt' }],
      [{ ...f.item, uploaderId: randomUUID() }],
    ])
      expect(() =>
        currentEvidenceReference({ ...f.evidence, evidence }, f.item, f.record, f.actorId),
      ).toThrow();
  });
  it('rejects unrelated items in the page and non-synthetic selected records', () => {
    const f = fixture();
    expect(() =>
      verifiedEvidencePage(
        {
          ...f.evidence,
          evidence: [f.item, { ...f.item, id: randomUUID(), recordId: randomUUID() }],
        },
        f.record,
        f.actorId,
      ),
    ).toThrow();
    expect(() =>
      currentEvidenceReference(f.evidence, f.item, { ...f.record, realm: 'program' }, f.actorId),
    ).toThrow();
  });
});
