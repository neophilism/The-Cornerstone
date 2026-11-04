import { describe, expect, it } from 'vitest';
import { SyntheticStateOfferObjections, type ObjectionActor } from '@cornerstone/domain';

const publishedAt = '2026-10-20T12:00:00.000Z';
const digest = 'a'.repeat(64);
const binding = () => ({
  offerId: 'synthetic-offer',
  publicationDigest: digest,
  authorityId: 'invented-authority',
  jurisdiction: 'XY',
  publishingInstitutionId: 'state',
  supervisingInstitutionId: 'independent-supervision',
  publishedAt,
});
const actor = (roles = ['member']): ObjectionActor => ({
  id: 'objector',
  institutionId: 'association',
  jurisdiction: 'XY',
  roles,
  active: true,
  conflicts: [],
});
const reviewer = (): ObjectionActor => ({
  ...actor(['supervisor']),
  id: 'independent-reviewer',
  institutionId: 'independent-supervision',
});
const petition = () => ({
  offerId: 'synthetic-offer',
  publicationDigest: digest,
  requestKey: 'submission-1',
  allegedNewHarm: 'Invented harm from a future choice',
  evidenceRefs: ['invented-evidence-1'],
  attestedSynthetic: true,
});
const decision = (id: string, revision: number) => ({
  objectionId: id,
  offerId: 'synthetic-offer',
  publicationDigest: digest,
  requestKey: 'decision-1',
  expectedRevision: revision,
  finding: 'no_harm_found' as const,
  reasons: 'Invented reasoning',
  evidenceRefs: ['invented-review-evidence'],
});

