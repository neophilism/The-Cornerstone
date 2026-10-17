import {
  EvidencePageSchema,
  IdSchema,
  MembershipSnapshotSchema,
  type CaseRecord,
  type EvidenceView,
  type FoundingMembershipView,
} from '@cornerstone/contracts';

export type ReferenceRead = (path: string) => Promise<{
  data: unknown;
  isCurrent: () => boolean;
}>;
export type VerifiedPrivateReference = { id: string; isCurrent: () => boolean };

export async function preparePrivateReference(
  read: ReferenceRead,
  path: string,
  validate: (raw: unknown) => string,
): Promise<VerifiedPrivateReference> {
  const response = await read(path);
  if (!response.isCurrent()) throw Error('The session changed before reference validation.');
  const id = IdSchema.parse(validate(response.data));
  return Object.freeze({ id, isCurrent: response.isCurrent });
}

/** The retained session guard is checked at the final synchronous disclosure boundary. */
export function disclosePrivateReference<T>(
  reference: VerifiedPrivateReference,
  disclose: (id: string) => T,
): T {
  if (!reference.isCurrent()) throw Error('The session changed before reference disclosure.');
  return disclose(reference.id);
}

export function verifiedMemberships(raw: unknown, actorId: string) {
  const snapshot = MembershipSnapshotSchema.parse(raw);
  if (
    snapshot.context.actorId !== actorId ||
    snapshot.context.realm !== 'simulation' ||
    snapshot.invitations.some((invitation) => invitation.personId !== actorId) ||
    new Set(snapshot.units.map((unit) => unit.unitId)).size !== snapshot.units.length
  )
    throw Error('Current membership access does not match this workspace.');
  return snapshot;
}

export function currentMembershipReference(
  raw: unknown,
  selected: FoundingMembershipView,
  actorId: string,
) {
  const snapshot = verifiedMemberships(raw, actorId);
  const matches = snapshot.units.filter((unit) => unit.unitId === selected.unitId);
  const unit = matches[0];
  if (
    matches.length !== 1 ||
    !unit ||
    unit.associationId !== selected.associationId ||
    unit.claimId !== selected.claimId ||
    unit.successor !== selected.successor
  )
    throw Error('Current membership no longer matches this founding unit.');
  return unit.unitId;
}

export function verifiedEvidencePage(raw: unknown, record: CaseRecord, actorId: string) {
  const page = EvidencePageSchema.parse(raw);
  if (
    record.realm !== 'simulation' ||
    page.context.actorId !== actorId ||
    page.context.realm !== record.realm ||
    page.recordId !== record.id ||
    page.version < record.version ||
    page.evidence.some((item) => item.recordId !== record.id || item.realm !== record.realm) ||
    new Set(page.evidence.map((item) => item.id)).size !== page.evidence.length
  )
    throw Error('Current evidence access does not match this record and workspace.');
  return page;
}

export function currentEvidenceReference(
  raw: unknown,
  selected: EvidenceView,
  record: CaseRecord,
  actorId: string,
) {
  const page = verifiedEvidencePage(raw, record, actorId);
  const item = page.evidence.find((entry) => entry.id === selected.id);
  if (
    selected.recordId !== record.id ||
    selected.realm !== record.realm ||
    !item ||
    item.plaintextSha256 !== selected.plaintextSha256 ||
    item.byteLength !== selected.byteLength ||
    item.filename !== selected.filename ||
    item.uploaderId !== selected.uploaderId ||
    item.createdAt !== selected.createdAt
  )
    throw Error('Current evidence no longer matches this attachment.');
  return item.id;
}
