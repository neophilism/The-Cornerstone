import { describe, expect, it } from 'vitest';
import { MatchingError, match, replayFailedMatches, type Round } from '@cornerstone/matching';

const pair = (applicantId: string, offerId: string) => ({ applicantId, offerId });
const round: Round = {
  id: 'synthetic-receipted-replay',
  algorithm: 'cornerstone-da-1',
  applicants: ['a', 'b', 'c', 'd'].map((id) => ({
    id,
    priorityDate: '1900-01-01',
    choices: id === 'a' ? ['x', 'z'] : id === 'b' ? ['y'] : id === 'c' ? ['x', 'z'] : ['z'],
    ready: true,
    unremedied: true,
    constituents: ['unit-' + id],
  })),
  offers: ['x', 'y', 'z'].map((id) => ({
    id,
    publishedVersion: 'published-version-1',
    exclusiveRights: ['right-' + id],
    eligibleApplicantIds: ['a', 'b', 'c', 'd'],
  })),
  tieOrder: ['a', 'b', 'c', 'd'],
};
const initial = [pair('a', 'x'), pair('b', 'y'), pair('c', 'z')];
const second = [pair('b', 'y'), pair('c', 'z')];
const third = [pair('b', 'y'), pair('a', 'z')];
const events = [
  {
    sequence: 1,
    failed: pair('a', 'x'),
    willingApplicantIds: ['a', 'c', 'd'],
    before: [...initial].reverse(),
    after: [...second].reverse(),
  },
  {
    sequence: 2,
    failed: pair('c', 'z'),
    willingApplicantIds: ['a', 'c', 'd'],
    before: [...second].reverse(),
    after: [...third].reverse(),
  },
];

describe('CS-20 replayable verified event receipts', () => {
  it('returns all inputs needed to replay the same independently supplied round', () => {
    expect(match(round).matches).toEqual(initial);
    const result = replayFailedMatches(round, events);
    expect(result.verifiedEvents).toEqual([
      { ...events[0], before: initial, after: second },
      { ...events[1], before: second, after: third },
    ]);
    expect(result.matches).toEqual(third);
    expect(result.steps.map((step) => step.matches)).toEqual([second, third]);
    expect(replayFailedMatches(round, result.verifiedEvents)).toEqual(result);
  });

  it('does not retain mutable caller evidence or alias its own independent outputs', () => {
    const input = structuredClone(events);
    const result = replayFailedMatches(round, input);
    input[0]!.failed.applicantId = 'substituted';
    input[0]!.willingApplicantIds[0] = 'substituted';
    input[0]!.before[0]!.offerId = 'substituted';
    input[1]!.after[0]!.offerId = 'substituted';
    expect(replayFailedMatches(round, result.verifiedEvents).matches).toEqual(third);
    expect(result.verifiedEvents[0]!.failed).toEqual(pair('a', 'x'));
    expect(result.verifiedEvents[0]!.willingApplicantIds).toEqual(['a', 'c', 'd']);

    // Consumers can mutate a returned JS object, but no receipt entry aliases another result field.
    (result.verifiedEvents[0]!.failed as { applicantId: string }).applicantId = 'changed';
    (result.verifiedEvents[0]!.after[0]! as { offerId: string }).offerId = 'changed';
    expect(result.declinedPairs[0]).toEqual(pair('a', 'x'));
    expect(result.steps[0]!.failed).toEqual(pair('a', 'x'));
    expect(result.steps[0]!.matches).toEqual(second);
    expect(result.verifiedEvents[1]!.before).toEqual(second);
  });

  it('does not issue a verified transcript for a forged allocation', () => {
    const forged = [{ ...events[0], after: initial }];
    expect(() => replayFailedMatches(round, forged)).toThrowError(MatchingError);
  });

  it('represents empty replay as a complete empty verified event list', () => {
    const result = replayFailedMatches(round, []);
    expect(result.verifiedEvents).toEqual([]);
    expect(replayFailedMatches(round, result.verifiedEvents)).toEqual(result);
  });
});
