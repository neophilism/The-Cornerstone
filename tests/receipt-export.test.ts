import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Receipt } from '@cornerstone/contracts';
import { reviewReceiptExport, confirmReceiptExport } from '../packages/ui/src/receipt-export.js';
const actorId = randomUUID();
const response = (receipt: Receipt, readerId = actorId) => ({
  context: { actorId: readerId, realm: receipt.realm },
  receipt,
});
const fixture = (): Receipt => ({
  id: randomUUID(),
  recordId: randomUUID(),
  version: 2,
  action: 'mark_ready',
  digest: 'a'.repeat(64),
  acceptedAt: '2026-10-16T12:00:00Z',
  realm: 'simulation',
  authorityStatus: 'simulation',
});
describe('reviewed synthetic receipt export', () => {
  it('exports only the exact receipt and truthful scope after affirmative consent', () => {
    const receipt = fixture();
    const review = reviewReceiptExport(response(receipt), receipt, actorId);
    const content = confirmReceiptExport(response(receipt), review, true);
    const exported = JSON.parse(content);
    expect(exported.receipt).toEqual(receipt);
    expect(exported.notice).toContain('Historical synthetic');
    expect(exported.format).toBe('cornerstone-synthetic-receipt/v1');
    expect(review.actorId).toBe(actorId);
    expect(content).not.toContain(actorId);
    expect(Object.keys(exported)).toEqual(['format', 'notice', 'receipt']);
    expect(content.endsWith('\n')).toBe(true);
  });
  it('rejects absent consent, denied or malformed responses without a cached fallback', () => {
    const receipt = fixture(),
      review = reviewReceiptExport(response(receipt), receipt, actorId);
    for (const consent of [false, null, undefined, 'yes'])
      expect(() => confirmReceiptExport(response(receipt), review, consent as boolean)).toThrow();
    for (const raw of [
      null,
      {},
      { ...response(receipt), receipt: null },
      { ...response(receipt), receipt: { id: receipt.id } },
    ])
      expect(() => confirmReceiptExport(raw, review, true)).toThrow();
  });
  it('binds initial review and confirmation to the same reader without adding identity to the file', () => {
    const receipt = fixture(),
      review = reviewReceiptExport(response(receipt), receipt, actorId);
    for (const raw of [
      { receipt },
      response(receipt, randomUUID()),
      { ...response(receipt), context: { actorId, realm: 'program' } },
      { ...response(receipt), context: { actorId, realm: 'simulation', token: 'unexpected' } },
      { ...response(receipt), record: { data: 'unexpected private details' } },
    ]) {
      expect(() => reviewReceiptExport(raw, receipt, actorId)).toThrow();
      expect(() => confirmReceiptExport(raw, review, true)).toThrow();
    }
  });
  it.each(Object.keys(fixture()))('rejects drift in the reviewed %s', (field) => {
    const receipt = fixture(),
      review = reviewReceiptExport(response(receipt), receipt, actorId);
    const changes: Record<string, unknown> = {
      id: randomUUID(),
      recordId: randomUUID(),
      version: 3,
      action: 'reopen',
      digest: 'b'.repeat(64),
      acceptedAt: '2026-10-16T12:01:00Z',
      realm: 'program',
      authorityStatus: 'authorized',
    };
    expect(() =>
      confirmReceiptExport(response({ ...receipt, [field]: changes[field] }), review, true),
    ).toThrow();
  });
  it('rejects non-synthetic receipts, unknown fields, invalid digests and unbounded actions', () => {
    for (const change of [
      { realm: 'program', authorityStatus: 'authorized' },
      { realm: 'proposal' },
      { digest: 'z'.repeat(64) },
      { action: 'x'.repeat(81) },
      { requestKey: randomUUID() },
    ]) {
      const receipt = { ...fixture(), ...change } as Receipt;
      expect(() => reviewReceiptExport(response(receipt), receipt, actorId)).toThrow();
    }
  });
  it('binds consent to the exact reviewed bytes and ignores input property order', () => {
    const receipt = fixture(),
      review = reviewReceiptExport(response(receipt), receipt, actorId);
    expect(
      confirmReceiptExport(
        { ...response(receipt), receipt: Object.fromEntries(Object.entries(receipt).reverse()) },
        review,
        true,
      ),
    ).toBe(review.content);
    expect(() =>
      confirmReceiptExport(response(receipt), { ...review, content: 'changed' }, true),
    ).toThrow();
  });
});
