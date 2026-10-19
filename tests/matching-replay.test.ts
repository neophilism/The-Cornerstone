import { describe, expect, it } from 'vitest';
import { MatchingError, match, replayFailedMatches, type Round } from '@cornerstone/matching';

const round: Round = {
  id: 'synthetic-frozen-replay',
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
    publishedVersion: 'approved-version-1',
    exclusiveRights: ['right-' + id],
    eligibleApplicantIds: ['a', 'b', 'c', 'd'],
  })),
  tieOrder: ['a', 'b', 'c', 'd'],
};
const pair = (applicantId: string, offerId: string) => ({ applicantId, offerId });
const first = [pair('a', 'x'), pair('b', 'y'), pair('c', 'z')];
const second = [pair('b', 'y'), pair('c', 'z')];
const third = [pair('b', 'y'), pair('a', 'z')];
const fourth = [pair('b', 'y'), pair('d', 'z')];
const history = [
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
  {
    sequence: 3,
    failed: pair('a', 'z'),
    willingApplicantIds: ['a', 'c', 'd'],
    before: third,
    after: fourth,
  },
] as const;

function fails(code: string, operation: () => unknown) {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(MatchingError);
    expect((error as MatchingError).code).toBe(code);
    return;
  }
  throw new Error('Expected ' + code);
}

describe('frozen negotiation history replay', () => {
  it('recreates the exact initial and every cumulative successor allocation', () => {
    expect(match(round).matches).toEqual(first);
    const result = replayFailedMatches(round, history);
    expect(result.roundId).toBe(round.id);
    expect(result.initial).toEqual(first);
    expect(result.matches).toEqual(fourth);
    expect(result.steps.map((event) => event.matches)).toEqual([second, third, fourth]);
    expect(result.declinedPairs).toEqual(history.map((event) => event.failed));
    expect(replayFailedMatches(round, [])).toMatchObject({ initial: first, matches: first });
  });

  it('preserves frozen evidence and accepts only allocation-order permutations', () => {
    const untouched = JSON.stringify({ round, history });
    const permuted = history.map((event) => ({
      ...event,
      before: [...event.before].reverse(),
      after: [...event.after].reverse(),
    }));
    expect(replayFailedMatches(round, permuted).matches).toEqual(fourth);
    expect(JSON.stringify({ round, history })).toBe(untouched);
  });

  it('rejects missing, duplicate and reordered event sequence numbers', () => {
    fails('INVALID_REPLAY_SEQUENCE', () =>
      replayFailedMatches(round, [{ ...history[0], sequence: 2 }]),
    );
    fails('INVALID_REPLAY_SEQUENCE', () =>
      replayFailedMatches(round, [history[0], { ...history[1], sequence: 1 }]),
    );
  });

  it('rejects forged before/after states, changed willingness and repeated failures', () => {
    fails('REPLAY_MISMATCH', () => replayFailedMatches(round, [{ ...history[0], before: second }]));
    fails('REPLAY_MISMATCH', () => replayFailedMatches(round, [{ ...history[0], after: first }]));
    fails('REPLAY_MISMATCH', () =>
      replayFailedMatches(round, [history[0], { ...history[1], willingApplicantIds: ['d'] }]),
    );
    fails('INACTIVE_FAILURE', () =>
      replayFailedMatches(round, [history[0], { ...history[1], failed: history[0].failed }]),
    );
  });

  it('rejects malformed event objects, pairs and allocation snapshots without runtime errors', () => {
    fails('INVALID_REPLAY_EVENT', () => replayFailedMatches(round, [null] as never));
    fails('INVALID_REPLAY_EVENT', () =>
      replayFailedMatches(round, [{ ...history[0], failed: null }] as never),
    );
    fails('INVALID_REPLAY_EVENT', () =>
      replayFailedMatches(round, [{ ...history[0], willingApplicantIds: null }] as never),
    );
    fails('REPLAY_MISMATCH', () =>
      replayFailedMatches(round, [{ ...history[0], before: [null, ...first.slice(1)] }] as never),
    );
    fails('INVALID_REPLAY_EVENT', () => replayFailedMatches(round, null as never));
  });

  it('rejects excessive synthetic replay steps before processing the proposed transcript', () => {
    fails('REPLAY_TOO_LONG', () => replayFailedMatches(round, Array(32).fill(history[0])));
  });

  it('rejects evidence accessors before they can substitute a different reported failure', () => {
    let reads = 0;
    const event = { ...history[0] };
    Object.defineProperty(event, 'failed', {
      enumerable: true,
      get() {
        reads++;
        return reads < 3 ? pair('a', 'x') : pair('b', 'y');
      },
    });
    fails('INVALID_REPLAY_EVENT', () => replayFailedMatches(round, [event]));
    expect(reads).toBe(0);

    const failed = {
      get applicantId() {
        throw new Error('Untrusted pair getter must not execute.');
      },
      offerId: 'x',
    };
    fails('INVALID_REPLAY_EVENT', () => replayFailedMatches(round, [{ ...history[0], failed }]));

    const before = [...history[0].before];
    Object.defineProperty(before, 0, {
      get() {
        throw new Error('Untrusted allocation getter must not execute.');
      },
    });
    fails('REPLAY_MISMATCH', () => replayFailedMatches(round, [{ ...history[0], before }]));

    const events = [history[0]];
    Object.defineProperty(events, 0, {
      get() {
        throw new Error('Untrusted event-list getter must not execute.');
      },
    });
    fails('INVALID_REPLAY_EVENT', () => replayFailedMatches(round, events));
  });

  it('detaches accepted events from later modifications to caller-owned evidence', () => {
    const mutable = history.map((event) => ({
      ...event,
      failed: { ...event.failed },
      before: event.before.map((m) => ({ ...m })),
      after: event.after.map((m) => ({ ...m })),
      willingApplicantIds: [...event.willingApplicantIds],
    }));
    const verified = replayFailedMatches(round, mutable);
    mutable[0]!.failed.applicantId = 'tampered-after-verification';
    mutable[0]!.before[0]!.applicantId = 'tampered-after-verification';
    expect(verified.declinedPairs[0]).toEqual(pair('a', 'x'));
    expect(verified.steps[0]!.failed).toEqual(pair('a', 'x'));
    expect(verified.initial).toEqual(first);
  });
});
