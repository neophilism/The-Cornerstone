import {
  UploadSyntheticEvidenceSchema,
  ValidateSyntheticEvidenceSchema,
  RecordSchema,
  ReceiptSchema,
  type CaseRecord,
} from '@cornerstone/contracts';
export type EvidenceAttempt = Readonly<{
  path: 'evidence/upload' | 'evidence/validate';
  wire: string;
  kind: CaseRecord['kind'];
  state: string;
}>;
export function prepareEvidence(
  path: EvidenceAttempt['path'],
  raw: unknown,
  baseline: CaseRecord,
): EvidenceAttempt {
  const request = (
    path === 'evidence/upload' ? UploadSyntheticEvidenceSchema : ValidateSyntheticEvidenceSchema
  ).parse(raw);
  if (
    baseline.realm !== 'simulation' ||
    baseline.state !== 'draft' ||
    request.recordId !== baseline.id ||
    request.expectedVersion !== baseline.version
  )
    throw Error('The evidence request does not match the selected synthetic draft.');
  return Object.freeze({
    path,
    wire: JSON.stringify(request),
    kind: baseline.kind,
    state: baseline.state,
  });
}
export function evidenceRequest(attempt: EvidenceAttempt) {
  return (
    attempt.path === 'evidence/upload'
      ? UploadSyntheticEvidenceSchema
      : ValidateSyntheticEvidenceSchema
  ).parse(JSON.parse(attempt.wire));
}
export function evidenceResult(raw: unknown, attempt: EvidenceAttempt) {
  const value = raw as { record?: unknown; receipt?: unknown } | null;
  const record = RecordSchema.parse(value?.record),
    receipt = ReceiptSchema.parse(value?.receipt),
    request = evidenceRequest(attempt);
  const action =
    attempt.path === 'evidence/upload'
      ? 'upload_synthetic_evidence'
      : 'validate_synthetic_evidence';
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
    receipt.action !== action
  )
    throw Error('The response did not contain a matching evidence action and receipt.');
  return { record, receipt };
}
