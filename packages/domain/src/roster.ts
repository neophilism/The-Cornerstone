import { FoundingUnitsSchema } from '@cornerstone/contracts';
import { DomainError } from './errors.js';

// Fixed two-column interchange for existing synthetic claim/person references.
// It never imports eligibility findings, consents or votes.
export function parseFoundingRoster(source: string) {
  if (new TextEncoder().encode(source).byteLength > 1000000)
    throw new DomainError('ROSTER_SIZE', 'This file exceeds the one-megabyte draft input limit.');
  const lines = source
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const columns = (line: string) =>
    line.split(',').map((cell) =>
      cell
        .trim()
        .replace(/^"([^"]*)"$/, '$1')
        .toLowerCase(),
    );
  if (columns(lines[0] ?? '').join(',') === 'claimid,personid') lines.shift();
  const units = lines.map((line, index) => {
    const cells = columns(line);
    if (cells.length !== 2)
      throw new DomainError(
        'ROSTER_COLUMNS',
        `Entry ${index + 1} needs exactly a claim ID and a person ID.`,
      );
    const parsed = FoundingUnitsSchema.safeParse([{ claimId: cells[0], personId: cells[1] }]);
    if (!parsed.success)
      throw new DomainError(
        'ROSTER_REFERENCE',
        `Entry ${index + 1} contains an invalid claim or person ID.`,
      );
    return parsed.data[0]!;
  });
  if (units.length < 2)
    throw new DomainError('ROSTER_TOO_SMALL', 'Import at least two proposed founders.');
  if (
    new Set(units.map((u) => u.claimId)).size !== units.length ||
    new Set(units.map((u) => u.personId)).size !== units.length
  )
    throw new DomainError(
      'ROSTER_DUPLICATE',
      'Each claim and each person may appear only once in this association.',
    );
  if (JSON.stringify(units).length > 1000000)
    throw new DomainError(
      'ROSTER_SIZE',
      'The resulting roster exceeds the saved draft size limit.',
    );
  return units;
}