describe('CS-19 synthetic prospective state offer objections', () => {
  it('binds a filing to exact published terms and the exclusive UTC window', () => {
    const history = new SyntheticStateOfferObjections(binding());
    const receipt = history.file(petition(), actor(), publishedAt);
    expect(history.objectionWindowClosesAt).toBe('2026-12-19T12:00:00.000Z');
    expect(history.prospectiveObjectionHold).toBe(true);
    expect(history.file(petition(), actor(), history.objectionWindowClosesAt)).toEqual(receipt);
    expect(() =>
      history.file({ ...petition(), requestKey: 'late' }, actor(), history.objectionWindowClosesAt),
    ).toThrowError(expect.objectContaining({ code: 'OBJECTION_WINDOW_CLOSED' }));
    expect(history.existingCompactsUnaffected).toBe(true);
  });

  it('requires independently assigned current supervision', () => {
    const history = new SyntheticStateOfferObjections(binding());
    const receipt = history.file(petition(), actor(), publishedAt);
    const finding = decision(receipt.objectionId, receipt.revision);
    expect(() =>
      history.decide(finding, { ...reviewer(), id: 'objector' }, publishedAt),
    ).toThrowError(expect.objectContaining({ code: 'INDEPENDENT_REVIEW_REQUIRED' }));
    expect(() =>
      history.decide(finding, { ...reviewer(), roles: ['supervisor', 'state'] }, publishedAt),
    ).toThrowError(expect.objectContaining({ code: 'INDEPENDENT_REVIEW_REQUIRED' }));
    expect(history.decide(finding, reviewer(), publishedAt).revision).toBe(2);
    expect(history.prospectiveObjectionHold).toBe(false);
  });

  it('rejects conflicting retries, stale versions and changed published identities', () => {
    const history = new SyntheticStateOfferObjections(binding());
    const receipt = history.file(petition(), actor(), publishedAt);
    expect(() =>
      history.file({ ...petition(), allegedNewHarm: 'Changed terms' }, actor(), publishedAt),
    ).toThrowError(expect.objectContaining({ code: 'REQUEST_KEY_CONFLICT' }));
    const finding = decision(receipt.objectionId, receipt.revision);
    const accepted = history.decide(finding, reviewer(), publishedAt);
    expect(history.decide(finding, reviewer(), publishedAt)).toEqual(accepted);
    expect(() =>
      history.decide(
        { ...finding, requestKey: 'again', expectedRevision: 2 },
        reviewer(),
        publishedAt,
      ),
    ).toThrowError(expect.objectContaining({ code: 'OBJECTION_ALREADY_DECIDED' }));
    expect(() =>
      history.file(
        { ...petition(), publicationDigest: 'b'.repeat(64), requestKey: 'another' },
        actor(),
        publishedAt,
      ),
    ).toThrowError(expect.objectContaining({ code: 'OBJECTION_OFFER_MISMATCH' }));
  });

  it('rejects accessors without executing untrusted petition and actor getters', () => {
    const history = new SyntheticStateOfferObjections(binding());
    const supplied = petition();
    let calls = 0;
    Object.defineProperty(supplied, 'allegedNewHarm', {
      get() {
        calls++;
        return 'wrong';
      },
    });
    expect(() => history.file(supplied, actor(), publishedAt)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
    const wrongActor = { ...actor() };
    Object.defineProperty(wrongActor, 'roles', {
      get() {
        calls++;
        return ['member'];
      },
    });
    expect(() => history.file(petition(), wrongActor, publishedAt)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
    expect(calls).toBe(0);
  });

  it('preserves existing compacts despite a harm finding', () => {
    const history = new SyntheticStateOfferObjections(binding());
    const receipt = history.file(petition(), actor(), publishedAt);
    history.decide(
      { ...decision(receipt.objectionId, receipt.revision), finding: 'harm_found' },
      reviewer(),
      publishedAt,
    );
    expect(history.prospectiveObjectionHold).toBe(true);
    expect(history.existingCompactsUnaffected).toBe(true);
    expect(history.binding.publicationDigest).toBe(digest);
    expect(history.allRecords[0]?.status).toBe('harm_found');
  });

  it('isolates actor receipts from composite delimiter collisions and overlapping institutional IDs', () => {
    const history = new SyntheticStateOfferObjections(binding());
    const firstActor = { ...actor(), id: 'member:one' };
    const secondActor = { ...actor(), id: 'member' };
    const first = history.file({ ...petition(), requestKey: 'key' }, firstActor, publishedAt);
    const second = history.file({ ...petition(), requestKey: 'one:key' }, secondActor, publishedAt);
    const third = history.file(
      { ...petition(), requestKey: 'key' },
      { ...firstActor, institutionId: 'other-association' },
      publishedAt,
    );
    expect(first.actorId).toBe(firstActor.id);
    expect(second.actorId).toBe(secondActor.id);
    expect(first.objectionId).toBe('synthetic-objection-1');
    expect(second.objectionId).toBe('synthetic-objection-2');
    expect(third.objectionId).toBe('synthetic-objection-3');
    expect(history.revision).toBe(3);
  });

  it('isolates independent supervisor receipt keys containing delimiters', () => {
    const history = new SyntheticStateOfferObjections(binding());
    const first = history.file(petition(), actor(), publishedAt);
    const second = history.file(
      { ...petition(), requestKey: 'submission-2' },
      { ...actor(), id: 'other-member' },
      publishedAt,
    );
    const reviewerA = { ...reviewer(), id: 'reviewer:one' };
    const reviewerB = { ...reviewer(), id: 'reviewer' };
    const receiptA = history.decide(
      { ...decision(first.objectionId, history.revision), requestKey: 'key' },
      reviewerA,
      publishedAt,
    );
    const receiptB = history.decide(
      { ...decision(second.objectionId, history.revision), requestKey: 'one:key' },
      reviewerB,
      publishedAt,
    );
    expect(receiptA.objectionId).toBe(first.objectionId);
    expect(receiptB.objectionId).toBe(second.objectionId);
    expect(receiptB.revision).toBe(4);
    expect(history.prospectiveObjectionHold).toBe(false);
  });

  it('rejects new out-of-order filings but recovers the exact original receipt', () => {
    const history = new SyntheticStateOfferObjections(binding());
    const later = '2026-10-20T12:02:00.000Z';
    const earlier = '2026-10-20T12:01:00.000Z';
    const first = history.file(petition(), actor(), later);
    expect(history.file(petition(), actor(), earlier)).toEqual(first);
    expect(() =>
      history.file(
        { ...petition(), requestKey: 'new-earlier-filing' },
        { ...actor(), id: 'another-member' },
        earlier,
      ),
    ).toThrowError(expect.objectContaining({ code: 'OBJECTION_TIME_REWIND' }));
    expect(history.revision).toBe(1);
  });

  it('prevents supervisory decisions from predating another already accepted filing', () => {
    const history = new SyntheticStateOfferObjections(binding());
    const first = history.file(petition(), actor(), publishedAt);
    const later = '2026-10-20T12:02:00.000Z';
    const earlier = '2026-10-20T12:01:00.000Z';
    history.file(
      { ...petition(), requestKey: 'second' },
      { ...actor(), id: 'another-member' },
      later,
    );
    const finding = decision(first.objectionId, history.revision);
    expect(() => history.decide(finding, reviewer(), earlier)).toThrowError(
      expect.objectContaining({ code: 'OBJECTION_TIME_REWIND' }),
    );
    expect(history.revision).toBe(2);
    expect(history.decide(finding, reviewer(), later).revision).toBe(3);
  });
});
