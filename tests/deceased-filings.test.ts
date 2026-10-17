import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CaseRecord } from '@cornerstone/contracts';
import { parseFields, validateAction, workflow, assertTransition } from '@cornerstone/domain';
import { standingFindings } from './helpers/deceased-filings.js';

const packet: CaseRecord = {
  id: randomUUID(),
  kind: 'deceased_filing',
  realm: 'simulation',
  ownerId: randomUUID(),
  institutionId: null,
  jurisdiction: null,
  state: 'review',
  version: 4,
  policyVersion: 'synthetic',
  title: 'Invented deceased-worker packet',
  data: {},
  createdAt: '2026-10-17T12:00:00Z',
  updatedAt: '2026-10-17T12:00:00Z',
};

describe('new deceased-worker standing and claim preparation', () => {
  it('requires personal acknowledgment and every distinct standing finding', () => {
    expect(() => validateAction(packet, 'submit', { attested: true }, '2026-10-17')).toThrow();
    for (const key of Object.keys(standingFindings))
      expect(() =>
        validateAction(packet, 'approve', { ...standingFindings, [key]: false }, '2026-10-17'),
      ).toThrow();
    expect(() => validateAction(packet, 'approve', standingFindings, '2026-10-17')).not.toThrow();
  });
  it('does not accept an account transfer, division among heirs or supplied claim-control metadata', () => {
    const input = { workerId: randomUUID(), capacity: 'designated_successor', chain: 'Invented' };
    for (const capacity of ['sale', 'account_owner', 'multiple_heirs'])
      expect(() =>
        parseFields(workflow('deceased_filing').createFields, { ...input, capacity }),
      ).toThrow();
    expect(() =>
      parseFields(workflow('claim').createFields, {
        eventId: randomUUID(),
        workerType: 'employee',
        injuryDescription: 'Invented',
        lossDate: '2000-02-01',
        claimControl: { originalWorkerId: randomUUID() },
      }),
    ).toThrow();
  });
  it('cannot open the new draft before standing approval or a second time after opening', () => {
    const open = workflow('deceased_filing').actions.find((action) => action.key === 'open_claim')!;
    for (const state of ['draft', 'submitted', 'review', 'denied', 'claim_opened', 'standing_withdrawn'])
      expect(() => assertTransition({ ...packet, state }, open)).toThrow();
    expect(() => assertTransition({ ...packet, state: 'approved' }, open)).not.toThrow();
  });
  it('requires original-worker injury criteria separately from complete standing findings', () => {
    expect(() =>
      validateAction(
        { ...packet, kind: 'claim', data: { earnedIncomeShare: 0.1, annualHours: 10 } },
        'find_eligible',
        { ...standingFindings, directInjuryProven: true },
        '2026-10-17',
      ),
    ).toThrow(/principal livelihood/i);
  });
});
