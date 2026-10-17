'use client';
import type { CaseRecord } from '@cornerstone/contracts';
import { currentRecordReference } from './record-reference.js';
import { PrivateReferenceCopy } from './private-reference-copy.js';
import { preparePrivateReference, type ReferenceRead } from './private-reference.js';

export function RecordReferenceCopy({
  record,
  actorId,
  readReference,
  disabled,
}: {
  record: CaseRecord;
  actorId: string;
  readReference: ReferenceRead;
  disabled: boolean;
}) {
  return (
    <PrivateReferenceCopy
      className="record-reference-copy"
      label="record"
      disabled={disabled}
      verify={() =>
        preparePrivateReference(
          readReference,
          'records?recordId=' + encodeURIComponent(record.id),
          (raw) => currentRecordReference(raw, record, actorId),
        )
      }
    />
  );
}
