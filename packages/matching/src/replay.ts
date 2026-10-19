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

/** Take exactly one descriptor-backed copy; never reread caller-owned event fields. */
function ownData(object: object, key: string, code: string): unknown {
  const property = Object.getOwnPropertyDescriptor(object, key);
  if (!property || !Object.hasOwn(property, 'value')) return invalid(code);
  return property.value;
}

function snapshotPair(value: unknown, code: string): Match {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return invalid(code);
  const applicantId = ownData(value, 'applicantId', code);
  const offerId = ownData(value, 'offerId', code);
  if (typeof applicantId !== 'string' || typeof offerId !== 'string') return invalid(code);
  return { applicantId, offerId };
}

function snapshotArray<T>(value: unknown, code: string, map: (value: unknown) => T): T[] {
  if (!Array.isArray(value)) return invalid(code);
  const length = ownData(value, 'length', code);
  if (!Number.isSafeInteger(length) || (length as number) < 0) return invalid(code);
  const result: T[] = [];
  for (let index = 0; index < (length as number); index++)
    result.push(map(ownData(value, String(index), code)));
  return result;
}

function snapshotEvent(value: unknown): ReplayEvent {
  const code = 'INVALID_REPLAY_EVENT';
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return invalid(code);
  const sequence = ownData(value, 'sequence', code);
  const failed = snapshotPair(ownData(value, 'failed', code), code);
  const willingApplicantIds = snapshotArray(
    ownData(value, 'willingApplicantIds', code),
    code,
    (id) => {
      if (typeof id !== 'string') return invalid(code);
      return id;
    },
  );
  const before = snapshotArray(ownData(value, 'before', code), 'REPLAY_MISMATCH', (pair) =>
    snapshotPair(pair, 'REPLAY_MISMATCH'),
  );
  const after = snapshotArray(ownData(value, 'after', code), 'REPLAY_MISMATCH', (pair) =>
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
  const initial = match(round).matches;
  if (!Array.isArray(events))
    throw new MatchingError('INVALID_REPLAY_EVENT', 'Negotiation events must be an array.');
  const maxDeclines = round.applicants.reduce(
    (count, applicant) => count + applicant.choices.length,
    0,
  );
  const eventCount = ownData(events, 'length', 'INVALID_REPLAY_EVENT');
  if (!Number.isSafeInteger(eventCount)) return invalid('INVALID_REPLAY_EVENT');
  if ((eventCount as number) > maxDeclines)
    throw new MatchingError('REPLAY_TOO_LONG', 'Negotiation history exceeds frozen choices.');
  let current = initial;
  const declinedPairs: Match[] = [];
  const steps: { sequence: number; failed: Match; matches: Match[] }[] = [];
  for (let index = 0; index < (eventCount as number); index++) {
    const event = snapshotEvent(ownData(events, String(index), 'INVALID_REPLAY_EVENT'));
    if (!Number.isSafeInteger(event.sequence) || event.sequence !== index + 1)
      throw new MatchingError(
        'INVALID_REPLAY_SEQUENCE',
        'Negotiation sequence must be contiguous.',
      );
    checkSnapshot(current, event.before);
    const next = continueFailedMatch(
      round,
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
    algorithm: round.algorithm,
    roundId: round.id,
    initial: initial.map((pair) => ({ ...pair })),
    steps,
    matches: current.map((pair) => ({ ...pair })),
    declinedPairs,
  };
}
