import { describe, expect, it } from 'vitest';
import { hashVerifiedReplay, replayFailedMatches, type Round } from '@cornerstone/matching';

const sha = 'a'.repeat(40);
const validRound = (): Round => ({
  id: 'synthetic-bounded-input',
  algorithm: 'cornerstone-da-1',
  applicants: [
    {
      id: 'person-a',
      priorityDate: '1900-01-01',
      choices: ['offer-a'],
      ready: true,
      unremedied: true,
      constituents: ['unit-a'],
    },
  ],
  offers: [
    {
      id: 'offer-a',
      publishedVersion: 'v1',
      exclusiveRights: ['right-a'],
      eligibleApplicantIds: ['person-a'],
    },
  ],
  tieOrder: ['person-a'],
});

describe('CS-20 bounded direct and committed replay input', () => {
  it('rejects a malicious top-level getter without invoking it', async () => {
    const round = validRound();
    let executed = 0;
    Object.defineProperty(round, 'tieOrder', {
      enumerable: true,
      get() {
        executed++;
        return ['person-a'];
      },
    });
    expect(() => replayFailedMatches(round, [])).toThrowError(
      expect.objectContaining({ code: 'INVALID_ROUND' }),
    );
    await expect(hashVerifiedReplay(round, [], sha)).rejects.toMatchObject({
      code: 'INVALID_ROUND',
    });
    expect(executed).toBe(0);
  });

  it('rejects nested and array accessors before either replay path executes them', async () => {
    const round = validRound();
    let executed = 0;
    Object.defineProperty(round.applicants[0], 'choices', {
      enumerable: true,
      get() {
        executed++;
        return ['offer-a'];
      },
    });
    expect(() => replayFailedMatches(round, [])).toThrowError(
      expect.objectContaining({ code: 'INVALID_ROUND' }),
    );
    await expect(hashVerifiedReplay(round, [], sha)).rejects.toMatchObject({
      code: 'INVALID_ROUND',
    });
    expect(executed).toBe(0);

    const alternate = validRound();
    Object.defineProperty(alternate.offers[0]!.eligibleApplicantIds, '0', {
      configurable: true,
      get() {
        executed++;
        return 'person-a';
      },
    });
    expect(() => replayFailedMatches(alternate, [])).toThrowError(
      expect.objectContaining({ code: 'INVALID_ROUND' }),
    );
    expect(executed).toBe(0);
  });

  it('bounds untrusted round arrays before attempting matching or replay', async () => {
    const round = validRound();
    Object.defineProperty(round, 'tieOrder', {
      value: Array<string>(200_001).fill('person-a'),
    });
    expect(() => replayFailedMatches(round, [])).toThrowError(
      expect.objectContaining({ code: 'ROUND_INPUT_TOO_LARGE' }),
    );
    await expect(hashVerifiedReplay(round, [], sha)).rejects.toMatchObject({
      code: 'ROUND_INPUT_TOO_LARGE',
    });
  });

  it('fails closed with typed errors for revoked round proxies', async () => {
    const { proxy, revoke } = Proxy.revocable(validRound(), {});
    revoke();
    expect(() => replayFailedMatches(proxy, [])).toThrowError(
      expect.objectContaining({ code: 'INVALID_ROUND' }),
    );
    await expect(hashVerifiedReplay(proxy, [], sha)).rejects.toMatchObject({
      code: 'INVALID_ROUND',
    });
  });

  it('retains verified no-event results while detaching the input round', async () => {
    const round = validRound();
    const direct = replayFailedMatches(round, []);
    const committed = await hashVerifiedReplay(round, [], sha);
    expect(direct.initial).toEqual([{ applicantId: 'person-a', offerId: 'offer-a' }]);
    expect(direct.matches).toEqual(direct.initial);
    expect(committed.replay.matches).toEqual(direct.matches);
    (round.applicants[0] as { id: string }).id = 'modified-after-verification';
    expect(direct.matches).toEqual([{ applicantId: 'person-a', offerId: 'offer-a' }]);
  });
});
