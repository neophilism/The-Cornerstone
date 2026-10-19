import { describe, expect, it } from 'vitest';
import {
  hashVerifiedReplay,
  match,
  REPLAY_COMMITMENT_DOMAIN,
  verifyVerifiedReplay,
  type ReplayCommitment,
  type ReplayEvent,
  type Round,
} from '@cornerstone/matching';

const pair = (applicantId: string, offerId: string) => ({ applicantId, offerId });
const sourceCommitSha = 'a'.repeat(40);
const round: Round = {
  id: 'synthetic-bound-receipt-round',
  algorithm: 'cornerstone-da-1',
  applicants: ['a', 'b', 'c', 'd'].map((id) => ({
    id,
    priorityDate: '1900-01-01',
    choices: id === 'a' ? ['x', 'z'] : id === 'b' ? ['y'] : id === 'c' ? ['x', 'z'] : ['z'],
    ready: true,
    unremedied: true,
    constituents: [`unit-${id}`],
  })),
  offers: ['x', 'y', 'z'].map((id) => ({
    id,
    publishedVersion: 'published-offer-1',
    exclusiveRights: [`right-${id}`],
    eligibleApplicantIds: ['a', 'b', 'c', 'd'],
  })),
  tieOrder: ['a', 'b', 'c', 'd'],
};
const first = [pair('a', 'x'), pair('b', 'y'), pair('c', 'z')];
const second = [pair('b', 'y'), pair('c', 'z')];
const third = [pair('b', 'y'), pair('a', 'z')];
const events: ReplayEvent[] = [
  {
    sequence: 1,
    failed: pair('a', 'x'),
    willingApplicantIds: ['a', 'c', 'd'],
    before: first,
    after: second,
  },
  {
    sequence: 2,
    failed: pair('c', 'z'),
    willingApplicantIds: ['a', 'c', 'd'],
    before: second,
    after: third,
  },
];

