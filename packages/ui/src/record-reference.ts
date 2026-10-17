import { RecordSchema, type CaseRecord } from '@cornerstone/contracts';
import { verifiedRecordOpening } from './record-opening.js';
/** An identifier is a reference, never an authorization token. */
export function currentRecordReference(
  raw: unknown,
  selected: CaseRecord,
  actorId: string,
): string {
  const baseline = RecordSchema.parse(selected);
  const { record } = verifiedRecordOpening(
    raw,
    baseline.id,
    { id: actorId, realm: baseline.realm },
    baseline.version,
  );
  if (
    record.realm !== 'simulation' ||
    record.realm !== baseline.realm ||
    record.id !== baseline.id ||
    record.kind !== baseline.kind ||
    record.version < baseline.version
  )
    throw Error('Current record access does not match the selected synthetic record.');
  return record.id;
}
