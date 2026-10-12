import { RecordSchema, type CaseRecord } from '@cornerstone/contracts';

export type ExportReview = { record: CaseRecord; content: string };
const maximumBytes = 2_000_000;
function canonical(value: unknown, ancestors = new Set<object>(), depth = 0): unknown {
  if (depth > 50) throw Error('Record nesting exceeds the export limit.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || !value || ancestors.has(value))
    throw Error('The record is not a finite JSON value.');
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null)
    throw Error('The record is not a JSON object.');
  const next = new Set(ancestors).add(value);
  if (Array.isArray(value)) return Array.from(value, (entry) => canonical(entry, next, depth + 1));
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!('value' in descriptor)) throw Error('Computed record fields cannot be exported.');
        return [key, canonical(descriptor.value, next, depth + 1)];
      }),
  );
}
function content(record: CaseRecord): string {
  const result =
    JSON.stringify(
      canonical({
        format: 'cornerstone-synthetic-record/v1',
        notice: 'Synthetic preparation only; not a legal filing or an independently signed record.',
        record,
      }),
      null,
      2,
    ) + '\n';
  if (new TextEncoder().encode(result).byteLength > maximumBytes)
    throw Error('Record exceeds the bounded export size.');
  return result;
}
/** Only the current authenticated read result can prepare a synthetic export. */
export function reviewRecordExport(raw: unknown, selected: CaseRecord): ExportReview {
  const baseline = RecordSchema.parse(selected);
  const value = raw as { records?: unknown } | null;
  if (!value || !Array.isArray(value.records) || value.records.length !== 1)
    throw Error('Current record access could not be verified.');
  const record = RecordSchema.parse(value.records[0]);
  if (
    baseline.realm !== 'simulation' ||
    record.realm !== baseline.realm ||
    record.id !== baseline.id ||
    record.kind !== baseline.kind ||
    record.version < baseline.version
  )
    throw Error('Current record does not match the selected synthetic record.');
  return { record, content: content(record) };
}
/** Recheck access and bind disclosure consent to the exact reviewed saved version. */
export function confirmRecordExport(
  raw: unknown,
  reviewed: ExportReview,
  consent: boolean,
): { status: 'ready'; content: string } | { status: 'changed'; review: ExportReview } {
  if (consent !== true) throw Error('Explicit export consent is required.');
  const current = reviewRecordExport(raw, reviewed.record);
  if (current.record.version > reviewed.record.version)
    return { status: 'changed', review: current };
  if (current.content !== reviewed.content)
    throw Error('The reviewed saved version changed without a version increment.');
  return { status: 'ready', content: current.content };
}
