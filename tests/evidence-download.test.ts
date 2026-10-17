import { describe, expect, it } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import type { EvidenceView } from '@cornerstone/contracts';
import {
  reviewEvidenceDownload,
  verifiedEvidenceBytes,
} from '../packages/ui/src/evidence-download.js';
const content = 'Invented UTF-8 evidence: café.\n';
function fixture(): EvidenceView {
  return {
    id: randomUUID(),
    recordId: randomUUID(),
    uploaderId: randomUUID(),
    filename: 'invented.txt',
    description: 'Invented reviewed evidence',
    plaintextSha256: createHash('sha256').update(content).digest('hex'),
    byteLength: Buffer.byteLength(content),
    state: 'clean',
    createdAt: '2026-10-16T12:00:00Z',
    checkedAt: '2026-10-16T12:01:00Z',
    checkMethod: 'synthetic_text_v1',
    rejectionCode: null,
    mediaType: 'text/plain',
    realm: 'simulation',
    classification: 'synthetic_evidence',
    securityScan: 'not_performed',
    legalAcceptance: false,
  };
}
const response = (text = content) =>
  new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
describe('reviewed evidence download', () => {
  it('accepts one unchanged currently readable clean attachment', () => {
    const item = fixture();
    const review = reviewEvidenceDownload({ evidence: [item] }, item);
    expect(review).toEqual(item);
    expect(Object.isFrozen(review)).toBe(true);
  });
  it('rejects missing, duplicate, changed and quarantined metadata', () => {
    const item = fixture();
    for (const evidence of [
      [],
      [item, item],
      [{ ...item, recordId: randomUUID() }],
      [{ ...item, state: 'quarantined' }],
      [{ ...item, filename: 'changed.txt' }],
      [{ ...item, checkMethod: null }],
    ])
      expect(() => reviewEvidenceDownload({ evidence }, item)).toThrow();
  });
  it('verifies exact original UTF-8 bytes', async () => {
    expect(Buffer.from(await verifiedEvidenceBytes(response(), fixture())).toString('utf8')).toBe(
      content,
    );
  });
  it('rejects denied and non-text responses', async () => {
    await expect(
      verifiedEvidenceBytes(new Response('denied', { status: 403 }), fixture()),
    ).rejects.toThrow();
    await expect(
      verifiedEvidenceBytes(
        new Response('<html>', { headers: { 'content-type': 'text/html' } }),
        fixture(),
      ),
    ).rejects.toThrow();
  });
  it('rejects changed bytes even when the length matches', async () => {
    await expect(
      verifiedEvidenceBytes(response(content.replace('Invented', 'Replaced')), fixture()),
    ).rejects.toThrow(/digest/);
  });
  it('rejects short and oversized streams before release', async () => {
    await expect(verifiedEvidenceBytes(response('short'), fixture())).rejects.toThrow(/size/);
    await expect(verifiedEvidenceBytes(response(content + 'extra'), fixture())).rejects.toThrow(
      /size/,
    );
  });
});
