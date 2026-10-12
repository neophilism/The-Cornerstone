import { IdSchema, RecordSchema } from '@cornerstone/contracts';

/** Validate the exact access-check envelope without retaining or exporting its case data. */
export function verifyReminderAccess(raw: unknown, recordId: string): void {
  const value = raw as { records?: unknown } | null;
  const parsed =
    value && typeof value === 'object' && Array.isArray(value.records) && value.records.length === 1
      ? RecordSchema.safeParse(value.records[0])
      : null;
  if (!IdSchema.safeParse(recordId).success || !parsed?.success || parsed.data.id !== recordId)
    throw Error('Current record access could not be verified. No reminder was exported.');
}
