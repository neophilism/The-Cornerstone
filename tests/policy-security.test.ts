import { it, expect, describe } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  principalLivelihood,
  majorityOfAll,
  validateFoundingRoll,
  successorUnit,
  renewal,
  workflows,
  validateAction,
  parseFields,
  workflow,
} from '@cornerstone/domain';
import { encrypt, decrypt, canRead, localAuthAllowed } from '@cornerstone/security';
import { assertAuthority, prerequisites, type Authority } from '@cornerstone/policy';
import { kinds, type Actor, type CaseRecord, publicRecord } from '@cornerstone/contracts';
const actor: Actor = {
  id: randomUUID(),
  realm: 'simulation',
  roles: ['participant'],
  institutionId: null,
  jurisdiction: null,
  assurance: 'draft',
  assignments: [],
  conflicts: [],
  authenticationTime: '2026-10-10T00:00:00Z',
};
const record: CaseRecord = {
  id: randomUUID(),
  realm: 'simulation',
  kind: 'claim',
  ownerId: actor.id,
  institutionId: null,
  jurisdiction: null,
  state: 'review',
  version: 1,
  policyVersion: 'test',
  title: 'Synthetic record',
  data: { earnedIncomeShare: 0.6, workerType: 'employee', laterJob: true, retainsPartTime: true },
  createdAt: actor.authenticationTime,
  updatedAt: actor.authenticationTime,
};
describe('policy and privacy boundaries', () => {
  it('covers every record kind with a unique workflow', () => {
    expect(workflows.map((w) => w.kind).sort()).toEqual([...kinds].sort());
    for (const w of workflows)
      expect(new Set(w.actions.map((a) => a.key)).size).toBe(w.actions.length);
  });
  it('preserves principal-job loss despite part-time and later work', () => {
    expect(principalLivelihood(0.51, 0)).toBe(true);
    expect(principalLivelihood(0.5, 999)).toBe(false);
    expect(principalLivelihood(null, 1000)).toBe(true);
    expect(() =>
      validateAction(record, 'find_eligible', { directInjuryProven: true }, '2026-10-10'),
    ).not.toThrow();
  });
  it('uses a majority of all frozen units', () => {
    expect(majorityOfAll(50, 100)).toBe(false);
    expect(majorityOfAll(51, 100)).toBe(true);
    expect(() =>
      validateFoundingRoll({
        units: [
          { claimId: 'c', personId: 'p' },
          { claimId: 'c', personId: 'q' },
        ],
        pending: 0,
        closed: true,
      }),
    ).toThrow(/once/);
    expect(() =>
      validateFoundingRoll({
        units: [
          { claimId: 'c', personId: 'p' },
          { claimId: 'd', personId: 'q' },
        ],
        pending: 1,
        closed: true,
      }),
    ).toThrow(/pending/);
  });
  it('preserves one successor unit and a single automatic renewal', () => {
    expect(successorUnit({ unitId: 'one', successorId: null }, 'successor', true).unitId).toBe(
      'one',
    );
    expect(
      renewal({
        effectiveDate: '2000-02-29',
        today: '2030-03-01',
        renewalCount: 0,
        controlContinues: true,
        uncuredViolationEstablished: false,
        stayed: false,
      }),
    ).toEqual({ state: 'renewed', end: '2040-02-29' });
    expect(
      renewal({
        effectiveDate: '2000-01-01',
        today: '2040-01-01',
        renewalCount: 1,
        controlContinues: true,
        uncuredViolationEstablished: false,
        stayed: false,
      }).state,
    ).toBe('expired');
  });
  it('binds ciphertext to record and version, rejects tampering, and uses unique nonces', () => {
    const key = randomBytes(32),
      nonces = new Set();
    for (let n = 0; n < 1000; n++) {
      const e = encrypt({ private: 'synthetic' }, key, 'test', `case:${n}`);
      nonces.add(e.nonce);
      expect(decrypt(e, key, `case:${n}`)).toEqual({ private: 'synthetic' });
      expect(() => decrypt(e, key, `case:${n + 1}`)).toThrow();
    }
    expect(nonces.size).toBe(1000);
  });
  it('denies cross-realm, expired delegation, conflicted and technical-admin access', () => {
    expect(canRead({ ...actor, realm: 'proposal' }, record, [], actor.authenticationTime)).toBe(
      false,
    );
    expect(
      canRead({ ...actor, conflicts: [record.id] }, record, [], actor.authenticationTime),
    ).toBe(false);
    expect(
      canRead(
        {
          ...actor,
          id: randomUUID(),
          roles: ['technical_admin'],
          assurance: 'privileged',
          assignments: [record.id],
        },
        record,
        [],
        actor.authenticationTime,
      ),
    ).toBe(false);
    expect(
      canRead(
        { ...actor, id: randomUUID() },
        record,
        [
          {
            subjectId: actor.id,
            recordId: record.id,
            permissions: ['read'],
            revoked: false,
            expiresAt: '2026-01-01T00:00:00Z',
          },
        ],
        actor.authenticationTime,
      ),
    ).toBe(false);
  });
  it('does not project private data into public records', () => {
    const publicData = publicRecord(
      { ...record, data: { identityDocument: 'secret', ranking: ['a'], income: 100 } },
      'Reviewed summary',
    );
    expect(JSON.stringify(publicData)).not.toContain('secret');
    expect('data' in publicData).toBe(false);
  });
  it('rejects unknown input fields and incomplete required findings', () => {
    expect(() =>
      parseFields([{ key: 'x', label: 'X', required: true, type: 'text' }], {
        x: 'value',
        admin: true,
      }),
    ).toThrow(/Unexpected/);
    expect(() =>
      validateAction(
        { ...record, kind: 'event_petition' },
        'certify',
        { implemented: true },
        '2026-10-10',
      ),
    ).toThrow(/findings/);
  });
  it('accepts a full default founding roll and rejects malformed rights references', () => {
    const units = Array.from({ length: 2500 }, () => ({
      claimId: randomUUID(),
      personId: randomUUID(),
    }));
    const parsed = parseFields(workflow('association').createFields, {
      eventId: randomUUID(),
      units,
      rollOpened: '2026-10-10',
      constitution: 'Invented equal rights constitution',
    });
    expect((parsed['units'] as unknown[]).length).toBe(2500);
    expect(() =>
      parseFields([{ key: 'evidenceIds', label: 'Evidence', type: 'json', required: true }], {
        evidenceIds: { private: 'not an ID list' },
      }),
    ).toThrow();
    expect(() =>
      parseFields([{ key: 'units', label: 'Units', type: 'json', required: true }], {
        units: [{ claimId: randomUUID(), personId: 'invented-text' }],
      }),
    ).toThrow();
  });
  it('never enables a hosted local-auth back door', () => {
    const env = {
      NODE_ENV: 'development',
      CORNERSTONE_MODE: 'simulation',
      DATA_REALM: 'simulation',
      LOCAL_AUTH_ENABLED: 'true',
      LOCAL_AUTH_HOST: 'localhost',
    };
    expect(localAuthAllowed(env, 'localhost:4010')).toBe(true);
    expect(localAuthAllowed(env, '[::1]:4010')).toBe(true);
    expect(localAuthAllowed({ ...env, NODE_ENV: 'production' }, 'localhost:4010')).toBe(false);
    expect(localAuthAllowed(env, 'example.com')).toBe(false);
  });
  it('requires enactment and function-specific authority beyond a feature flag', () => {
    const input = {
      mode: 'authorized' as const,
      realm: 'program' as const,
      actor: {
        ...actor,
        realm: 'program' as const,
        roles: ['labor'] as Actor['roles'],
        assurance: 'privileged' as const,
        institutionId: randomUUID(),
      },
      function: 'event',
      now: actor.authenticationTime,
      jurisdiction: 'US',
      policyVersion: 'law-v1',
    };
    expect(() => assertAuthority({ ...input, authorities: [] })).toThrow(/Verified/);
    const a: Authority = {
      id: 'authority',
      realm: 'program',
      jurisdiction: 'US',
      function: 'event',
      effectiveFrom: '2026-01-01T00:00:00Z',
      effectiveUntil: null,
      withdrawn: false,
      enactedLawUrl: 'https://example.gov/enacted',
      lawHash: 'a'.repeat(64),
      verifiedBy: ['reviewer-1', 'reviewer-2'],
      appointedInstitutionId: input.actor.institutionId!,
      prerequisites: Object.fromEntries(prerequisites['event']!.map((p) => [p, true])),
      reviewEvidenceId: 'independent-review',
      policyVersion: 'law-v1',
    };
    expect(() => assertAuthority({ ...input, authorities: [a] })).not.toThrow();
    expect(() =>
      assertAuthority({ ...input, authorities: [{ ...a, verifiedBy: ['same', 'same'] }] }),
    ).toThrow();
  });
});
