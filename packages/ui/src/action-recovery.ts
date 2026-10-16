import {
  CommandSchema,
  RecordSchema,
  ReceiptSchema,
  type CaseRecord,
  type Command,
} from '@cornerstone/contracts';
import { workflow } from '@cornerstone/domain';
import { saveFailure } from './draft-review.js';

export type ActionAttempt = Readonly<{
  wire: string;
  recordId: string;
  kind: CaseRecord['kind'];
  realm: CaseRecord['realm'];
  resultingState: string;
}>;

/** This is immutable recovery intent, not authority to execute a command. */
export function prepareAction(raw: unknown, baseline: CaseRecord): ActionAttempt {
  const request = CommandSchema.parse(raw);
  const action = workflow(baseline.kind).actions.find((item) => item.key === request.action);
  if (
    request.recordId !== baseline.id ||
    request.expectedVersion !== baseline.version ||
    !action ||
    !action.from.includes(baseline.state) ||
    request.action === 'save_draft'
  )
    throw Error('The action does not match the selected record version.');
  return Object.freeze({
    wire: JSON.stringify(request),
    recordId: baseline.id,
    kind: baseline.kind,
    realm: baseline.realm,
    resultingState: action.to,
  });
}

export function actionRequest(attempt: ActionAttempt): Command {
  return CommandSchema.parse(JSON.parse(attempt.wire));
}

export function actionFailure(error: unknown, retry = false): 'rejected' | 'uncertain' {
  return !retry && saveFailure(error) !== 'uncertain' ? 'rejected' : 'uncertain';
}

/** Correlate the accepted historical response; do not claim it is current state. */
export function actionResult(raw: unknown, attempt: ActionAttempt) {
  const value = raw as { record?: unknown; receipt?: unknown } | null;
  const request = actionRequest(attempt);
  const record = RecordSchema.parse(value?.record);
  const receipt = ReceiptSchema.parse(value?.receipt);
  const authority =
    attempt.realm === 'simulation'
      ? 'simulation'
      : attempt.realm === 'program'
        ? 'authorized'
        : 'preparation';
  if (
    record.id !== attempt.recordId ||
    record.kind !== attempt.kind ||
    record.realm !== attempt.realm ||
    record.version !== request.expectedVersion + 1 ||
    record.state !== attempt.resultingState ||
    receipt.recordId !== record.id ||
    receipt.version !== record.version ||
    receipt.realm !== record.realm ||
    receipt.action !== request.action ||
    receipt.authorityStatus !== authority
  )
    throw Error('The response did not contain a matching action record and receipt.');
  return { record, receipt };
}
