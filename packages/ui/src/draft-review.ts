import {
  RecordSchema,
  ReceiptSchema,
  RecordCapabilitiesSchema,
  type CaseRecord,
  type Command,
} from '@cornerstone/contracts';
export type DraftData = Record<string, unknown>;
export type DraftConflict = { field: string; local: unknown; current: unknown };
export type DraftReview = { proposed: DraftData; conflicts: DraftConflict[]; changed: string[] };

/** A server rejection and an unconfirmed response are different recovery states. */
export class WorkspaceRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceRequestError';
  }
}
export function saveFailure(error: unknown, retry = false): 'stale' | 'rejected' | 'uncertain' {
  // A later denial cannot establish whether the original unconfirmed save committed.
  if (retry) return 'uncertain';
  if (!(error instanceof WorkspaceRequestError) || error.status === 408) return 'uncertain';
  if (error.status === 409 && error.code === 'STALE_VERSION') return 'stale';
  return error.status >= 400 && error.status < 500 ? 'rejected' : 'uncertain';
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, i) => same(value, b[i]))
    );
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = a as DraftData,
    right = b as DraftData;
  const keys = Object.keys(left)
    .filter((key) => left[key] !== undefined)
    .sort();
  const other = Object.keys(right)
    .filter((key) => right[key] !== undefined)
    .sort();
  return (
    keys.length === other.length &&
    keys.every((key, i) => key === other[i] && same(left[key], right[key]))
  );
}
function put(target: DraftData, field: string, value: unknown) {
  if (value === undefined) delete target[field];
  else
    Object.defineProperty(target, field, {
      value: structuredClone(value),
      writable: true,
      enumerable: true,
      configurable: true,
    });
}
/** Restrict to editable fields. Arrays and structured values are reviewed atomically. */
export function reviewDraft(
  fields: readonly string[],
  base: DraftData,
  local: DraftData,
  current: DraftData,
): DraftReview {
  const proposed: DraftData = {},
    conflicts: DraftConflict[] = [],
    changed: string[] = [];
  for (const field of new Set(fields)) {
    const mineChanged = !same(base[field], local[field]);
    const savedChanged = !same(base[field], current[field]);
    if (mineChanged || savedChanged) changed.push(field);
    if (mineChanged && savedChanged && !same(local[field], current[field]))
      conflicts.push({
        field,
        local: structuredClone(local[field]),
        current: structuredClone(current[field]),
      });
    put(proposed, field, mineChanged ? local[field] : current[field]);
  }
  return { proposed, conflicts, changed };
}
export function resolveDraft(
  review: DraftReview,
  choices: Record<string, 'local' | 'current'>,
): DraftData {
  const result = structuredClone(review.proposed);
  if (
    Object.keys(choices).some((key) => !review.conflicts.some((conflict) => conflict.field === key))
  )
    throw Error('A review choice does not belong to this draft comparison.');
  for (const conflict of review.conflicts) {
    const choice = choices[conflict.field];
    if (choice !== 'local' && choice !== 'current')
      throw Error('Choose a value for every conflicting field.');
    put(result, conflict.field, conflict[choice]);
  }
  return result;
}
export function currentDraft(raw: unknown, baseline: CaseRecord) {
  const value = raw as { records?: unknown; capabilities?: unknown } | null;
  if (!value || !Array.isArray(value.records) || value.records.length !== 1)
    throw Error('The current saved version could not be verified.');
  const record = RecordSchema.parse(value.records[0]);
  const capabilities = RecordCapabilitiesSchema.array().parse(value.capabilities);
  if (
    record.id !== baseline.id ||
    record.kind !== baseline.kind ||
    record.realm !== baseline.realm ||
    record.version < baseline.version
  )
    throw Error('The current saved version does not match this draft.');
  const editable =
    record.state === 'draft' &&
    capabilities.some(
      (item) =>
        item.recordId === record.id &&
        item.version === record.version &&
        item.actions.includes('save_draft'),
    );
  return { record, editable };
}
/** Correlation checks, not a signature or independent receipt attestation. */
export function draftSaveResult(raw: unknown, attempt: Command, baseline: CaseRecord) {
  const value = raw as { record?: unknown; receipt?: unknown } | null;
  const record = RecordSchema.parse(value?.record),
    receipt = ReceiptSchema.parse(value?.receipt);
  if (
    attempt.recordId !== baseline.id ||
    attempt.action !== 'save_draft' ||
    attempt.expectedVersion !== baseline.version ||
    record.id !== baseline.id ||
    record.kind !== baseline.kind ||
    record.realm !== baseline.realm ||
    record.state !== 'draft' ||
    record.version !== attempt.expectedVersion + 1 ||
    receipt.recordId !== record.id ||
    receipt.version !== record.version ||
    receipt.realm !== record.realm ||
    receipt.action !== 'save_draft' ||
    (record.realm === 'simulation' && receipt.authorityStatus !== 'simulation')
  )
    throw Error('The save response did not contain a matching record and receipt.');
  return { record, receipt };
}
export function showDraftValue(value: unknown): string {
  return value === undefined
    ? '(not provided; the field is cleared)'
    : typeof value === 'string'
      ? value || '(empty)'
      : JSON.stringify(value, null, 2);
}
