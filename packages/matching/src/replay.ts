import { match, continueFailedMatch, MatchingError, type Match, type Round } from './index.js';

export type ReplayEvent = Readonly<{
  sequence: number;
  failed: Match;
  willingApplicantIds: readonly string[];
  before: readonly Match[];
  after: readonly Match[];
}>;

function isPair(value: unknown): value is Match {
  if (typeof value !== 'object' || value === null) return false;
  const pair = value as Record<string, unknown>;
  return typeof pair.applicantId === 'string' && typeof pair.offerId === 'string';
}

const pairKey = (m: Match) => JSON.stringify([m.applicantId, m.offerId]);
const ordered = (pairs: readonly Match[]) => pairs.map(pairKey).sort();
function checkSnapshot(expected: readonly Match[], actual: readonly Match[]) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    !Array.from({ length: actual.length }, (_, index) => actual[index]).every(isPair)
  )
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

function checkEvent(event: unknown): asserts event is ReplayEvent {
  if (typeof event !== 'object' || event === null)
    throw new MatchingError('INVALID_REPLAY_EVENT', 'Negotiation event is malformed.');
  const value = event as Record<string, unknown>;
  const willing = value.willingApplicantIds;
  if (
    !isPair(value.failed) ||
    !Array.isArray(willing) ||
    !Array.from({ length: willing.length }, (_, index) => willing[index]).every(
      (id: unknown) => typeof id === 'string',
    )
  )
    throw new MatchingError('INVALID_REPLAY_EVENT', 'Negotiation event is malformed.');
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
  if (events.length > maxDeclines)
    throw new MatchingError('REPLAY_TOO_LONG', 'Negotiation history exceeds frozen choices.');
  let current = initial;
  const declinedPairs: Match[] = [];
  const steps: { sequence: number; failed: Match; matches: Match[] }[] = [];
  for (const [index, event] of events.entries()) {
    checkEvent(event);
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
