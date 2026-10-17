export type Applicant = Readonly<{
  id: string;
  priorityDate: string;
  choices: readonly string[];
  ready: boolean;
  unremedied: boolean;
  constituents: readonly string[];
}>;
export type Offer = Readonly<{
  id: string;
  exclusiveRights: readonly string[];
  eligibleApplicantIds: readonly string[];
  publishedVersion: string;
}>;
export type Round = Readonly<{
  id: string;
  applicants: readonly Applicant[];
  offers: readonly Offer[];
  tieOrder: readonly string[];
  algorithm: 'cornerstone-da-1';
}>;
export type Match = Readonly<{ applicantId: string; offerId: string }>;
export class MatchingError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
// Identifiers only order reproducible output; priority still comes from the fixed public draw.
const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const pairKey = (pair: Match) => JSON.stringify([pair.applicantId, pair.offerId]);
const named = (value: string) => typeof value === 'string' && value.trim().length > 0;
function validate(round: Round) {
  if (round.algorithm !== 'cornerstone-da-1')
    throw new MatchingError('ALGORITHM_VERSION', 'Unknown matching algorithm.');
  if (
    !named(round.id) ||
    round.applicants.some((a) => !named(a.id)) ||
    round.offers.some((o) => !named(o.id))
  )
    throw new MatchingError('INVALID_ID', 'Frozen round identifiers must be nonblank.');
  const applicants = new Set(round.applicants.map((a) => a.id)),
    offers = new Set(round.offers.map((o) => o.id));
  if (applicants.size !== round.applicants.length || offers.size !== round.offers.length)
    throw new MatchingError('DUPLICATE_ID', 'Round identifiers must be unique.');
  if (
    new Set(round.tieOrder).size !== applicants.size ||
    round.tieOrder.length !== applicants.size ||
    round.tieOrder.some((id) => !applicants.has(id))
  )
    throw new MatchingError(
      'INVALID_DRAW',
      'One fixed public tie order must include every applicant exactly once.',
    );
  const rights = new Set<string>(),
    constituents = new Set<string>();
  for (const o of round.offers) {
    if (!named(o.publishedVersion))
      throw new MatchingError('UNPUBLISHED_OFFER', 'Published offer versions are required.');
    if (
      new Set(o.eligibleApplicantIds).size !== o.eligibleApplicantIds.length ||
      o.eligibleApplicantIds.some((id) => !applicants.has(id))
    )
      throw new MatchingError(
        'INVALID_ELIGIBILITY',
        'Published eligibility must identify each frozen applicant at most once.',
      );
    for (const r of o.exclusiveRights) {
      if (!named(r))
        throw new MatchingError('INVALID_RIGHT', 'Exclusive rights need a nonblank identity.');
      if (rights.has(r))
        throw new MatchingError(
          'OVERLAPPING_RIGHTS',
          'Offers cannot promise overlapping exclusive rights.',
        );
      rights.add(r);
    }
  }
  for (const a of round.applicants) {
    if (!a.constituents.length || a.constituents.some((id) => !named(id)))
      throw new MatchingError(
        'INVALID_CONSTITUENT',
        'Each frozen applicant needs identified founding constituents.',
      );
    const date = new Date(`${a.priorityDate}T00:00:00Z`);
    if (
      !a.ready ||
      !a.unremedied ||
      !/^\d{4}-\d{2}-\d{2}$/.test(a.priorityDate) ||
      Number.isNaN(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== a.priorityDate
    )
      throw new MatchingError(
        'NOT_READY',
        'Each applicant needs closed-roll readiness and an actual unremedied attributable-loss date.',
      );
    if (new Set(a.choices).size !== a.choices.length || a.choices.some((id) => !offers.has(id)))
      throw new MatchingError(
        'INVALID_CHOICES',
        'Rank each acceptable published offer at most once.',
      );
    for (const c of a.constituents) {
      if (constituents.has(c))
        throw new MatchingError(
          'DUPLICATE_CONSTITUENT',
          'A constituent cannot enter independently and through a consortium.',
        );
      constituents.add(c);
    }
  }
}
export function priority(round: Round, a: string, b: string): number {
  const x = round.applicants.find((i) => i.id === a),
    y = round.applicants.find((i) => i.id === b);
  if (!x || !y)
    throw new MatchingError('UNKNOWN_APPLICANT', 'Priority requires a frozen applicant record.');
  return (
    compareIds(x.priorityDate, y.priorityDate) ||
    round.tieOrder.indexOf(a) - round.tieOrder.indexOf(b)
  );
}
export function match(round: Round) {
  validate(round);
  const offers = new Map(round.offers.map((o) => [o.id, o])),
    applicants = new Map(round.applicants.map((a) => [a.id, a]));
  const held = new Map<string, string>(),
    next = new Map(round.applicants.map((a) => [a.id, 0]));
  const queue = [...round.applicants].sort((a, b) => compareIds(a.id, b.id)).map((a) => a.id);
  const trace: {
    applicantId: string;
    offerId: string;
    outcome: 'held' | 'rejected' | 'ineligible';
    displacedId?: string;
  }[] = [];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++]!,
      a = applicants.get(id)!;
    const index = next.get(id)!;
    const offerId = a.choices[index];
    if (!offerId) continue;
    next.set(id, index + 1);
    const o = offers.get(offerId)!;
    if (!o.eligibleApplicantIds.includes(id)) {
      trace.push({ applicantId: id, offerId, outcome: 'ineligible' });
      queue.push(id);
      continue;
    }
    const incumbent = held.get(offerId);
    if (!incumbent) {
      held.set(offerId, id);
      trace.push({ applicantId: id, offerId, outcome: 'held' });
    } else if (priority(round, id, incumbent) < 0) {
      held.set(offerId, id);
      queue.push(incumbent);
      trace.push({ applicantId: id, offerId, outcome: 'held', displacedId: incumbent });
    } else {
      queue.push(id);
      trace.push({ applicantId: id, offerId, outcome: 'rejected' });
    }
  }
  const matches = [...held]
    .map(([offerId, applicantId]) => ({ applicantId, offerId }))
    .sort((a, b) => compareIds(a.offerId, b.offerId));
  const matched = new Set(matches.map((m) => m.applicantId));
  return {
    algorithm: round.algorithm,
    matches,
    unmatched: round.applicants
      .filter((a) => !matched.has(a.id))
      .map((a) => a.id)
      .sort(),
    trace,
  };
}
/**
 * Continue one failed negotiation under the original frozen rankings and public priority.
 * declinedPairs is the cumulative history of failed/declined negotiations in this round,
 * not a new ranking or an arbitrary exclusion list. It may include the current failed pair.
 * This pure calculation does not establish custody, consent or the provenance of that history.
 */
