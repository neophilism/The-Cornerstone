import {
  CommandSchema,
  RespondFoundingInvitationSchema,
  RecordSchema,
  ReceiptSchema,
  type CaseRecord,
} from '@cornerstone/contracts';
export type MembershipAttempt = Readonly<{
  path: 'commands' | 'memberships/respond';
  wire: string;
  recordId: string;
  kind: CaseRecord['kind'];
  state: string;
  version: number;
  action: string;
}>;
export function prepareMembershipAction(
  path: MembershipAttempt['path'],
  raw: unknown,
  record: CaseRecord,
): MembershipAttempt {
  const request =
    path === 'commands' ? CommandSchema.parse(raw) : RespondFoundingInvitationSchema.parse(raw);
  const ballot = path === 'commands';
  if (
    record.realm !== 'simulation' ||
    request.recordId !== record.id ||
    request.expectedVersion !== record.version ||
    (ballot
      ? record.kind !== 'resolution' ||
        record.state !== 'voting' ||
        !('action' in request) ||
        request.action !== 'record_vote'
      : record.kind !== 'association' || !['submitted', 'review'].includes(record.state))
  )
    throw Error('The membership action does not match the current synthetic record.');
  return Object.freeze({
    path,
    wire: JSON.stringify(request),
    recordId: record.id,
    kind: record.kind,
    state: record.state,
    version: record.version,
    action: ballot ? 'record_vote' : 'founding_response',
  });
}
export function membershipRequest(attempt: MembershipAttempt) {
  return attempt.path === 'commands'
    ? CommandSchema.parse(JSON.parse(attempt.wire))
    : RespondFoundingInvitationSchema.parse(JSON.parse(attempt.wire));
}
export function membershipResult(raw: unknown, attempt: MembershipAttempt) {
  const value = raw as { record?: unknown; receipt?: unknown } | null;
  const record = RecordSchema.parse(value?.record),
    receipt = ReceiptSchema.parse(value?.receipt);
  if (
    record.id !== attempt.recordId ||
    record.kind !== attempt.kind ||
    record.realm !== 'simulation' ||
    record.state !== attempt.state ||
    record.version !== attempt.version + 1 ||
    receipt.recordId !== record.id ||
    receipt.version !== record.version ||
    receipt.realm !== 'simulation' ||
    receipt.action !== attempt.action ||
    receipt.authorityStatus !== 'simulation'
  )
    throw Error('The response did not contain the matching membership record and receipt.');
  return { record, receipt };
}
