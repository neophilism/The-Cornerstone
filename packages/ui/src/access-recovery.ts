import {
  GrantDraftAccessSchema,
  RevokeDraftAccessSchema,
  RecordSchema,
  ReceiptSchema,
  draftAccessKinds,
  type CaseRecord,
} from '@cornerstone/contracts';

export type AccessAttempt = Readonly<{
  path: 'access/grant' | 'access/revoke';
  wire: string;
  kind: CaseRecord['kind'];
  state: string;
}>;

/** Exact intent is retained in this tab; it grants no authority to execute it. */
export function prepareAccess(
  path: AccessAttempt['path'],
  raw: unknown,
  baseline: CaseRecord,
): AccessAttempt {
  const request = (
    path === 'access/grant' ? GrantDraftAccessSchema : RevokeDraftAccessSchema
  ).parse(raw);
  if (
    baseline.realm !== 'simulation' ||
    !(draftAccessKinds as readonly string[]).includes(baseline.kind) ||
    request.recordId !== baseline.id ||
    request.expectedVersion !== baseline.version ||
    ('allowDraftEdits' in request && request.allowDraftEdits && baseline.state !== 'draft')
  )
    throw Error('The access request does not match the selected synthetic preparation record.');
  return Object.freeze({
    path,
    wire: JSON.stringify(request),
    kind: baseline.kind,
    state: baseline.state,
  });
}
export function accessRequest(attempt: AccessAttempt) {
  return (attempt.path === 'access/grant' ? GrantDraftAccessSchema : RevokeDraftAccessSchema).parse(
    JSON.parse(attempt.wire),
  );
}
/** A matching historical receipt is distinct from the record's current grants. */
export function accessResult(raw: unknown, attempt: AccessAttempt) {
  const value = raw as { record?: unknown; receipt?: unknown } | null;
  const record = RecordSchema.parse(value?.record),
    receipt = ReceiptSchema.parse(value?.receipt),
    request = accessRequest(attempt);
  if (
    record.id !== request.recordId ||
    record.realm !== 'simulation' ||
    record.kind !== attempt.kind ||
    record.state !== attempt.state ||
    record.version !== request.expectedVersion + 1 ||
    receipt.recordId !== record.id ||
    receipt.version !== record.version ||
    receipt.realm !== 'simulation' ||
    receipt.authorityStatus !== 'simulation' ||
    receipt.action !==
      (attempt.path === 'access/grant' ? 'grant_draft_access' : 'revoke_draft_access')
  )
    throw Error('The response did not contain the matching access record and receipt.');
  return { record, receipt };
}
