import { RecordSchema, type CaseRecord } from '@cornerstone/contracts';
/** An identifier is a reference, never an authorization token. */
export function currentRecordReference(raw: unknown, selected: CaseRecord): string {
  const value = raw as { records?: unknown } | null;
  if (!value || !Array.isArray(value.records) || value.records.length !== 1)
    throw Error('Current record access is unavailable.');
  const record = RecordSchema.parse(value.records[0]),
    baseline = RecordSchema.parse(selected);
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
