import { describe, expect, it } from 'vitest';
import { MatchingError, match, replayFailedMatches, type Round } from '@cornerstone/matching';

const round: Round = {
  id: 'synthetic-single-event-bounds',
  algorithm: 'cornerstone-da-1',
  applicants: ['a', 'b'].map((id) => ({
    id,
    priorityDate: '1900-01-01',
    choices: id === 'a' ? ['x'] : ['y'],
    ready: true,
    unremedied: true,
    constituents: ['unit-' + id],
  })),
  offers: ['x', 'y'].map((id) => ({
    id,
    publishedVersion: 'approved-version-1',
    exclusiveRights: ['right-' + id],
    eligibleApplicantIds: ['a', 'b'],
  })),
  tieOrder: ['a', 'b'],
};
const pair = (applicantId: string, offerId: string) => ({ applicantId, offerId });
const initial = [pair('a', 'x'), pair('b', 'y')];
const after = [pair('b', 'y')];
const event = {
  sequence: 1,
  failed: pair('a', 'x'),
  before: initial,
  after,
  willingApplicantIds: ['a', 'b'],
};
function rejects(code: string, run: () => unknown) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MatchingError);
    expect((error as MatchingError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe('CS-20 replay per-event cardinality bounds', () => {
  it('preserves a valid frozen replay and its original allocations', () => {
    expect(match(round).matches).toEqual(initial);
    const result = replayFailedMatches(round, [event]);
    expect(result.matches).toEqual(after);
    expect(result.declinedPairs).toEqual([pair('a', 'x')]);
  });

  it('rejects forged negative event counts instead of returning a successful empty transcript', () => {
    const forgedLength = new Proxy([event], {
      getOwnPropertyDescriptor(target, property) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
        if (property === 'length' && descriptor) return { ...descriptor, value: -1 };
        return descriptor;
      },
    });
    rejects('INVALID_REPLAY_EVENT', () => replayFailedMatches(round, forgedLength));
    expect(replayFailedMatches(round, [])).toMatchObject({ matches: initial, steps: [] });
  });

  it('rejects oversized before and after arrays before evaluating their first elements', () => {
    let reads = 0;
    const oversized = new Proxy(Array(1_000).fill(pair('a', 'x')), {
      getOwnPropertyDescriptor(target, key) {
        if (key === '0') {
          reads++;
          throw new Error('Must not inspect an oversized allocation descriptor.');
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    rejects('REPLAY_MISMATCH', () => replayFailedMatches(round, [{ ...event, before: oversized }]));
    rejects('REPLAY_MISMATCH', () => replayFailedMatches(round, [{ ...event, after: oversized }]));
    expect(reads).toBe(0);
  });

  it('rejects oversized willingness lists before evaluating any element', () => {
    let reads = 0;
    const oversized = new Proxy(Array(1_000).fill('a'), {
      getOwnPropertyDescriptor(target, key) {
        if (key === '0') {
          reads++;
          throw new Error('Must not inspect an oversized willingness descriptor.');
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    rejects('INVALID_REPLAY_EVENT', () =>
      replayFailedMatches(round, [{ ...event, willingApplicantIds: oversized }]),
    );
    expect(reads).toBe(0);
  });
});
