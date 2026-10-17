import type { EvidenceView } from '@cornerstone/contracts';
import { verifiedEvidenceBytes } from './evidence-download.js';

export type EvidenceDownload = (
  item: EvidenceView,
  signal: AbortSignal,
) => Promise<{ bytes: Uint8Array<ArrayBuffer>; isCurrent: () => boolean }>;

export async function downloadSessionEvidence(
  item: EvidenceView,
  signal: AbortSignal,
  session: { current: () => number; expire: () => void },
): ReturnType<EvidenceDownload> {
  const generation = session.current();
  const isCurrent = () => generation === session.current() && !signal.aborted;
  const response = await fetch('/api/private/evidence/download?id=' + encodeURIComponent(item.id), {
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    signal,
  });
  // A proxy's non-JSON error body must not leave an expired private workspace visible.
  // An earlier request can never expire the session that replaced it.
  if (response.status === 401 && generation === session.current()) session.expire();
  if (!isCurrent()) {
    await response.body?.cancel().catch(() => undefined);
    throw Error('The attachment request no longer belongs to the current session.');
  }
  const bytes = await verifiedEvidenceBytes(response, item);
  // Session changes and cancellation can also occur while reading or hashing the body.
  if (!isCurrent()) throw Error('The attachment request no longer belongs to the current session.');
  // The component checks this again immediately before creating the browser download.
  return { bytes, isCurrent };
}
