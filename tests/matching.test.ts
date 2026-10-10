import { describe, it, expect } from 'vitest';
import { match, continueFailedMatch, type Round } from '@cornerstone/matching';
// Independently written reference: all offers use the same published event priority.
// Process that priority once and let each association choose its first eligible unoccupied offer.
function reference(round: Round) {
  const free = new Set(round.offers.map((o) => o.id));
  const winners: { applicantId: string; offerId: string }[] = [];
  for (const a of [...round.applicants].sort((x, y) =>
    x.priorityDate < y.priorityDate
      ? -1
      : x.priorityDate > y.priorityDate
        ? 1
        : round.tieOrder.indexOf(x.id) - round.tieOrder.indexOf(y.id),
  )) {
    const offer = a.choices.find(
      (id) =>
        free.has(id) && round.offers.find((o) => o.id === id)?.eligibleApplicantIds.includes(a.id),
    );
    if (offer) {
      free.delete(offer);
      winners.push({ applicantId: a.id, offerId: offer });
    }
  }
  return winners.sort((a, b) => a.offerId.localeCompare(b.offerId));
}
function round(choices: readonly (readonly string[])[], dates?: string[]): Round {
  return {
    id: 'synthetic-round',
    algorithm: 'cornerstone-da-1',
    applicants: choices.map((c, i) => ({
      id: `a${i}`,
      priorityDate: dates?.[i] || '1900-01-01',
      choices: c,
      ready: true,
      unremedied: true,
      constituents: [`a${i}`],
    })),
    offers: ['o0', 'o1', 'o2'].map((id) => ({
      id,
      exclusiveRights: [id],
      publishedVersion: 'synthetic-1',
      eligibleApplicantIds: choices.map((_, i) => `a${i}`),
    })),
    tieOrder: choices.map((_, i) => `a${i}`),
  };
}
describe('published common-priority matching', () => {
  it('prioritizes actual loss date, not applicant submission order', () => {
    const r = round(
      [
        ['o0', 'o1'],
        ['o0', 'o1'],
      ],
      ['1950-01-01', '1900-01-01'],
    );
    expect(match(r).matches).toEqual([
      { applicantId: 'a1', offerId: 'o0' },
      { applicantId: 'a0', offerId: 'o1' },
    ]);
  });
  it('never allocates an unranked or ineligible offer', () => {
    const r = round([[], ['o0']]);
    expect(match(r).matches).toEqual([{ applicantId: 'a1', offerId: 'o0' }]);
    expect(
      match({ ...r, offers: r.offers.map((o) => ({ ...o, eligibleApplicantIds: [] })) }).matches,
    ).toEqual([]);
  });
  it('matches the independent reference exhaustively for two applicants and all partial lists', () => {
    const lists = [[], ['o0'], ['o1'], ['o0', 'o1'], ['o1', 'o0']];
    let checked = 0;
    for (const x of lists)
      for (const y of lists)
        for (let eligibility = 0; eligibility < 16; eligibility++)
          for (const reverse of [false, true]) {
            const r = round([x, y]);
            const offers = r.offers.slice(0, 2).map((o, i) => ({
              ...o,
              eligibleApplicantIds: r.applicants
                .filter((_, j) => (eligibility & (1 << (i * 2 + j))) !== 0)
                .map((a) => a.id),
            }));
            const test = { ...r, offers, tieOrder: reverse ? ['a1', 'a0'] : ['a0', 'a1'] };
            expect(match(test).matches).toEqual(reference(test));
            checked++;
          }
    expect(checked).toBe(800);
  });
  it('passes 1000 seeded independent random rounds and permutation invariance', () => {
    let seed = 87301;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let n = 0; n < 1000; n++) {
      const r = round(
        Array.from({ length: 3 }, () =>
          ['o0', 'o1', 'o2']
            .map((id) => ({ id, v: random() }))
            .sort((a, b) => a.v - b.v)
            .filter(() => random() > 0.2)
            .map((x) => x.id),
        ),
        Array.from({ length: 3 }, () => `${1900 + Math.floor(random() * 3)}-01-01`),
      );
      expect(match(r).matches).toEqual(reference(r));
      expect(
        match({ ...r, applicants: [...r.applicants].reverse(), offers: [...r.offers].reverse() })
          .matches,
      ).toEqual(match(r).matches);
      const result = match(r).matches;
      expect(new Set(result.map((m) => m.applicantId)).size).toBe(result.length);
      expect(new Set(result.map((m) => m.offerId)).size).toBe(result.length);
    }
  });
  it('keeps active matches during failed-match continuation', () => {
    const r = round([['o0'], ['o1'], ['o0', 'o2']]);
    const active = match(r).matches;
    const failure = { applicantId: 'a0', offerId: 'o0' };
    const continued = continueFailedMatch(r, active, failure, ['a0', 'a2'], []);
    expect(continued).toContainEqual({ applicantId: 'a1', offerId: 'o1' });
    expect(continued.filter((m) => m.applicantId === 'a2')).toHaveLength(1);
    expect(continued).not.toContainEqual(failure);
  });
  it('rejects overlapping rights, duplicate constituents and invalid loss dates', () => {
    const r = round([['o0'], ['o1']]);
    expect(() =>
      match({ ...r, offers: r.offers.map((o) => ({ ...o, exclusiveRights: ['same'] })) }),
    ).toThrow(/overlapping/);
    expect(() =>
      match({ ...r, applicants: r.applicants.map((a) => ({ ...a, constituents: ['same'] })) }),
    ).toThrow(/constituent/);
    expect(() =>
      match({ ...r, applicants: r.applicants.map((a) => ({ ...a, priorityDate: '1900-99-99' })) }),
    ).toThrow(/actual/);
  });
});
