import {
  EvidenceViewSchema,
  MAX_SYNTHETIC_EVIDENCE_BYTES,
  type EvidenceView,
} from '@cornerstone/contracts';
export function reviewEvidenceDownload(raw: unknown, expected: EvidenceView): EvidenceView {
  const baseline = EvidenceViewSchema.parse(expected);
  const list = EvidenceViewSchema.array()
    .max(10)
    .parse((raw as { evidence?: unknown } | null)?.evidence);
  const matches = list.filter((item) => item.id === baseline.id);
  if (
    matches.length !== 1 ||
    matches[0]!.state !== 'clean' ||
    matches[0]!.checkMethod !== 'synthetic_text_v1' ||
    JSON.stringify(matches[0]) !== JSON.stringify(baseline)
  )
    throw Error(
      'Current attachment access or metadata could not be verified. Reopen the attachment before downloading.',
    );
  return Object.freeze(matches[0]!);
}
export async function verifiedEvidenceBytes(
  response: Response,
  item: EvidenceView,
): Promise<Uint8Array<ArrayBuffer>> {
  if (
    !response.ok ||
    response.redirected ||
    !/^text\/plain(?:;|$)/i.test(response.headers.get('content-type') ?? '') ||
    !response.body
  )
    throw Error('The attachment download was denied or returned an unexpected response.');
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MAX_SYNTHETIC_EVIDENCE_BYTES || length > item.byteLength)
        throw Error('The attachment exceeded its reviewed size.');
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (length !== item.byteLength) throw Error('The attachment size did not match the review.');
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  if (hash !== item.plaintextSha256)
    throw Error('The attachment bytes did not match their reviewed digest.');
  return bytes;
}
