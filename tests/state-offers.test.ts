import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PublishedStateOfferSchema, type Actor, type CaseRecord } from '@cornerstone/contracts';
import {
  addCalendarDays,
  independentStateReviewer,
  parseFields,
  statePacketOwner,
  workflow,
} from '@cornerstone/domain';
import { digest } from '@cornerstone/security';
import {
  assertCurrentStateAuthority,
  assertStateOfferBinding,
  freezeStateAuthority,
  freezeStateOffer,
  publishStateOffer,
} from '../apps/api/src/state-offers.js';
import { authorityInput, offerInput, publicationInput } from './helpers/state-offer-fixture.js';

const now = '2026-10-17T15:47:31.250Z';
function fixture() {
  const owner = randomUUID(),
    institution = randomUUID(),
    reviewerInstitution = randomUUID();
  const base = {
    realm: 'simulation' as const,
    ownerId: owner,
    institutionId: reviewerInstitution,
    jurisdiction: 'EX',
    policyVersion: 'proposal-v1',
    createdAt: now,
    updatedAt: now,
  };
  const origin = { actorId: owner, institutionId: institution, jurisdiction: 'EX' };
  const authority: CaseRecord = {
    ...base,
    id: randomUUID(),
    kind: 'state_authority',
    state: 'submitted',
    version: 4,
    title: 'Invented authority',
    data: { ...authorityInput(now.slice(0, 10)), evidenceIds: [randomUUID()], stateOrigin: origin },
  };
  const offer: CaseRecord = {
    ...base,
    id: randomUUID(),
    kind: 'offer',
    state: 'draft',
    version: 3,
    title: 'Invented public offer',
    data: { ...offerInput(authority), evidenceIds: [randomUUID()], stateOrigin: origin },
  };
  const reviewer: Actor = {
    id: randomUUID(),
    realm: 'simulation',
    roles: ['supervisor'],
    institutionId: reviewerInstitution,
    jurisdiction: 'EX',
    assignments: [authority.id, offer.id],
    conflicts: [],
    assurance: 'privileged',
    authenticationTime: now,
  };
  const state: Actor = { ...reviewer, id: owner, roles: ['state'], institutionId: institution };
  const verification = freezeStateAuthority(
    authority,
    reviewer,
    { ...authority.data, packetComplete: true, reasons: 'INTERNAL verification reasoning' },
    now,
  );
  const binding = freezeStateOffer(offer, offer.data, verification);
  const review: CaseRecord = {
    ...offer,
    version: 5,
    state: 'review',
    data: { ...offer.data, stateOfferBinding: binding },
  };
  const data = {
    ...review.data,
    ...publicationInput(now.slice(0, 10)),
    privateEvidenceBody: 'PRIVATE BODY',
    internalNotes: 'PRIVATE NOTES',
  };
  return { authority, offer, reviewer, state, verification, binding, review, data };
}
describe('source-bound synthetic state publication', () => {
  it('reuses strict prospective financial inputs and makes close, not open, the 90-day boundary', () => {
    const f = fixture();
    expect(
      parseFields(workflow('state_authority').createFields, authorityInput('2026-10-17'))
        .financialTerms,
    ).toBeTruthy();
    const help = workflow('offer').actions.find((a) => a.key === 'publish')!.help;
    expect(help).toContain('90 days before rankings close');
    expect(help).not.toContain('ranking opens');
    const p = publishStateOffer(f.review, f.data, f.binding, now);
    expect(p.publishedAt).toBe(now);
    expect(p.earliestRankingsCloseAt).toBe('2027-01-15T15:47:31.250Z');
    expect(Date.parse(p.earliestRankingsCloseAt) - Date.parse(now)).toBe(90 * 86400000);
    expect(p.earliestRankingsClose).toBe('2027-01-15');
  });
  it('discloses only the explicit publication fields and exact verified financial method', () => {
    const f = fixture(),
      p = publishStateOffer(f.review, f.data, f.binding, now);
    expect(p.financialTerms).toEqual(f.verification.financialTerms);
    expect(p.authority.version).toBe(f.verification.authorityVersion);
    const text = JSON.stringify(p);
    for (const value of [
      'INTERNAL',
      'PRIVATE BODY',
      'PRIVATE NOTES',
      f.state.id,
      f.reviewer.id,
      ...(f.authority.data['evidenceIds'] as string[]),
    ])
      expect(text).not.toContain(value);
    for (const key of [
      'evidenceIds',
      'history',
      'data',
      'ownerId',
      'verifierId',
      'origin',
      'reasons',
      'noNewHarm',
    ])
      expect(text).not.toContain('"' + key + '"');
    expect(PublishedStateOfferSchema.safeParse({ ...p, privateNotes: 'leak' }).success).toBe(false);
    expect(
      PublishedStateOfferSchema.safeParse({
        ...p,
        authority: { ...p.authority, verifierId: f.reviewer.id },
      }).success,
    ).toBe(false);
  });
  it.each(['2026-10-16', '2026-10-18'])(
    'rejects publication dates that fabricate a different acceptance day (%s)',
    (date) => {
      const f = fixture();
      expect(() =>
        publishStateOffer(f.review, { ...f.data, publishDate: date }, f.binding, now),
      ).toThrow(/today/);
    },
  );
  it('requires intentional disclosure and all substantive findings', () => {
    for (const key of [
      'discloseTerms',
      'rightsProtected',
      'presentlyProhibited',
      'termsComplete',
    ]) {
      const f = fixture();
      expect(() =>
        publishStateOffer(f.review, { ...f.data, [key]: false }, f.binding, now),
      ).toThrow(/Confirm/);
    }
  });
  it('checks the inclusive authority validity boundary and exact revision separately from the rate', () => {
    const f = fixture(),
      today = now.slice(0, 10);
    const authority = { ...f.verification, effectiveFrom: today, validThrough: today };
    const current = {
      state: 'verified',
      version: authority.authorityVersion,
      verification: authority,
    };
    expect(() => assertCurrentStateAuthority(authority, current, now)).not.toThrow();
    for (const change of [
      { state: 'withdrawn' },
      { version: current.version + 1 },
      { verification: { ...authority, packetDigest: 'f'.repeat(64) } },
    ])
      expect(() => assertCurrentStateAuthority(authority, { ...current, ...change }, now)).toThrow(
        /exact verified/,
      );
    for (const day of [addCalendarDays(today, -1), addCalendarDays(today, 1)])
      expect(() => assertCurrentStateAuthority(authority, current, day + 'T12:00:00Z')).toThrow(
        /exact verified/,
      );
  });
  it('rejects cross-state packets, changed financial method and changed bound terms', () => {
    const f = fixture();
    expect(() =>
      freezeStateOffer(f.offer, f.offer.data, {
        ...f.verification,
        origin: { ...f.verification.origin, institutionId: randomUUID() },
      }),
    ).toThrow(/same originating/);
    for (const financialTerms of [
      { ...f.verification.financialTerms, rate: { numerator: '1', denominator: '10' } },
      { ...f.verification.financialTerms, version: 'other' },
    ])
      expect(() =>
        freezeStateOffer(f.offer, { ...f.offer.data, financialTerms }, f.verification),
      ).toThrow();
    expect(() => assertStateOfferBinding(f.review, f.data, f.verification)).not.toThrow();
    for (const change of [
      { serviceObligations: 'Different service' },
      { commercialMenu: { Lease: ['Other'] } },
      { federalAuthority: 'Other authority' },
    ])
      expect(() =>
        assertStateOfferBinding(f.review, { ...f.data, ...change }, f.verification),
      ).toThrow(/frozen/);
    expect(() =>
      assertStateOfferBinding(f.review, f.data, { ...f.verification, authorityVersion: 99 }),
    ).toThrow(/frozen/);
  });
  it('preserves the original snapshot value independently of later withdrawal metadata', () => {
    const f = fixture(),
      p = publishStateOffer(f.review, f.data, f.binding, now),
      hash = digest(p);
    const withdrawn = {
      ...f.review,
      state: 'withdrawn',
      version: f.review.version + 2,
      data: { ...f.data, publishedStateOffer: p, reasons: 'INTERNAL future withdrawal' },
    };
    expect(digest(withdrawn.data.publishedStateOffer)).toBe(hash);
  });
  it('requires current independent supervision and exact originating-state ownership', () => {
    const f = fixture();
    expect(independentStateReviewer(f.reviewer, f.authority)).toBe(true);
    expect(statePacketOwner(f.state, f.authority)).toBe(true);
    for (const change of [
      { id: f.state.id },
      { institutionId: f.state.institutionId },
      { jurisdiction: 'OTHER' },
      { assignments: [] },
      { conflicts: [f.authority.id] },
      { assurance: 'verified' as const },
      { roles: ['support'] as Actor['roles'] },
      { realm: 'program' as const },
      ...['state', 'member', 'provider', 'investor', 'participant', 'representative'].map(
        (role) => ({ roles: ['supervisor', role] as Actor['roles'] }),
      ),
    ])
      expect(independentStateReviewer({ ...f.reviewer, ...change }, f.authority)).toBe(false);
    for (const change of [
      { roles: ['support'] as Actor['roles'] },
      { institutionId: randomUUID() },
      { jurisdiction: 'OTHER' },
      { conflicts: [f.authority.id] },
    ])
      expect(statePacketOwner({ ...f.state, ...change }, f.authority)).toBe(false);
  });
});
