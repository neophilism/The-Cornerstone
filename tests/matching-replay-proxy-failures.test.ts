import { describe, expect, it } from 'vitest';
import {
  MatchingError,
  replayFailedMatches,
  type ReplayEvent,
  type Round,
} from '@cornerstone/matching';

const pair = (applicantId: string, offerId: string) => ({ applicantId, offerId });
const round: Round = {
  id: 'synthetic-revoked-proxy-round',
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
    publishedVersion: 'published-1',
    exclusiveRights: ['right-' + id],
    eligibleApplicantIds: ['a', 'b'],
  })),
  tieOrder: ['a', 'b'],
};
const event: ReplayEvent = {
  sequence: 1,
  failed: pair('a', 'x'),
  willingApplicantIds: ['a', 'b'],
  before: [pair('a', 'x'), pair('b', 'y')],
  after: [pair('b', 'y')],
};
function rejected(code: string, run: () => unknown) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MatchingError);
    expect((error as MatchingError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe('CS-20 malformed proxy evidence fails closed with typed errors', () => {
  it('rejects a revoked events array, without leaking an untyped error', () => {
    const values = Proxy.revocable([event], {});
    values.revoke();
    rejected('INVALID_REPLAY_EVENT', () => replayFailedMatches(round, values.proxy));
  });

  it('rejects a throwing outer transcript descriptor', () => {
    const values = new Proxy([event], {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'length') throw Error('unexpected outer trap failure');
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    rejected('INVALID_REPLAY_EVENT', () => replayFailedMatches(round, values));
  });

  it('rejects a revoked failed-pair proxy', () => {
    const values = Proxy.revocable(pair('a', 'x'), {});
    values.revoke();
    rejected('INVALID_REPLAY_EVENT', () =>
      replayFailedMatches(round, [{ ...event, failed: values.proxy }]),
    );
  });

  it('rejects a throwing descriptor on a nested pair without reading the next element', () => {
    let nextRead = false;
    const failed = new Proxy(pair('a', 'x'), {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'applicantId') throw Error('unexpected pair trap failure');
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    const before = new Proxy([pair('a', 'x'), pair('b', 'y')], {
      getOwnPropertyDescriptor(target, key) {
        if (key === '1') nextRead = true;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    rejected('INVALID_REPLAY_EVENT', () =>
      replayFailedMatches(round, [{ ...event, failed, before }]),
    );
    expect(nextRead).toBe(false);
  });

  it('preserves legitimate exact replay and empty history', () => {
    expect(replayFailedMatches(round, [event]).matches).toEqual([pair('b', 'y')]);
    expect(replayFailedMatches(round, []).steps).toEqual([]);
  });
});