export function continueFailedMatch(
  round: Round,
  active: readonly Match[],
  failed: Match,
  willingApplicantIds: readonly string[],
  declinedPairs: readonly Match[],
) {
  validate(round);
  const applicantsById = new Map(round.applicants.map((a) => [a.id, a]));
  const offersById = new Map(round.offers.map((o) => [o.id, o]));
  const validatePair = (pair: Match) => {
    const applicant = applicantsById.get(pair.applicantId);
    const offer = offersById.get(pair.offerId);
    if (
      !applicant ||
      !offer ||
      !applicant.choices.includes(offer.id) ||
      !offer.eligibleApplicantIds.includes(applicant.id)
    )
      throw new MatchingError(
        'INVALID_CONTINUATION_PAIR',
        'A continuation pair must be eligible and ranked in the original frozen round.',
      );
  };
  const heldApplicants = new Set<string>();
  const heldOffers = new Set<string>();
  const activePairs = new Set<string>();
  for (const pair of active) {
    validatePair(pair);
    if (heldApplicants.has(pair.applicantId) || heldOffers.has(pair.offerId))
      throw new MatchingError(
        'DUPLICATE_ACTIVE_MATCH',
        'An applicant and an indivisible offer may each have only one active match.',
      );
    heldApplicants.add(pair.applicantId);
    heldOffers.add(pair.offerId);
    activePairs.add(pairKey(pair));
  }
  validatePair(failed);
  const failedKey = pairKey(failed);
  if (!activePairs.has(failedKey))
    throw new MatchingError('INACTIVE_FAILURE', 'The failed pair must be an exact active match.');
  const willing = new Set(willingApplicantIds);
  if (
    willing.size !== willingApplicantIds.length ||
    willingApplicantIds.some((id) => !applicantsById.has(id))
  )
    throw new MatchingError(
      'INVALID_WILLING_APPLICANTS',
      'Willing continuation applicants must be unique identities in the frozen round.',
    );
  const declined = new Set<string>();
  for (const pair of declinedPairs) {
    validatePair(pair);
    const key = pairKey(pair);
    if (declined.has(key))
      throw new MatchingError('DUPLICATE_DECLINE', 'Prior failed pairs must be unique.');
    if (activePairs.has(key) && key !== failedKey)
      throw new MatchingError(
        'ACTIVE_DECLINE',
        'A surviving active match cannot also be recorded as declined.',
      );
    declined.add(key);
  }
  // The failed pair may already be in an accumulated failure log. Tuple keys cannot collide
  // when the opaque applicant and offer identifiers themselves contain punctuation.
  declined.add(failedKey);
  const nextChoice = new Map<string, number>();
  for (const pair of [...declinedPairs, failed]) {
    const index = applicantsById.get(pair.applicantId)!.choices.indexOf(pair.offerId) + 1;
    nextChoice.set(pair.applicantId, Math.max(nextChoice.get(pair.applicantId) ?? 0, index));
  }
  for (const pair of active) {
    const rank = applicantsById.get(pair.applicantId)!.choices.indexOf(pair.offerId);
    const cursor = nextChoice.get(pair.applicantId) ?? 0;
    if (rank + (pairKey(pair) === failedKey ? 1 : 0) < cursor)
      throw new MatchingError(
        'REGRESSED_ACTIVE_MATCH',
        'An active match cannot precede or repeat that applicant’s failed negotiation history.',
      );
  }
  const activeByApplicant = new Set(
    active
      .filter((m) => !(m.applicantId === failed.applicantId && m.offerId === failed.offerId))
      .map((m) => m.applicantId),
  );
  const activeOfferIds = new Set(
    active
      .filter((m) => !(m.applicantId === failed.applicantId && m.offerId === failed.offerId))
      .map((m) => m.offerId),
  );
  const applicants = round.applicants
    .filter((a) => !activeByApplicant.has(a.id) && willing.has(a.id))
    .map((a) => ({
      ...a,
      choices: a.choices
        .slice(nextChoice.get(a.id) ?? 0)
        .filter(
          (o) =>
            !activeOfferIds.has(o) && !declined.has(pairKey({ applicantId: a.id, offerId: o })),
        ),
    }));
  const allowed = new Set(applicants.map((a) => a.id));
  const reduced = {
    ...round,
    applicants,
    offers: round.offers
      .filter((o) => !activeOfferIds.has(o.id))
      .map((o) => ({
        ...o,
        eligibleApplicantIds: o.eligibleApplicantIds.filter((id) => allowed.has(id)),
      })),
    tieOrder: round.tieOrder.filter((id) => allowed.has(id)),
  };
  return [
    ...active.filter(
      (m) => !(m.applicantId === failed.applicantId && m.offerId === failed.offerId),
    ),
    ...match(reduced).matches,
  ].sort((a, b) => compareIds(a.offerId, b.offerId));
}
