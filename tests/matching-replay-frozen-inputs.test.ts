import { describe, expect, it } from 'vitest';
import { MatchingError, replayFailedMatches, type ReplayEvent } from '@cornerstone/matching';

const pair = (applicantId: string, offerId: string) => ({ applicantId, offerId });
const frozenRound = () => ({
  id: 'synthetic-immutable-round',
  algorithm: 'cornerstone-da-1' as const,
  applicants: [
    {
      id: 'a',
      priorityDate: '1900-01-01',
      choices: ['x'],
      ready: true,
      unremedied: true,
      constituents: ['unit-a'],
    },
    {
      id: 'b',
      priorityDate: '1900-01-01',
      choices: ['y'],
      ready: true,
      unremedied: true,
      constituents: ['unit-b'],
    },
  ],
  offers: [
    {
      id: 'x',
      publishedVersion: 'published-1',
      exclusiveRights: ['right-x'],
      eligibleApplicantIds: ['a', 'b'],
    },
    {
      id: 'y',
      publishedVersion: 'published-1',
      exclusiveRights: ['right-y'],
      eligibleApplicantIds: ['a', 'b'],
    },
  ],
  tieOrder: ['a', 'b'],
});
const original = [pair('a', 'x'), pair('b', 'y')];
const surviving = [pair('b', 'y')];
const failed: ReplayEvent = {
  sequence: 1,
  failed: pair('a', 'x'),
  before: original,
  after: surviving,
  willingApplicantIds: ['a', 'b'],
};

describe('CS-20 replay must preserve a single detached frozen matching round', () => {
  it('retains the original round identity if a replay array descriptor mutates the caller', () => {
    const round = frozenRound();
    const events = new Proxy([failed], {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'length') round.id = 'substituted-round';
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    const replay = replayFailedMatches(round, events);
    expect(round.id).toBe('substituted-round');
    expect(replay.roundId).toBe('synthetic-immutable-round');
    expect(replay.initial).toEqual(original);
    expect(replay.matches).toEqual(surviving);
  });

  it('does not reread amended original choices after inspecting a replay event', () => {
    const round = frozenRound();
    const events = new Proxy([failed], {
      getOwnPropertyDescriptor(target, key) {
        if (key === '0') round.applicants[0]!.choices = ['y'];
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    const replay = replayFailedMatches(round, events);
    expect(round.applicants[0]!.choices).toEqual(['y']);
    expect(replay.roundId).toBe('synthetic-immutable-round');
    expect(replay.matches).toEqual(surviving);
    expect(replay.declinedPairs).toEqual([pair('a', 'x')]);
  });

  it('returns a typed failure for non-cloneable round records', () => {
    const round = frozenRound();
    round.applicants[0] = new Proxy(round.applicants[0]!, {});
    try {
      replayFailedMatches(round, [failed]);
      throw new Error('Expected invalid frozen round.');
    } catch (error) {
      expect(error).toBeInstanceOf(MatchingError);
      expect((error as MatchingError).code).toBe('INVALID_ROUND');
    }
  });

  it('preserves normal replay and legitimate empty history', () => {
    const round = frozenRound();
    expect(replayFailedMatches(round, [failed]).matches).toEqual(surviving);
    expect(replayFailedMatches(round, [])).toMatchObject({
      roundId: 'synthetic-immutable-round',
      initial: original,
      matches: original,
      steps: [],
    });
  });
});
