import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { CaseRecord, Receipt } from '@cornerstone/contracts';
import {
  disclosePrivate,
  preparePrivateDisclosure,
} from '../packages/ui/src/private-disclosure.js';
import { reviewRecordExport, confirmRecordExport } from '../packages/ui/src/record-export.js';
import { reviewReceiptExport, confirmReceiptExport } from '../packages/ui/src/receipt-export.js';

const actorId = randomUUID();
const record: CaseRecord = {
  id: randomUUID(),
  ownerId: randomUUID(),
  realm: 'simulation',
  kind: 'dossier',
  title: 'Invented session-bound export',
  state: 'draft',
  version: 1,
  institutionId: null,
  jurisdiction: null,
  policyVersion: 'synthetic-only',
  data: { actionDescription: 'Invented private review bytes' },
  createdAt: '2026-10-17T00:00:00Z',
  updatedAt: '2026-10-17T00:00:00Z',
};
const receipt: Receipt = {
  id: randomUUID(),
  recordId: record.id,
  version: 1,
  action: 'create',
  digest: 'a'.repeat(64),
  acceptedAt: '2026-10-17T00:00:00Z',
  realm: 'simulation',
  authorityStatus: 'simulation',
};
const recordResponse = {
  context: { actorId, realm: 'simulation' },
  records: [record],
  capabilities: [{ recordId: record.id, version: record.version, actions: [] }],
  nextCursor: null,
};
const receiptResponse = { context: { actorId, realm: 'simulation' }, receipt };

describe('session-bound private review and release', () => {
  it('passes a current authorized review to its synchronous preview without adding read context to file bytes', async () => {
    const preview = vi.fn();
    const disclosure = await preparePrivateDisclosure(
      async () => ({ data: recordResponse, isCurrent: () => true }),
      'records?recordId=' + record.id,
      (raw) => reviewRecordExport(raw, record, actorId),
    );
    disclosePrivate(disclosure, preview);
    expect(preview).toHaveBeenCalledExactlyOnceWith(disclosure.value);
    expect(JSON.parse(disclosure.value.content).record).toEqual(record);
    expect(disclosure.value.content).not.toContain(actorId);
  });
  it('rejects a superseded response before processing its private payload', async () => {
    const validate = vi.fn();
    await expect(
      preparePrivateDisclosure(
        async () => ({ data: recordResponse, isCurrent: () => false }),
        'records?recordId=' + record.id,
        validate,
      ),
    ).rejects.toThrow(/session changed/);
    expect(validate).not.toHaveBeenCalled();
  });
  it('does not show a validated review when its session changes before the preview callback', async () => {
    let current = true;
    const preview = vi.fn();
    const disclosure = await preparePrivateDisclosure(
      async () => ({ data: receiptResponse, isCurrent: () => current }),
      'receipts?receiptId=' + receipt.id,
      (raw) => {
        const review = reviewReceiptExport(raw, receipt, actorId);
        queueMicrotask(() => (current = false));
        return review;
      },
    );
    expect(disclosure.value.receipt).toEqual(receipt);
    expect(() => disclosePrivate(disclosure, preview)).toThrow(/session changed/);
    expect(preview).not.toHaveBeenCalled();
  });
  it.each(['record file', 'record print', 'receipt file'] as const)(
    'rechecks the session after successful validation at the final %s sink',
    async (kind) => {
      let current = true;
      const output = vi.fn();
      const reviewedRecord = reviewRecordExport(recordResponse, record, actorId);
      const reviewedReceipt = reviewReceiptExport(receiptResponse, receipt, actorId);
      const disclosure = await preparePrivateDisclosure(
        async () => ({
          data: kind === 'receipt file' ? receiptResponse : recordResponse,
          isCurrent: () => current,
        }),
        kind === 'receipt file'
          ? 'receipts?receiptId=' + receipt.id
          : 'records?recordId=' + record.id,
        (raw) => {
          let content: string;
          if (kind === 'receipt file') content = confirmReceiptExport(raw, reviewedReceipt, true);
          else {
            const result = confirmRecordExport(raw, reviewedRecord, true);
            if (result.status !== 'ready') throw Error('Expected the exact reviewed version.');
            content = result.content;
          }
          // The read and all authorization/content validation succeeded. Lose the
          // session in the promise continuation gap before the caller releases it.
          queueMicrotask(() => (current = false));
          return content;
        },
      );
      expect(disclosure.value).toBe(
        kind === 'receipt file' ? reviewedReceipt.content : reviewedRecord.content,
      );
      expect(() => disclosePrivate(disclosure, output)).toThrow(/session changed/);
      expect(output).not.toHaveBeenCalled();
    },
  );
  it('keeps a current final disclosure usable after the guarded asynchronous read', async () => {
    const review = reviewReceiptExport(receiptResponse, receipt, actorId);
    const disclosure = await preparePrivateDisclosure(
      async () => ({ data: receiptResponse, isCurrent: () => true }),
      'receipts?receiptId=' + receipt.id,
      (raw) => confirmReceiptExport(raw, review, true),
    );
    const output = vi.fn((content: string) => content.length);
    expect(disclosePrivate(disclosure, output)).toBe(review.content.length);
    expect(output).toHaveBeenCalledExactlyOnceWith(review.content);
  });
});
