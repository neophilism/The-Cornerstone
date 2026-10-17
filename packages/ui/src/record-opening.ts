import {
  IdSchema,
  RecordCapabilitiesSchema,
  RecordReadContextSchema,
  RecordSchema,
  type Actor,
} from '@cornerstone/contracts';

type Reader = Pick<Actor, 'id' | 'realm'>;

/** Correlate an authenticated read before using either its content or permissions. */
export function verifiedRecordPage(raw: unknown, actor: Reader) {
  const value = raw as Record<string, unknown> | null;
  if (!value || typeof value !== 'object') throw Error('Current record access is unavailable.');
  const context = RecordReadContextSchema.parse(value['context']);
  if (context.actorId !== actor.id || context.realm !== actor.realm)
    throw Error(
      'The record response belongs to a different workspace. Reopen it in your current session.',
    );
  const records = RecordSchema.array().parse(value['records']);
  const capabilities = RecordCapabilitiesSchema.array().parse(value['capabilities']);
  const nextCursor = value['nextCursor'];
  if (
    nextCursor !== null &&
    (typeof nextCursor !== 'string' || !/^[A-Za-z0-9_-]{1,2048}$/.test(nextCursor))
  )
    throw Error('The record response could not be verified.');
  if (
    records.some((record) => record.realm !== actor.realm) ||
    new Set(records.map((record) => record.id)).size !== records.length ||
    capabilities.length !== records.length ||
    new Set(capabilities.map((capability) => capability.recordId)).size !== capabilities.length ||
    capabilities.some(
      (capability) =>
        !records.some(
          (record) => record.id === capability.recordId && record.version === capability.version,
        ),
    )
  )
    throw Error('The record content and current permissions could not be verified together.');
  return { records, capabilities, nextCursor };
}

/** A supplied reference never authorizes a different record, realm or stale version. */
export function verifiedRecordOpening(
  raw: unknown,
  reference: string,
  actor: Reader,
  minimumVersion = 1,
) {
  const id = IdSchema.parse(reference.trim());
  const page = verifiedRecordPage(raw, actor);
  const record = page.records[0];
  if (
    page.records.length !== 1 ||
    page.nextCursor !== null ||
    !record ||
    record.id !== id ||
    record.version < minimumVersion
  )
    throw Error('The response does not match the requested record. Reopen its reference.');
  return { record, capabilities: page.capabilities };
}
