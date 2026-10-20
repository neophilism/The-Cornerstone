import { MatchingError, type Match, type Round } from './index.js';
import { replayFailedMatches, type ReplayEvent } from './replay.js';
import { copyCheckedRound } from './round-snapshot.js';

/** Domain separation forbids accidental reuse as an authorization or signing token. */
export const REPLAY_COMMITMENT_DOMAIN = 'cornerstone-synthetic-replay-v1' as const;

export type ReplayCommitment = Readonly<{
  domain: typeof REPLAY_COMMITMENT_DOMAIN;
  hashAlgorithm: 'SHA-256';
  sourceCommitSha: string;
  digestHex: string;
}>;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const pair = (match: Match) => [match.applicantId, match.offerId];
const allocations = (matches: readonly Match[]) =>
  [...matches]
    .sort((a, b) => compare(a.offerId, b.offerId) || compare(a.applicantId, b.applicantId))
    .map(pair);

function requireSourceRevision(sourceCommitSha: unknown): asserts sourceCommitSha is string {
  if (typeof sourceCommitSha !== 'string' || !/^[a-f0-9]{40}$/.test(sourceCommitSha))
    throw new MatchingError(
      'INVALID_REPLAY_SOURCE_REVISION',
      'Replay commitment requires the exact lowercase 40-character source commit SHA.',
    );
}

/** An untrusted receipt may not execute accessors or proxy traps during verification. */
function receiptField(receipt: object, field: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(receipt, field);
    if (descriptor && Object.hasOwn(descriptor, 'value')) return descriptor.value;
  } catch {
    // A revoked Proxy or an attacker-controlled descriptor trap is not a receipt.
  }
  throw new MatchingError('INVALID_REPLAY_COMMITMENT', 'Replay commitment is malformed.');
}

/**
 * Hash a verified synthetic replay and the exact claimed implementation revision.
 * This is a deterministic checksum, not a signature, proof of custody or consent.
 */
export async function hashVerifiedReplay(
  round: Round,
  events: readonly ReplayEvent[],
  sourceCommitSha: string,
) {
  requireSourceRevision(sourceCommitSha);
  const frozen = copyCheckedRound(round);
  // The same detached round supplies both the replay calculation and its canonical digest.
  // Replay validates the supplied events and clones them through guarded descriptors.
  const replay = replayFailedMatches(frozen, events);
  const canonical = JSON.stringify([
    REPLAY_COMMITMENT_DOMAIN,
    sourceCommitSha,
    frozen.algorithm,
    frozen.id,
    [...frozen.applicants].sort((a, b) => compare(a.id, b.id)).map((a) => [
      a.id,
      a.priorityDate,
      [...a.choices],
      a.ready,
      a.unremedied,
      [...a.constituents].sort(compare),
    ]),
    [...frozen.offers].sort((a, b) => compare(a.id, b.id)).map((o) => [
      o.id,
      o.publishedVersion,
      [...o.exclusiveRights].sort(compare),
      [...o.eligibleApplicantIds].sort(compare),
    ]),
    [...frozen.tieOrder],
    allocations(replay.initial),
    replay.verifiedEvents.map((event) => [
      event.sequence,
      pair(event.failed),
      [...event.willingApplicantIds].sort(compare),
      allocations(event.before),
      allocations(event.after),
    ]),
    allocations(replay.matches),
  ]);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle)
    throw new MatchingError('REPLAY_DIGEST_UNAVAILABLE', 'Cryptographic SHA-256 is unavailable.');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const hexBytes = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0'));
  const digestHex = hexBytes.join('');
  const commitment: ReplayCommitment = {
    domain: REPLAY_COMMITMENT_DOMAIN,
    hashAlgorithm: 'SHA-256',
    sourceCommitSha,
    digestHex,
  };
  return { commitment, replay };
}

/**
 * Recompute a recorded digest against externally expected source and supplied events.
 * An attacker who can replace both the evidence and digest can still forge them.
 */
export async function verifyVerifiedReplay(
  round: Round,
  events: readonly ReplayEvent[],
  claimed: ReplayCommitment,
  expectedSourceCommitSha: string,
) {
  let isArray: boolean;
  try {
    isArray = Array.isArray(claimed);
  } catch {
    throw new MatchingError('INVALID_REPLAY_COMMITMENT', 'Replay commitment is malformed.');
  }
  if (typeof claimed !== 'object' || claimed === null || isArray)
    throw new MatchingError('INVALID_REPLAY_COMMITMENT', 'Replay commitment is malformed.');
  const domain = receiptField(claimed, 'domain');
  const hashAlgorithm = receiptField(claimed, 'hashAlgorithm');
  const sourceCommitSha = receiptField(claimed, 'sourceCommitSha');
  const digestHex = receiptField(claimed, 'digestHex');
  if (
    domain !== REPLAY_COMMITMENT_DOMAIN ||
    hashAlgorithm !== 'SHA-256' ||
    typeof sourceCommitSha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(sourceCommitSha) ||
    typeof digestHex !== 'string' ||
    !/^[a-f0-9]{64}$/.test(digestHex)
  )
    throw new MatchingError('INVALID_REPLAY_COMMITMENT', 'Replay commitment is malformed.');
  // Receipt metadata does not establish its own trusted source-code revision.
  // Callers must obtain this expected SHA from a separately authenticated release inventory.
  requireSourceRevision(expectedSourceCommitSha);
  if (sourceCommitSha !== expectedSourceCommitSha)
    throw new MatchingError(
      'REPLAY_COMMITMENT_SOURCE_MISMATCH',
      'Replay receipt source revision does not match the trusted expected revision.',
    );
  const computed = await hashVerifiedReplay(round, events, expectedSourceCommitSha);
  // Fixed-size comparison does not early-return on a matching digest prefix.
  let difference = 0;
  for (let i = 0; i < digestHex.length; i++)
    difference |= digestHex.charCodeAt(i) ^ computed.commitment.digestHex.charCodeAt(i);
  if (difference !== 0)
    throw new MatchingError('REPLAY_COMMITMENT_MISMATCH', 'Recorded replay digest differs.');
  return computed.replay;
}
