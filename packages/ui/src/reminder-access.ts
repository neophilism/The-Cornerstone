import { RecordSchema, type CaseRecord } from '@cornerstone/contracts';
import { verifiedRecordOpening } from './record-opening.js';

export type ReminderRecord = Pick<CaseRecord, 'id' | 'realm' | 'version'>;
const ReminderRecordSchema = RecordSchema.pick({ id: true, realm: true, version: true });

/** Validate the exact access-check envelope without retaining or exporting its case data. */
export function verifyReminderAccess(raw: unknown, record: ReminderRecord, actorId: string): void {
  try {
    const selected = ReminderRecordSchema.parse({
      id: record.id,
      realm: record.realm,
      version: record.version,
    });
    verifiedRecordOpening(
      raw,
      selected.id,
      { id: actorId, realm: selected.realm },
      selected.version,
    );
  } catch {
    throw Error('Current record access could not be verified. No reminder was exported.');
  }
}
