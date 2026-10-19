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
    expect(await verifyVerifiedReplay(round, replay.verifiedEvents, commitment)).toEqual(replay);
    expect((await hashVerifiedReplay(round, replay.verifiedEvents, sourceCommitSha)).commitment).toEqual(
      commitment,
    );
  });

  it('normalizes sets but binds ordered rankings, public draw and exact source revision', async () => {
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
    expect((await hashVerifiedReplay(changedDraw, events, sourceCommitSha)).commitment.digestHex).not.toBe(
      original.commitment.digestHex,
    );
    const changedVersion: Round = {
      ...round,
      offers: round.offers.map((offer, index) =>
        index === 0 ? { ...offer, publishedVersion: 'published-offer-2' } : offer,
      ),
    };
    expect(
      (await hashVerifiedReplay(changedVersion, events, sourceCommitSha)).commitment.digestHex,
    ).not.toBe(original.commitment.digestHex);
    expect((await hashVerifiedReplay(round, events, 'b'.repeat(40))).commitment.digestHex).not.toBe(
      original.commitment.digestHex,
    );
    await expect(hashVerifiedReplay(round, events, 'short')).rejects.toMatchObject({
      code: 'INVALID_REPLAY_SOURCE_REVISION',
    });
  });

  it('rejects forged events and stale or malformed receipts before reporting verification', async () => {
    const { commitment } = await hashVerifiedReplay(round, events, sourceCommitSha);
    const forged = events.map((event, index) =>
      index === 0 ? { ...event, after: first } : event,
    );
    await expect(hashVerifiedReplay(round, forged, sourceCommitSha)).rejects.toMatchObject({
      code: 'REPLAY_MISMATCH',
    });
    const stale = { ...commitment, digestHex: '0'.repeat(64) };
    await expect(verifyVerifiedReplay(round, events, stale)).rejects.toMatchObject({
      code: 'REPLAY_COMMITMENT_MISMATCH',
    });
    const malformed = { ...commitment, sourceCommitSha: 'unverified' };
    await expect(
      verifyVerifiedReplay(round, events, malformed as ReplayCommitment),
    ).rejects.toMatchObject({ code: 'INVALID_REPLAY_COMMITMENT' });
    const getterReceipt = Object.create(null) as Record<string, unknown>;
    for (const key of ['domain', 'hashAlgorithm', 'sourceCommitSha', 'digestHex']) {
      Object.defineProperty(getterReceipt, key, {
        enumerable: true,
        get() {
          throw new Error('evidence accessor must not run');
        },
      });
    }
    await expect(
      verifyVerifiedReplay(round, events, getterReceipt as ReplayCommitment),
    ).rejects.toMatchObject({ code: 'INVALID_REPLAY_COMMITMENT' });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    await expect(
      verifyVerifiedReplay(round, events, revoked.proxy as ReplayCommitment),
    ).rejects.toMatchObject({ code: 'INVALID_REPLAY_COMMITMENT' });
  });

  it('returns detached verified evidence and distinguishes empty history', async () => {
    const submitted = events.map((event) => ({
      ...event,
      failed: { ...event.failed },
    }));
    const { commitment, replay } = await hashVerifiedReplay(round, submitted, sourceCommitSha);
    submitted[0]!.failed.applicantId = 'tampered-after-call';
    expect((await hashVerifiedReplay(round, replay.verifiedEvents, sourceCommitSha)).commitment).toEqual(
      commitment,
    );
    const empty = await hashVerifiedReplay(round, [], sourceCommitSha);
    expect(empty.replay.verifiedEvents).toEqual([]);
    expect(empty.commitment.digestHex).not.toBe(commitment.digestHex);
  });
});
