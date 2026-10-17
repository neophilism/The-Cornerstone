import { describe, expect, it } from 'vitest';
import {
  continueFailedMatch,
  match,
  MatchingError,
  type Match,
  type Round,
} from '@cornerstone/matching';

function fixture(
  choices: Record<string, readonly string[]> = { a: ['x', 'z'], b: ['y'], c: ['x'] },
  offers = ['x', 'y', 'z'],
): Round {
  const ids = Object.keys(choices);
  return {
    id: 'frozen-synthetic-round',
    algorithm: 'cornerstone-da-1',
    applicants: ids.map((id) => ({
      id,
      choices: choices[id]!,
      priorityDate: '1900-01-01',
      ready: true,
      unremedied: true,
      constituents: [`unit-${id}`],
    })),
    offers: offers.map((id) => ({
      id,
      publishedVersion: 'original-publication-1',
      exclusiveRights: [`right-${id}`],
      eligibleApplicantIds: ids,
    })),
    tieOrder: ids,
  };
}

const failure: Match = { applicantId: 'a', offerId: 'x' };
const active: readonly Match[] = [failure, { applicantId: 'b', offerId: 'y' }];
const expected: Match[] = [
  { applicantId: 'c', offerId: 'x' },
  { applicantId: 'b', offerId: 'y' },
  { applicantId: 'a', offerId: 'z' },
];

