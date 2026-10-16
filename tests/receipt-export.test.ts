import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Receipt } from '@cornerstone/contracts';
import { reviewReceiptExport, confirmReceiptExport } from '../packages/ui/src/receipt-export.js';
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
    const review = reviewReceiptExport({ receipt, secretEnvelope: 'omit me' }, receipt);
    const content = confirmReceiptExport({ receipt }, review, true);
    const exported = JSON.parse(content);
    expect(exported.receipt).toEqual(receipt);
    expect(exported.notice).toContain('Historical synthetic');
    expect(exported.format).toBe('cornerstone-synthetic-receipt/v1');
    expect(content).not.toContain('omit me');
    expect(content.endsWith('\n')).toBe(true);
  });
  it('rejects absent consent, denied or malformed responses without a cached fallback', () => {
    const receipt = fixture(),
      review = reviewReceiptExport({ receipt }, receipt);
    for (const consent of [false, null, undefined, 'yes'])
      expect(() => confirmReceiptExport({ receipt }, review, consent as boolean)).toThrow();
    for (const response of [null, {}, { receipt: null }, { receipt: { id: receipt.id } }])
      expect(() => confirmReceiptExport(response, review, true)).toThrow();
  });
  it.each(Object.keys(fixture()))('rejects drift in the reviewed %s', (field) => {
    const receipt = fixture(),
      review = reviewReceiptExport({ receipt }, receipt);
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
      confirmReceiptExport({ receipt: { ...receipt, [field]: changes[field] } }, review, true),
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
      expect(() => reviewReceiptExport({ receipt }, receipt)).toThrow();
    }
  });
  it('binds consent to the exact reviewed bytes and ignores input property order', () => {
    const receipt = fixture(),
      review = reviewReceiptExport({ receipt }, receipt);
    expect(
      confirmReceiptExport(
        { receipt: Object.fromEntries(Object.entries(receipt).reverse()) },
        review,
        true,
      ),
    ).toBe(review.content);
    expect(() =>
      confirmReceiptExport({ receipt }, { ...review, content: 'changed' }, true),
    ).toThrow();
  });
});
