import { describe, it, expect } from 'vitest';
import {
  UploadSyntheticEvidenceSchema,
  MAX_SYNTHETIC_EVIDENCE_BYTES,
} from '@cornerstone/contracts';
import { validateSyntheticText } from '../apps/api/src/evidence.js';
const id = '11111111-1111-4111-8111-111111111111';
const input = {
  recordId: id,
  expectedVersion: 1,
  idempotencyKey: id,
  filename: 'invented.txt',
  description: 'Invented source only',
  base64: 'dGV4dA==',
  attestedSynthetic: true,
};
describe('bounded synthetic text evidence', () => {
  it('accepts UTF-8 text and rejects invalid encoding, controls, empty and oversized bodies', () => {
    expect(validateSyntheticText(new TextEncoder().encode('Invented café\n\tPlain text.'))).toBe(
      true,
    );
    expect(validateSyntheticText(Uint8Array.from([255]))).toBe(false);
    expect(validateSyntheticText(Uint8Array.from([0, 65]))).toBe(false);
    expect(validateSyntheticText(new Uint8Array())).toBe(false);
    expect(validateSyntheticText(new Uint8Array(MAX_SYNTHETIC_EVIDENCE_BYTES + 1))).toBe(false);
  });
  it('keeps markup as literal text rather than asserting a malware scan', () => {
    expect(validateSyntheticText(new TextEncoder().encode('<script>invented</script>'))).toBe(true);
    expect(
      UploadSyntheticEvidenceSchema.safeParse({ ...input, securityScan: 'passed' }).success,
    ).toBe(false);
    expect(
      UploadSyntheticEvidenceSchema.safeParse({ ...input, attestedSynthetic: false }).success,
    ).toBe(false);
  });
  it('rejects unsupported filenames, unsafe source URLs and malformed base64', () => {
    for (const filename of ['../file.txt', 'file.pdf', 'file.txt\r\nHeader:value'])
      expect(UploadSyntheticEvidenceSchema.safeParse({ ...input, filename }).success).toBe(false);
    for (const sourceUrl of ['javascript:alert(1)', 'https://user:password@example.com/source'])
      expect(UploadSyntheticEvidenceSchema.safeParse({ ...input, sourceUrl }).success).toBe(false);
    expect(
      UploadSyntheticEvidenceSchema.safeParse({ ...input, base64: 'not base64' }).success,
    ).toBe(false);
    expect(
      UploadSyntheticEvidenceSchema.safeParse({
        ...input,
        sourceUrl: 'https://example.com/invented',
      }).success,
    ).toBe(true);
  });
});
