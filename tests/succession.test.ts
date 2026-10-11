import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { type CaseRecord, MemberBallotViewSchema } from '@cornerstone/contracts';
import { parseFields, validateAction, workflow } from '@cornerstone/domain';
const record: CaseRecord = {
  id: randomUUID(),
  kind: 'succession',
  realm: 'simulation',
  ownerId: randomUUID(),
  institutionId: null,
  jurisdiction: null,
  state: 'review',
  version: 1,
  policyVersion: 'synthetic',
  title: 'Invented successor',
  data: {},
  createdAt: '2026-10-11T00:00:00Z',
  updatedAt: '2026-10-11T00:00:00Z',
};
const proof = {
  undivided: true,
  deathEstablished: true,
  identityEstablished: true,
  chainEstablished: true,
  probateConsistent: true,
  competingRightsResolved: true,
};
describe('synthetic succession preparation', () => {
  it('requires every substantive finding rather than only an undivided-unit checkbox', () => {
    for (const key of Object.keys(proof))
      expect(() =>
        validateAction(record, 'approve', { ...proof, [key]: false }, '2026-10-11'),
      ).toThrow();
    expect(() => validateAction(record, 'approve', proof, '2026-10-11')).not.toThrow();
  });
  it('requires personal acknowledgement for submission', () => {
    expect(() =>
      validateAction(
        { ...record, state: 'draft' },
        'submit',
        { attested: true, rightsAcknowledged: false },
        '2026-10-11',
      ),
    ).toThrow();
    expect(() =>
      validateAction(
        { ...record, state: 'draft' },
        'submit',
        { attested: true, rightsAcknowledged: true },
        '2026-10-11',
      ),
    ).not.toThrow();
  });
  it('does not offer sale, account transfer or multiple-successor preparation', () => {
    const definition = workflow('succession');
    const base = {
      unitId: randomUUID(),
      chain: 'Invented proof',
      transferBasis: 'member_death',
      capacity: 'designated_successor',
    };
    for (const capacity of ['sale', 'multiple_heirs', 'account_owner'])
      expect(() => parseFields(definition.createFields, { ...base, capacity })).toThrow();
    expect(definition.createFields.some((field) => field.key === 'successorId')).toBe(false);
  });
  it('represents an already-used unit without any inherited choice or receipt', () => {
    const unit = randomUUID();
    const parsed = MemberBallotViewSchema.parse({
      resolutionId: randomUUID(),
      associationId: randomUUID(),
      unitCount: 2,
      rollDigest: 'a'.repeat(64),
      closesOn: '2030-01-01',
      ownUnits: [unit],
      castUnits: [unit],
      ownBallots: [],
      realm: 'simulation',
      cryptographicallySealed: false,
    });
    expect(parsed.ownBallots).toEqual([]);
    expect(parsed.castUnits).toEqual([unit]);
  });
});
