import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { parseFoundingRoster } from '@cornerstone/domain';
const rows = () =>
  Array.from({ length: 2 }, () => ({ claimId: randomUUID(), personId: randomUUID() }));
const csv = (units: ReturnType<typeof rows>) =>
  units.map((u) => `${u.claimId},${u.personId}`).join('\n');
it('imports fixed claim/person references from spreadsheet CSV without creating findings', () => {
  const units = rows();
  expect(
    parseFoundingRoster(
      '\uFEFF"claimId","personId"\r\n' + csv(units).toUpperCase().replaceAll('\n', '\r\n'),
    ),
  ).toEqual(units);
});
it('rejects repeated claims and people, including alternate UUID casing', () => {
  const units = rows();
  expect(() =>
    parseFoundingRoster(
      csv([units[0]!, { ...units[1]!, claimId: units[0]!.claimId.toUpperCase() }]),
    ),
  ).toThrow(/only once/);
  expect(() =>
    parseFoundingRoster(csv([units[0]!, { ...units[1]!, personId: units[0]!.personId }])),
  ).toThrow(/only once/);
});
it('rejects malformed references, extra columns and incomplete cohorts', () => {
  expect(() => parseFoundingRoster('claimId,personId\n=1+1,anything')).toThrow(/invalid/);
  expect(() => parseFoundingRoster(csv(rows()) + ',unexpected')).toThrow(/exactly/);
  expect(() => parseFoundingRoster(csv(rows().slice(0, 1)))).toThrow(/at least two/);
});
it('supports 2,501 proposed founders without treating import as scale approval', () => {
  const units = Array.from({ length: 2501 }, () => ({
    claimId: randomUUID(),
    personId: randomUUID(),
  }));
  expect(parseFoundingRoster(csv(units))).toEqual(units);
});
it('bounds both file bytes and the resulting structured request', () => {
  expect(() => parseFoundingRoster('x'.repeat(1000001))).toThrow(/one-megabyte/);
  const units = Array.from({ length: 10000 }, () => ({
    claimId: randomUUID(),
    personId: randomUUID(),
  }));
  expect(() => parseFoundingRoster(csv(units))).toThrow(/saved draft size/);
});