function rejects(code: string, operation: () => unknown) {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(MatchingError);
    expect((error as MatchingError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

describe('frozen failed-negotiation continuation', () => {
  it('returns the released offer to an unmatched willing applicant and advances the unsuccessful applicant', () => {
    const r = fixture();
    expect(match(r).matches).toEqual(active);
    expect(continueFailedMatch(r, active, failure, ['a', 'c'], [])).toEqual(expected);
  });

  it('preserves the other active match even when the unsuccessful applicant ranks it next', () => {
    const r = fixture({ a: ['x', 'y', 'z'], b: ['y'], c: ['x'] });
    expect(continueFailedMatch(r, active, failure, ['a', 'b', 'c'], [])).toEqual(expected);
  });

  it('uses the original loss priority and fixed public tie order for the released offer', () => {
    const r = fixture({ a: ['x', 'z'], b: ['y'], c: ['x'], d: ['x'] });
    const earlier = {
      ...r,
      applicants: r.applicants.map((a) => ({
        ...a,
        priorityDate: a.id === 'a' ? '1700-01-01' : a.id === 'd' ? '1800-01-01' : '1900-01-01',
      })),
    };
    const result = [
      { applicantId: 'd', offerId: 'x' },
      { applicantId: 'b', offerId: 'y' },
      { applicantId: 'a', offerId: 'z' },
    ];
    expect(continueFailedMatch(earlier, active, failure, ['a', 'c', 'd'], [])).toEqual(result);
    expect(
      continueFailedMatch(
        { ...r, tieOrder: ['a', 'b', 'd', 'c'] },
        active,
        failure,
        ['d', 'c', 'a'],
        [],
      ),
    ).toEqual(result);
  });

  it('never adds unwilling applicants and leaves survivors intact when nobody continues', () => {
    expect(continueFailedMatch(fixture(), active, failure, [], [])).toEqual([active[1]]);
    expect(continueFailedMatch(fixture(), active, failure, ['c'], [])).toEqual(
      expected.slice(0, 2),
    );
  });

  it('advances through cumulative failures without rewinding to an earlier newly free offer', () => {
    const r = fixture({ a: ['x', 'z'], b: ['y'], c: ['x', 'z'], d: ['z'] });
    const original = match(r).matches;
    expect(original).toEqual([...active, { applicantId: 'c', offerId: 'z' }]);
    const first = continueFailedMatch(r, original, failure, ['a', 'c', 'd'], []);
    expect(first).toEqual([
      { applicantId: 'b', offerId: 'y' },
      { applicantId: 'c', offerId: 'z' },
    ]);
    const secondFailure = { applicantId: 'c', offerId: 'z' };
    const second = continueFailedMatch(r, first, secondFailure, ['a', 'c', 'd'], [failure]);
    expect(second).toEqual([
      { applicantId: 'b', offerId: 'y' },
      { applicantId: 'a', offerId: 'z' },
    ]);
    const third = continueFailedMatch(
      r,
      second,
      { applicantId: 'a', offerId: 'z' },
      ['a', 'c', 'd'],
      [secondFailure, failure],
    );
    expect(third).toEqual([
      { applicantId: 'b', offerId: 'y' },
      { applicantId: 'd', offerId: 'z' },
    ]);
  });

  it('accepts an accumulated history that already contains this exact failure', () => {
    expect(continueFailedMatch(fixture(), active, failure, ['a', 'c'], [failure])).toEqual(
      expected,
    );
  });

  it('keeps opaque tuple identities distinct when delimiters occur in identifiers', () => {
    const r = fixture({ holder: ['b:c'], 'a:b': ['c'], a: ['b:c'] }, ['c', 'b:c']);
    const failed = { applicantId: 'holder', offerId: 'b:c' };
    const prior = { applicantId: 'a:b', offerId: 'c' };
    expect(continueFailedMatch(r, [failed], failed, ['a'], [prior])).toEqual([
      { applicantId: 'a', offerId: 'b:c' },
    ]);
  });

  it('is repeatable across input permutations and never changes frozen caller inputs', () => {
    const r = freeze(fixture());
    const current = freeze([...active]);
    const willing = freeze(['a', 'c']);
    const history = freeze([failure]);
    const before = JSON.stringify({ r, current, willing, history });
    for (let n = 0; n < 3; n++)
      expect(continueFailedMatch(r, current, failure, willing, history)).toEqual(expected);
    expect(
      continueFailedMatch(
        { ...r, applicants: [...r.applicants].reverse(), offers: [...r.offers].reverse() },
        [...current].reverse(),
        failure,
        [...willing].reverse(),
        history,
      ),
    ).toEqual(expected);
    expect(JSON.stringify({ r, current, willing, history })).toBe(before);
  });

  it('orders replay output and proposal traces without host-locale identifier collation', () => {
    const r = fixture({ ä: ['ä'], z: ['z'] }, ['ä', 'z']);
    const result = match(r);
    expect(result.matches.map((m) => m.offerId)).toEqual(['z', 'ä']);
    expect(result.trace.map((m) => m.applicantId)).toEqual(['z', 'ä']);
    expect(
      match({ ...r, applicants: [...r.applicants].reverse(), offers: [...r.offers].reverse() }),
    ).toEqual(result);
  });

  it.each([
    ['unknown applicant', { applicantId: 'absent', offerId: 'x' }],
    ['unknown offer', { applicantId: 'a', offerId: 'absent' }],
    ['unranked offer', { applicantId: 'a', offerId: 'y' }],
  ] as const)('rejects an active pair with an %s', (_, pair) => {
    rejects('INVALID_CONTINUATION_PAIR', () =>
      continueFailedMatch(fixture(), [pair, ...active], failure, ['a'], []),
    );
  });

  it('rejects an active pair outside the frozen eligibility list', () => {
    const r = fixture();
    rejects('INVALID_CONTINUATION_PAIR', () =>
      continueFailedMatch(
        {
          ...r,
          offers: r.offers.map((o) => (o.id === 'x' ? { ...o, eligibleApplicantIds: ['c'] } : o)),
        },
        active,
        failure,
        ['a'],
        [],
      ),
    );
  });

  it.each([
    ['duplicate pair', failure],
    ['second holding for an applicant', { applicantId: 'a', offerId: 'z' }],
    ['second holder for an offer', { applicantId: 'c', offerId: 'x' }],
  ] as const)('rejects %s', (_, pair) => {
    rejects('DUPLICATE_ACTIVE_MATCH', () =>
      continueFailedMatch(fixture(), [...active, pair], failure, ['a'], []),
    );
  });

  it('rejects failure of a valid pair that is not currently active', () => {
    rejects('INACTIVE_FAILURE', () =>
      continueFailedMatch(fixture(), active, { applicantId: 'c', offerId: 'x' }, ['a'], []),
    );
  });

  it.each([{ ids: ['a', 'a'] }, { ids: ['a', 'absent'] }])(
    'rejects non-unique or unknown willing identities $ids',
    ({ ids }) => {
      rejects('INVALID_WILLING_APPLICANTS', () =>
        continueFailedMatch(fixture(), active, failure, ids, []),
      );
    },
  );

  it('rejects duplicate failure history and a declined surviving active match', () => {
    rejects('DUPLICATE_DECLINE', () =>
      continueFailedMatch(fixture(), active, failure, ['a'], [failure, failure]),
    );
    rejects('ACTIVE_DECLINE', () =>
      continueFailedMatch(fixture(), active, failure, ['a'], [active[1]!]),
    );
    rejects('INVALID_CONTINUATION_PAIR', () =>
      continueFailedMatch(
        fixture(),
        active,
        failure,
        ['a'],
        [{ applicantId: 'absent', offerId: 'x' }],
      ),
    );
  });

  it('rejects regressed survivors and a current failure older than the recorded history', () => {
    const r = fixture({ a: ['x', 'y', 'z'], b: ['y'], c: ['x'] });
    const history = [{ applicantId: 'a', offerId: 'z' }];
    rejects('REGRESSED_ACTIVE_MATCH', () =>
      continueFailedMatch(r, active, active[1]!, ['a'], history),
    );
    rejects('REGRESSED_ACTIVE_MATCH', () =>
      continueFailedMatch(r, active, failure, ['a'], history),
    );
  });
});

describe('frozen round identity and eligibility inventory', () => {
  it('rejects blank round, applicant, offer, publication and right identities', () => {
    const r = fixture();
    rejects('INVALID_ID', () => match({ ...r, id: ' ' }));
    rejects('INVALID_ID', () => match({ ...r, applicants: [{ ...r.applicants[0]!, id: '' }] }));
    rejects('INVALID_ID', () => match({ ...r, offers: [{ ...r.offers[0]!, id: ' ' }] }));
    rejects('UNPUBLISHED_OFFER', () =>
      match({ ...r, offers: r.offers.map((o) => ({ ...o, publishedVersion: ' ' })) }),
    );
    rejects('INVALID_RIGHT', () =>
      match({ ...r, offers: r.offers.map((o) => ({ ...o, exclusiveRights: [' '] })) }),
    );
  });
  it.each([{ ids: ['a', 'a'] }, { ids: ['a', 'absent'] }])(
    'rejects unknown or duplicate frozen eligibility $ids',
    ({ ids }) => {
      const r = fixture();
      rejects('INVALID_ELIGIBILITY', () =>
        match({ ...r, offers: r.offers.map((o) => ({ ...o, eligibleApplicantIds: ids })) }),
      );
    },
  );
  it.each([{ ids: [] }, { ids: [' '] }])(
    'requires identified founding constituents $ids',
    ({ ids }) => {
      const r = fixture();
      rejects('INVALID_CONSTITUENT', () =>
        match({ ...r, applicants: r.applicants.map((a) => ({ ...a, constituents: ids })) }),
      );
    },
  );
});
