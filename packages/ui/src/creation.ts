import {
  CreateRecordSchema,
  IdSchema,
  RealmSchema,
  RecordSchema,
  ReceiptSchema,
  type Actor,
} from '@cornerstone/contracts';
import { workflow } from '@cornerstone/domain';
import { saveFailure } from './draft-review.js';

export type CreationRequest = ReturnType<typeof CreateRecordSchema.parse>;
export type CreationAttempt = Readonly<{
  wire: string;
  ownerId: string;
  realm: Actor['realm'];
}>;

/** Keep only a serialized snapshot, never a reference to mutable form values. */
export function prepareCreation(raw: unknown, actor: Pick<Actor, 'id' | 'realm'>): CreationAttempt {
  const request = CreateRecordSchema.parse(raw);
  return Object.freeze({
    wire: JSON.stringify(request),
    ownerId: IdSchema.parse(actor.id),
    realm: RealmSchema.parse(actor.realm),
  });
}
export function creationRequest(attempt: CreationAttempt): CreationRequest {
  return CreateRecordSchema.parse(JSON.parse(attempt.wire));
}
/** A denied retry does not prove an earlier unconfirmed creation never committed. */
export function creationFailure(error: unknown, retry: boolean): 'rejected' | 'uncertain' {
  return !retry && saveFailure(error) === 'rejected' ? 'rejected' : 'uncertain';
}
/** Validate correlation, not a digital signature or full-content attestation. */
export function creationResult(raw: unknown, attempt: CreationAttempt) {
  const value = raw as { record?: unknown; receipt?: unknown } | null;
  const request = creationRequest(attempt);
  const record = RecordSchema.parse(value?.record);
  const receipt = ReceiptSchema.parse(value?.receipt);
  const authority =
    attempt.realm === 'simulation'
      ? 'simulation'
      : attempt.realm === 'program'
        ? 'authorized'
        : 'preparation';
  if (
    record.kind !== request.kind ||
    record.ownerId !== attempt.ownerId ||
    record.realm !== attempt.realm ||
    record.title !== request.title ||
    record.state !== workflow(request.kind).initial ||
    record.version !== 1 ||
    receipt.recordId !== record.id ||
    receipt.version !== 1 ||
    receipt.realm !== attempt.realm ||
    receipt.action !== 'create' ||
    receipt.authorityStatus !== authority
  )
    throw Error('The creation response did not contain a matching initial record and receipt.');
  return { record, receipt };
}
