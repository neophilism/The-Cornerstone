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
function checkSnapshot(expected: readonly Match[], actual: readonly Match[]) {
  if (!Array.isArray(actual) || actual.length !== expected.length)
    throw new MatchingError('REPLAY_MISMATCH', 'Recorded allocations diverge from frozen matching.');
  const a = ordered(expected);
  const b = ordered(actual);
  if (a.some((pair, i) => pair !== b[i]))
    throw new MatchingError('REPLAY_MISMATCH', 'Recorded allocations diverge from frozen matching.');
}

/** Replay only declared frozen inputs; authentication and custody remain separate. */
export function replayFailedMatches(round: Round, events: readonly ReplayEvent[]) {
  const initial = match(round).matches;
  let current = initial;
  const declinedPairs: Match[] = [];
  const steps: { sequence: number; failed: Match; matches: Match[] }[] = [];
  for (const [index, event] of events.entries()) {
    if (!Number.isSafeInteger(event.sequence) || event.sequence !== index + 1)
      throw new MatchingError('INVALID_REPLAY_SEQUENCE', 'Negotiation sequence must be contiguous.');
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
