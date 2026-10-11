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
function validate(round: Round) {
  if (round.algorithm !== 'cornerstone-da-1')
    throw new MatchingError('ALGORITHM_VERSION', 'Unknown matching algorithm.');
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
    if (!o.publishedVersion)
      throw new MatchingError('UNPUBLISHED_OFFER', 'Published offer versions are required.');
    for (const r of o.exclusiveRights) {
      if (rights.has(r))
        throw new MatchingError(
          'OVERLAPPING_RIGHTS',
          'Offers cannot promise overlapping exclusive rights.',
        );
      rights.add(r);
    }
  }
  for (const a of round.applicants) {
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
    x.priorityDate.localeCompare(y.priorityDate) ||
    round.tieOrder.indexOf(a) - round.tieOrder.indexOf(b)
  );
}
export function match(round: Round) {
  validate(round);
  const offers = new Map(round.offers.map((o) => [o.id, o])),
    applicants = new Map(round.applicants.map((a) => [a.id, a]));
  const held = new Map<string, string>(),
    next = new Map(round.applicants.map((a) => [a.id, 0]));
  const queue = [...round.applicants].sort((a, b) => a.id.localeCompare(b.id)).map((a) => a.id);
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
    .sort((a, b) => a.offerId.localeCompare(b.offerId));
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
export function continueFailedMatch(
  round: Round,
  active: readonly Match[],
  failed: Match,
  willingApplicantIds: readonly string[],
  declinedPairs: readonly Match[],
) {
  validate(round);
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
  const declined = new Set([...declinedPairs, failed].map((m) => `${m.applicantId}:${m.offerId}`));
  const applicants = round.applicants
    .filter((a) => !activeByApplicant.has(a.id) && willingApplicantIds.includes(a.id))
    .map((a) => ({
      ...a,
      choices: a.choices.filter((o) => !activeOfferIds.has(o) && !declined.has(`${a.id}:${o}`)),
    }));
  const allowed = new Set(applicants.map((a) => a.id));
  const reduced = {
    ...round,
    applicants,
    offers: round.offers.filter((o) => !activeOfferIds.has(o.id)),
    tieOrder: round.tieOrder.filter((id) => allowed.has(id)),
  };
  return [
    ...active.filter(
      (m) => !(m.applicantId === failed.applicantId && m.offerId === failed.offerId),
    ),
    ...match(reduced).matches,
  ];
}
