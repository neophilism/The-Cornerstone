import { MatchingError, type Round } from './index.js';

/**
 * CS-20: bound untrusted synthetic matching inputs before copying or hashing.
 * Do not use JSON.stringify or structuredClone on caller-controlled objects:
 * both invoke accessor properties before the matching contract can reject them.
 * Proxy descriptor traps cannot be made side-effect-free in JavaScript; the
 * transport boundary must still deserialize JSON into ordinary data objects.
 */
export const MAX_REPLAY_ROUND_ITEMS = 200_000;
export const MAX_REPLAY_ROUND_TEXT_UNITS = 4_000_000;

function invalid(code: string): never {
  throw new MatchingError(code, 'Frozen synthetic replay round is malformed or too large.');
}

class Budget {
  private items = 0;
  private textUnits = 0;

  consumeItems(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0) invalid('INVALID_ROUND');
    this.items += count;
    if (this.items > MAX_REPLAY_ROUND_ITEMS) invalid('ROUND_INPUT_TOO_LARGE');
  }

  scalar(value: unknown): unknown {
    if (typeof value === 'string') {
      this.textUnits += value.length;
      if (this.textUnits > MAX_REPLAY_ROUND_TEXT_UNITS) invalid('ROUND_INPUT_TOO_LARGE');
      return value;
    }
    if (
      value === null ||
      value === undefined ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    return invalid('INVALID_ROUND');
  }
}

function ownData(source: unknown, name: string): unknown {
  if (source === null || typeof source !== 'object') invalid('INVALID_ROUND');
  try {
    const descriptor = Object.getOwnPropertyDescriptor(source, name);
    if (descriptor && Object.hasOwn(descriptor, 'value')) return descriptor.value;
  } catch {
    // Revoked proxies and throwing descriptor traps are not valid replay data.
  }
  return invalid('INVALID_ROUND');
}

function checkedArray<T>(
  source: unknown,
  budget: Budget,
  snapshot: (value: unknown) => T,
): T[] {
  let isArray = false;
  try {
    isArray = Array.isArray(source);
  } catch {
    // Array.isArray itself throws on a revoked Proxy.
  }
  if (!isArray) invalid('INVALID_ROUND');
  const length = ownData(source, 'length');
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) {
    invalid('INVALID_ROUND');
  }
  // Refuse oversized arrays before inspecting any individual element.
  budget.consumeItems(length);
  const result: T[] = [];
  for (let index = 0; index < length; index++) {
    result.push(snapshot(ownData(source, String(index))));
  }
  return result;
}

/**
 * Create one detached, plain-data Round without evaluating getters anywhere
 * in its contracted object graph. Preserve ranking order and original scalar
 * values; ordinary policy rejection (including NOT_READY) remains in match().
 */
export function copyCheckedRound(source: unknown): Round {
  const budget = new Budget();
  const scalar = (value: unknown) => budget.scalar(value);
  const scalars = (value: unknown) => checkedArray(value, budget, scalar);
  const applicants = checkedArray(ownData(source, 'applicants'), budget, (applicant) => ({
    id: scalar(ownData(applicant, 'id')),
    priorityDate: scalar(ownData(applicant, 'priorityDate')),
    choices: scalars(ownData(applicant, 'choices')),
    ready: scalar(ownData(applicant, 'ready')),
    unremedied: scalar(ownData(applicant, 'unremedied')),
    constituents: scalars(ownData(applicant, 'constituents')),
  }));
  const offers = checkedArray(ownData(source, 'offers'), budget, (offer) => ({
    id: scalar(ownData(offer, 'id')),
    publishedVersion: scalar(ownData(offer, 'publishedVersion')),
    exclusiveRights: scalars(ownData(offer, 'exclusiveRights')),
    eligibleApplicantIds: scalars(ownData(offer, 'eligibleApplicantIds')),
  }));
  const frozen = {
    algorithm: scalar(ownData(source, 'algorithm')),
    id: scalar(ownData(source, 'id')),
    applicants,
    offers,
    tieOrder: scalars(ownData(source, 'tieOrder')),
  };
  return frozen as unknown as Round;
}
