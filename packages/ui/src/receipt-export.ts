import { IdSchema, ReceiptReadSchema, ReceiptSchema, type Receipt } from '@cornerstone/contracts';

export type ReceiptReview = { actorId: string; receipt: Receipt; content: string };
function parse(raw: unknown): Receipt {
  const receipt = ReceiptSchema.parse(raw);
  if (
    receipt.realm !== 'simulation' ||
    receipt.authorityStatus !== 'simulation' ||
    !/^[a-z][a-z0-9_]{0,79}$/.test(receipt.action) ||
    !/^[a-f0-9]{64}$/.test(receipt.digest)
  )
    throw Error('Only a valid synthetic receipt can be exported.');
  return receipt;
}
function content(receipt: Receipt) {
  return (
    JSON.stringify(
      {
        format: 'cornerstone-synthetic-receipt/v1',
        notice:
          'Historical synthetic action receipt; not a legal filing, external acceptance or independently signed proof. The record may have changed since this action.',
        receipt,
      },
      null,
      2,
    ) + '\n'
  );
}
/** Requires a fresh, authenticated receipt response; no cached fallback. */
export function reviewReceiptExport(
  raw: unknown,
  expected: Receipt,
  actorId: string,
): ReceiptReview {
  const baseline = parse(expected);
  const readerId = IdSchema.parse(actorId);
  const response = ReceiptReadSchema.parse(raw);
  if (response.context.actorId !== readerId || response.context.realm !== baseline.realm)
    throw Error('The receipt response belongs to a different workspace.');
  const receipt = parse(response.receipt);
  if (content(receipt) !== content(baseline))
    throw Error('The current receipt does not match the selected action.');
  return { actorId: readerId, receipt, content: content(receipt) };
}
export function confirmReceiptExport(
  raw: unknown,
  review: ReceiptReview,
  consent: boolean,
): string {
  if (consent !== true) throw Error('Explicit receipt export consent is required.');
  const current = reviewReceiptExport(raw, review.receipt, review.actorId);
  if (current.content !== review.content) throw Error('The reviewed receipt changed.');
  return current.content;
}
