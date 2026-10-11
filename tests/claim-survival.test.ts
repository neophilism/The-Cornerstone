import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { CaseRecord } from '@cornerstone/contracts';
import { parseFields, validateAction, workflow } from '@cornerstone/domain';
const claim: CaseRecord = {
  id: randomUUID(),
  kind: 'claim_survival',
  realm: 'simulation',
  ownerId: randomUUID(),
  institutionId: null,
  jurisdiction: null,
  state: 'review',
  version: 1,
  policyVersion: 'synthetic',
  title: 'Invented surviving claim',
  data: {},
  createdAt: '2026-10-11T00:00:00Z',
  updatedAt: '2026-10-11T00:00:00Z',
};
const findings = {
  undivided: true,
  deathEstablished: true,
  identityEstablished: true,
  chainEstablished: true,
  probateConsistent: true,
  competingRightsResolved: true,
  caseAccessNecessary: true,
  eligibilitySeparate: true,
};
describe('case-specific claim survival', () => {
  it('requires each substantive finding including narrow case access and separate eligibility', () => {
    for (const key of Object.keys(findings))
      expect(() =>
        validateAction(claim, 'approve', { ...findings, [key]: false }, '2026-10-11'),
      ).toThrow();
    expect(() => validateAction(claim, 'approve', findings, '2026-10-11')).not.toThrow();
  });
  it('requires personal acknowledgment before submission', () => {
    expect(() =>
      validateAction(
        { ...claim, state: 'draft' },
        'submit',
        { attested: true, rightsAcknowledged: false },
        '2026-10-11',
      ),
    ).toThrow();
    expect(() =>
      validateAction(
        { ...claim, state: 'draft' },
        'submit',
        { attested: true, rightsAcknowledged: true },
        '2026-10-11',
      ),
    ).not.toThrow();
  });
  it('does not permit account transfer, sale or a list of successors', () => {
    const definition = workflow('claim_survival');
    const input = {
      claimId: randomUUID(),
      transferBasis: 'holder_death',
      capacity: 'designated_successor',
      chain: 'Invented evidence only',
    };
    for (const capacity of ['sale', 'account_owner', 'multiple_heirs'])
      expect(() => parseFields(definition.createFields, { ...input, capacity })).toThrow();
    expect(definition.createFields.some((field) => field.key === 'successorId')).toBe(false);
  });
  it('keeps approval separate from the original claim eligibility transition', () => {
    expect(workflow('claim_survival').actions.find((a) => a.key === 'approve')!.to).toBe(
      'approved',
    );
    expect(workflow('claim').actions.find((a) => a.key === 'find_eligible')!.to).toBe('eligible');
    expect(workflow('claim_survival').actions.some((a) => a.key === 'find_eligible')).toBe(false);
  });
  it('permits withdrawing only an unclosed association proposal without forfeiting a claim', () => {
    const action = workflow('association').actions.find((a) => a.key === 'withdraw_proposal')!;
    expect(action.from).toEqual(['submitted', 'review']);
    expect(() =>
      validateAction(
        { ...claim, kind: 'association' },
        'withdraw_proposal',
        { rightsPreserved: false },
        '2026-10-11',
      ),
    ).toThrow();
  });
});