describe('CS-20 version-bound synthetic replay commitments', () => {
  it('binds a complete independently replayable verified transcript', async () => {
    expect(match(round).matches).toEqual(first);
    const { commitment, replay } = await hashVerifiedReplay(round, events, sourceCommitSha);
    expect(commitment.domain).toBe(REPLAY_COMMITMENT_DOMAIN);
    expect(commitment.hashAlgorithm).toBe('SHA-256');
    expect(commitment.sourceCommitSha).toBe(sourceCommitSha);
    expect(commitment.digestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(commitment.digestHex).toBe(
      'f34f76525f5471aa701b029a9ca6a88208353a3a252f95d939e753268a85fe7b',
    );
    expect(replay.matches).toEqual(third);
    const verified = await verifyVerifiedReplay(
      round,
      replay.verifiedEvents,
      commitment,
      sourceCommitSha,
    );
    expect(verified).toEqual(replay);
    const repeated = await hashVerifiedReplay(round, replay.verifiedEvents, sourceCommitSha);
    expect(repeated.commitment).toEqual(commitment);
  });

  it('normalizes sets but binds ordered choices, draw and source revision', async () => {
    const original = await hashVerifiedReplay(round, events, sourceCommitSha);
    const reordered: Round = {
      ...round,
      applicants: [...round.applicants].reverse(),
      offers: [...round.offers].reverse().map((offer) => ({
        ...offer,
        eligibleApplicantIds: [...offer.eligibleApplicantIds].reverse(),
      })),
    };
    const reorderedEvidence = events.map((event) => ({
      ...event,
      willingApplicantIds: [...event.willingApplicantIds].reverse(),
      before: [...event.before].reverse(),
      after: [...event.after].reverse(),
    }));
    expect(
      (await hashVerifiedReplay(reordered, reorderedEvidence, sourceCommitSha)).commitment,
    ).toEqual(original.commitment);
    const changedDraw: Round = { ...round, tieOrder: ['b', 'a', 'c', 'd'] };
    const changedDrawDigest = await hashVerifiedReplay(changedDraw, events, sourceCommitSha);
    expect(changedDrawDigest.commitment.digestHex).not.toBe(original.commitment.digestHex);
    const changedVersion: Round = {
      ...round,
      offers: round.offers.map((offer, index) =>
        index === 0 ? { ...offer, publishedVersion: 'published-offer-2' } : offer,
      ),
    };
    const versionChanged = await hashVerifiedReplay(changedVersion, events, sourceCommitSha);
    expect(versionChanged.commitment.digestHex).not.toBe(original.commitment.digestHex);
    const sourceChanged = await hashVerifiedReplay(round, events, 'b'.repeat(40));
    expect(sourceChanged.commitment.digestHex).not.toBe(original.commitment.digestHex);
    await expect(hashVerifiedReplay(round, events, 'short')).rejects.toMatchObject({
      code: 'INVALID_REPLAY_SOURCE_REVISION',
    });
  });

  it('rejects forged events, stale and malformed receipts', async () => {
    const { commitment } = await hashVerifiedReplay(round, events, sourceCommitSha);
    const forged = events.map((event, index) =>
      index === 0 ? { ...event, after: first } : event,
    );
    await expect(hashVerifiedReplay(round, forged, sourceCommitSha)).rejects.toMatchObject({
      code: 'REPLAY_MISMATCH',
    });
    const stale = { ...commitment, digestHex: '0'.repeat(64) };
    const staleVerification = verifyVerifiedReplay(round, events, stale, sourceCommitSha);
    await expect(staleVerification).rejects.toMatchObject({
      code: 'REPLAY_COMMITMENT_MISMATCH',
    });
    const malformed = { ...commitment, sourceCommitSha: 'unverified' };
    const malformedVerification = verifyVerifiedReplay(
      round,
      events,
      malformed as ReplayCommitment,
      sourceCommitSha,
    );
    await expect(malformedVerification).rejects.toMatchObject({
      code: 'INVALID_REPLAY_COMMITMENT',
    });
    const getterReceipt = Object.create(null) as Record<string, unknown>;
    for (const key of ['domain', 'hashAlgorithm', 'sourceCommitSha', 'digestHex']) {
      Object.defineProperty(getterReceipt, key, {
        enumerable: true,
        get() {
          throw new Error('evidence accessor must not run');
        },
      });
    }
    const getterVerification = verifyVerifiedReplay(
      round,
      events,
      getterReceipt as ReplayCommitment,
      sourceCommitSha,
    );
    await expect(getterVerification).rejects.toMatchObject({
      code: 'INVALID_REPLAY_COMMITMENT',
    });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const revokedVerification = verifyVerifiedReplay(
      round,
      events,
      revoked.proxy as ReplayCommitment,
      sourceCommitSha,
    );
    await expect(revokedVerification).rejects.toMatchObject({
      code: 'INVALID_REPLAY_COMMITMENT',
    });
  });

  it('rejects a rehashed receipt for a different trusted source revision', async () => {
    const original = await hashVerifiedReplay(round, events, sourceCommitSha);
    const substitutedSha = 'b'.repeat(40);
    const selfConsistentSubstitute = await hashVerifiedReplay(round, events, substitutedSha);
    const substitution = verifyVerifiedReplay(
      round,
      events,
      selfConsistentSubstitute.commitment,
      sourceCommitSha,
    );
    await expect(substitution).rejects.toMatchObject({
      code: 'REPLAY_COMMITMENT_SOURCE_MISMATCH',
    });
    const verifiedOriginal = await verifyVerifiedReplay(
      round,
      events,
      original.commitment,
      sourceCommitSha,
    );
    expect(verifiedOriginal).toEqual(original.replay);
    const wrongExpectation = verifyVerifiedReplay(
      round,
      events,
      original.commitment,
      'not-an-exact-sha',
    );
    await expect(wrongExpectation).rejects.toMatchObject({
      code: 'INVALID_REPLAY_SOURCE_REVISION',
    });
  });

  it('returns detached verified evidence and distinguishes empty history', async () => {
    const submitted = events.map((event) => ({
      ...event,
      failed: { ...event.failed },
    }));
    const { commitment, replay } = await hashVerifiedReplay(round, submitted, sourceCommitSha);
    submitted[0]!.failed.applicantId = 'tampered-after-call';
    const repeated = await hashVerifiedReplay(round, replay.verifiedEvents, sourceCommitSha);
    expect(repeated.commitment).toEqual(commitment);
    const empty = await hashVerifiedReplay(round, [], sourceCommitSha);
    expect(empty.replay.verifiedEvents).toEqual([]);
    expect(empty.commitment.digestHex).not.toBe(commitment.digestHex);
  });
});
