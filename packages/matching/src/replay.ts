import { match, continueFailedMatch, MatchingError, type Match, type Round } from './index.js';

export type ReplayEvent = Readonly<{
  sequence: number;
  failed: Match;
  willingApplicantIds: readonly string[];
  before: readonly Match[];
  after: readonly Match[];
}>;

const pairKey = (m: Match) => JSON.stringify([m.applicantId, m.offerId]);
const ordered = (pairs: readonly Match[]) => pairs.map(pairKey).sort();

function invalid(code: string): never {
  throw new MatchingError(code, 'Recorded negotiation evidence is malformed.');
}

/** Descriptor traps are untrusted. Fail closed with a typed matching error. */
function ownData(object: object, key: string, code: string): unknown {
  let property: PropertyDescriptor | undefined;
  try {
    property = Object.getOwnPropertyDescriptor(object, key);
  } catch {
    return invalid(code);
  }
  if (!property || !Object.hasOwn(property, 'value')) return invalid(code);
  return property.value;
}

/** Array.isArray can throw on a revoked proxy, which is also malformed evidence. */
function checkedArray(value: unknown, code: string): value is unknown[] {
  try {
    return Array.isArray(value);
  } catch {
    return invalid(code);
  }
}

function snapshotPair(value: unknown, code: string): Match {
  if (typeof value !== 'object' || value === null || checkedArray(value, code))
    return invalid(code);
  const applicantId = ownData(value, 'applicantId', code);
  const offerId = ownData(value, 'offerId', code);
  if (typeof applicantId !== 'string' || typeof offerId !== 'string') return invalid(code);
  return { applicantId, offerId };
}

function snapshotArray<T>(
  value: unknown,
  code: string,
  limit: number,
  map: (value: unknown) => T,
): T[] {
  if (!checkedArray(value, code)) return invalid(code);
  const length = ownData(value, 'length', code);
  if (!Number.isSafeInteger(length) || (length as number) < 0 || (length as number) > limit)
    return invalid(code);
  const result: T[] = [];
  for (let index = 0; index < (length as number); index++)
    result.push(map(ownData(value, String(index), code)));
  return result;
}

function snapshotEvent(value: unknown, maxPairs: number, maxApplicants: number): ReplayEvent {
  const code = 'INVALID_REPLAY_EVENT';
  if (typeof value !== 'object' || value === null || checkedArray(value, code))
    return invalid(code);
  const sequence = ownData(value, 'sequence', code);
  const failed = snapshotPair(ownData(value, 'failed', code), code);
  const willingApplicantIds = snapshotArray(
    ownData(value, 'willingApplicantIds', code),
    code,
    maxApplicants,
    (id) => {
      if (typeof id !== 'string') return invalid(code);
      return id;
    },
  );
  const before = snapshotArray(
    ownData(value, 'before', code),
    'REPLAY_MISMATCH',
    maxPairs,
    (pair) => snapshotPair(pair, 'REPLAY_MISMATCH'),
  );
  const after = snapshotArray(ownData(value, 'after', code), 'REPLAY_MISMATCH', maxPairs, (pair) =>
    snapshotPair(pair, 'REPLAY_MISMATCH'),
  );
  if (typeof sequence !== 'number') return invalid(code);
  return { sequence, failed, willingApplicantIds, before, after };
}

function checkSnapshot(expected: readonly Match[], actual: readonly Match[]) {
  if (actual.length !== expected.length)
    throw new MatchingError(
      'REPLAY_MISMATCH',
      'Recorded allocations diverge from frozen matching.',
    );
  const a = ordered(expected);
  const b = ordered(actual);
  if (a.some((pair, i) => pair !== b[i]))
    throw new MatchingError(
      'REPLAY_MISMATCH',
      'Recorded allocations diverge from frozen matching.',
    );
}

/** Replay only declared frozen inputs; authentication and custody remain separate. */
export function replayFailedMatches(round: Round, events: readonly ReplayEvent[]) {
  // Keep every continuation and reported identity on one detached copy of the round.
  // Event descriptor traps must not be able to rewrite inputs after the first match.
  let frozenRound: Round;
  try {
    frozenRound = structuredClone(round);
  } catch {
    throw new MatchingError('INVALID_ROUND', 'Frozen matching inputs must be cloneable data.');
  }
  const initial = match(frozenRound).matches;
  if (!checkedArray(events, 'INVALID_REPLAY_EVENT'))
    throw new MatchingError('INVALID_REPLAY_EVENT', 'Negotiation events must be an array.');
  const maxDeclines = frozenRound.applicants.reduce(
    (count, applicant) => count + applicant.choices.length,
    0,
  );
  const eventCount = ownData(events, 'length', 'INVALID_REPLAY_EVENT');
  if (!Number.isSafeInteger(eventCount) || (eventCount as number) < 0)
    return invalid('INVALID_REPLAY_EVENT');
  if ((eventCount as number) > maxDeclines)
    throw new MatchingError('REPLAY_TOO_LONG', 'Negotiation history exceeds frozen choices.');
  let current = initial;
  const declinedPairs: Match[] = [];
  const steps: { sequence: number; failed: Match; matches: Match[] }[] = [];
  for (let index = 0; index < (eventCount as number); index++) {
    const event = snapshotEvent(
      ownData(events, String(index), 'INVALID_REPLAY_EVENT'),
      Math.min(frozenRound.applicants.length, frozenRound.offers.length),
      frozenRound.applicants.length,
    );
    if (!Number.isSafeInteger(event.sequence) || event.sequence !== index + 1)
      throw new MatchingError(
        'INVALID_REPLAY_SEQUENCE',
        'Negotiation sequence must be contiguous.',
      );
    checkSnapshot(current, event.before);
    const next = continueFailedMatch(
      frozenRound,
      current,
      event.failed,
      event.willingApplicantIds,
      declinedPairs,
    );
    checkSnapshot(next, event.after);
    declinedPairs.push({ ...event.failed });
    steps.push({
      sequence: event.sequence,
      failed: { ...event.failed },
      matches: next.map((pair) => ({ ...pair })),
    });
    current = next;
  }
  return {
    algorithm: frozenRound.algorithm,
    roundId: frozenRound.id,
    initial: initial.map((pair) => ({ ...pair })),
    steps,
    matches: current.map((pair) => ({ ...pair })),
    declinedPairs,
  };
}
