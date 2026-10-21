/**
 * A process-local synthetic state-offer objection model for CS-19.
 * This is not public notice, lawful supervision, durable persistence or real intake.
 */
export type ObjectionFinding = 'harm_found' | 'no_harm_found';
export type ObjectionStatus = 'pending' | ObjectionFinding;

export type ObjectionActor = Readonly<{
  id: string;
  institutionId: string;
  jurisdiction: string;
  roles: readonly string[];
  active: boolean;
  conflicts: readonly string[];
}>;

export type ObjectionBinding = Readonly<{
  offerId: string;
  publicationDigest: string;
  authorityId: string;
  jurisdiction: string;
  publishingInstitutionId: string;
  supervisingInstitutionId: string;
  publishedAt: string;
}>;

export type ObjectionRecord = Readonly<{
  id: string;
  offerId: string;
  publicationDigest: string;
  filerId: string;
  filerInstitutionId: string;
  filedAt: string;
  allegedNewHarm: string;
  evidenceRefs: readonly string[];
  status: ObjectionStatus;
  decision?: Readonly<{
    decidedAt: string;
    reviewerId: string;
    reviewerInstitutionId: string;
    finding: ObjectionFinding;
    reasons: string;
    evidenceRefs: readonly string[];
  }>;
}>;

export type ObjectionReceipt = Readonly<{
  sequence: number;
  revision: number;
  action: 'file_objection' | 'decide_objection';
  requestKey: string;
  actorId: string;
  objectionId: string;
  acceptedAt: string;
}>;

export class ObjectionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ObjectionError';
  }
}

function reject(code: string): never {
  throw new ObjectionError(code, 'Synthetic offer objection rejected: ' + code);
}

function own(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null) return reject('INVALID_INPUT');
  try {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor && Object.hasOwn(descriptor, 'value')) return descriptor.value;
  } catch {
    // Revoked proxy or throwing descriptor: reject; never read a property getter.
  }
  return reject('INVALID_INPUT');
}

function str(value: unknown, max = 256): string {
  if (typeof value !== 'string' || value.trim() !== value || !value || value.length > max) {
    return reject('INVALID_INPUT');
  }
  return value;
}

function arr(source: unknown, max: number): string[] {
  let valid = false;
  try {
    valid = Array.isArray(source);
  } catch {
    // Revoked proxy.
  }
  if (!valid) return reject('INVALID_INPUT');
  const length = own(source, 'length');
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > max) {
    return reject('INVALID_INPUT');
  }
  const result: string[] = [];
  for (let index = 0; index < length; index++) result.push(str(own(source, String(index))));
  if (new Set(result).size !== result.length) return reject('DUPLICATE_EVIDENCE');
  return result;
}

function instant(value: unknown): string {
  if (typeof value !== 'string' || value.length > 64) return reject('INVALID_INSTANT');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return reject('INVALID_INSTANT');
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) {
    return reject('INVALID_INSTANT');
  }
  return value;
}

function snapshotActor(source: unknown): ObjectionActor {
  const roles = arr(own(source, 'roles'), 16);
  const conflicts = arr(own(source, 'conflicts'), 256);
  const active = own(source, 'active');
  if (typeof active !== 'boolean') return reject('INVALID_INPUT');
  return {
    id: str(own(source, 'id')),
    institutionId: str(own(source, 'institutionId')),
    jurisdiction: str(own(source, 'jurisdiction')),
    roles,
    conflicts,
    active,
  };
}

function snapshotBinding(source: unknown): ObjectionBinding {
  const publicationDigest = str(own(source, 'publicationDigest'), 64);
  if (!/^[a-f0-9]{64}$/.test(publicationDigest)) return reject('INVALID_BINDING');
  return {
    offerId: str(own(source, 'offerId')),
    publicationDigest,
    authorityId: str(own(source, 'authorityId')),
    jurisdiction: str(own(source, 'jurisdiction')),
    publishingInstitutionId: str(own(source, 'publishingInstitutionId')),
    supervisingInstitutionId: str(own(source, 'supervisingInstitutionId')),
    publishedAt: instant(own(source, 'publishedAt')),
  };
}

function copyRecord(value: ObjectionRecord): ObjectionRecord {
  return {
    ...value,
    evidenceRefs: [...value.evidenceRefs],
    ...(value.decision
      ? { decision: { ...value.decision, evidenceRefs: [...value.decision.evidenceRefs] } }
      : {}),
  };
}

function participant(actor: ObjectionActor, binding: ObjectionBinding) {
  if (
    !actor.active ||
    actor.jurisdiction !== binding.jurisdiction ||
    actor.institutionId === binding.publishingInstitutionId ||
    actor.conflicts.includes(binding.offerId) ||
    actor.roles.some((role) => ['state', 'supervisor', 'provider', 'investor'].includes(role)) ||
    !actor.roles.some((role) => role === 'member' || role === 'representative')
  ) {
    return reject('OBJECTION_NOT_AUTHORIZED');
  }
}

function supervisor(actor: ObjectionActor, binding: ObjectionBinding, objection: ObjectionRecord) {
  if (
    !actor.active ||
    actor.jurisdiction !== binding.jurisdiction ||
    actor.institutionId !== binding.supervisingInstitutionId ||
    !actor.roles.includes('supervisor') ||
    actor.id === objection.filerId ||
    actor.institutionId === objection.filerInstitutionId ||
    actor.conflicts.includes(binding.offerId) ||
    actor.conflicts.includes(objection.id) ||
    actor.roles.some((role) =>
      ['state', 'member', 'representative', 'provider', 'investor'].includes(role),
    )
  ) {
    return reject('INDEPENDENT_REVIEW_REQUIRED');
  }
}

export class SyntheticStateOfferObjections {
  readonly binding: ObjectionBinding;
  readonly objectionWindowClosesAt: string;
  private records = new Map<string, ObjectionRecord>();
  private receipts = new Map<string, { signature: string; receipt: ObjectionReceipt }>();
  private currentRevision = 0;

  constructor(binding: unknown) {
    this.binding = Object.freeze(snapshotBinding(binding));
    if (this.binding.supervisingInstitutionId === this.binding.publishingInstitutionId) {
      reject('INDEPENDENT_SUPERVISION_REQUIRED');
    }
    // Synthetic calendar only; legal notice and statutory deadlines remain external.
    const closesAt = Date.parse(this.binding.publishedAt) + 60 * 86_400_000;
    if (!Number.isFinite(closesAt) || closesAt > 8_640_000_000_000_000) {
      reject('INVALID_INSTANT');
    }
    this.objectionWindowClosesAt = new Date(closesAt).toISOString();
  }

  get revision() {
    return this.currentRevision;
  }

  get allRecords(): ObjectionRecord[] {
    return [...this.records.values()].map(copyRecord);
  }

  get prospectiveObjectionHold(): boolean {
    return [...this.records.values()].some((record) => record.status !== 'no_harm_found');
  }

  get existingCompactsUnaffected(): true {
    return true;
  }

  private recover(key: string, signature: string): ObjectionReceipt | undefined {
    const previous = this.receipts.get(key);
    if (!previous) return undefined;
    if (previous.signature !== signature) reject('REQUEST_KEY_CONFLICT');
    return { ...previous.receipt };
  }

  file(source: unknown, caller: unknown, acceptedAt: unknown): ObjectionReceipt {
    const actor = snapshotActor(caller);
    const now = instant(acceptedAt);
    const offerId = str(own(source, 'offerId'));
    const publicationDigest = str(own(source, 'publicationDigest'), 64);
    const requestKey = str(own(source, 'requestKey'));
    const allegedNewHarm = str(own(source, 'allegedNewHarm'), 4000);
    const evidenceRefs = arr(own(source, 'evidenceRefs'), 16);
    if (own(source, 'attestedSynthetic') !== true || evidenceRefs.length === 0) {
      reject('OBJECTION_EVIDENCE_REQUIRED');
    }

    const signature = JSON.stringify(['file', offerId, publicationDigest, allegedNewHarm, evidenceRefs]);
    participant(actor, this.binding);
    if (offerId !== this.binding.offerId || publicationDigest !== this.binding.publicationDigest) {
      reject('OBJECTION_OFFER_MISMATCH');
    }
    const key = actor.id + ':' + requestKey;
    const recovered = this.recover(key, signature);
    if (recovered) return recovered;
    if (now < this.binding.publishedAt || now >= this.objectionWindowClosesAt) {
      reject('OBJECTION_WINDOW_CLOSED');
    }
    if (this.records.size >= 10_000) reject('OBJECTION_CAPACITY');

    const revision = this.currentRevision + 1;
    const objectionId = 'synthetic-objection-' + revision;
    const record: ObjectionRecord = {
      id: objectionId,
      offerId,
      publicationDigest,
      filerId: actor.id,
      filerInstitutionId: actor.institutionId,
      filedAt: now,
      allegedNewHarm,
      evidenceRefs: [...evidenceRefs],
      status: 'pending',
    };
    const receipt: ObjectionReceipt = {
      sequence: revision,
      revision,
      action: 'file_objection',
      requestKey,
      actorId: actor.id,
      objectionId,
      acceptedAt: now,
    };
    this.records.set(objectionId, record);
    this.receipts.set(key, { signature, receipt });
    this.currentRevision = revision;
    return { ...receipt };
  }

  decide(source: unknown, caller: unknown, acceptedAt: unknown): ObjectionReceipt {
    const actor = snapshotActor(caller);
    const now = instant(acceptedAt);
    const objectionId = str(own(source, 'objectionId'));
    const offerId = str(own(source, 'offerId'));
    const publicationDigest = str(own(source, 'publicationDigest'), 64);
    const requestKey = str(own(source, 'requestKey'));
    const expectedRevision = own(source, 'expectedRevision');
    const finding = own(source, 'finding');
    const reasons = str(own(source, 'reasons'), 4000);
    const evidenceRefs = arr(own(source, 'evidenceRefs'), 16);
    if (finding !== 'harm_found' && finding !== 'no_harm_found') reject('INVALID_FINDING');
    if (!Number.isSafeInteger(expectedRevision) || (expectedRevision as number) < 1) {
      reject('INVALID_VERSION');
    }
    if (evidenceRefs.length === 0) reject('OBJECTION_EVIDENCE_REQUIRED');
    if (offerId !== this.binding.offerId || publicationDigest !== this.binding.publicationDigest) {
      reject('OBJECTION_OFFER_MISMATCH');
    }
    const record = this.records.get(objectionId);
    if (!record) reject('OBJECTION_NOT_FOUND');
    supervisor(actor, this.binding, record);

    const key = actor.id + ':' + requestKey;
    const signature = JSON.stringify([
      'decide',
      objectionId,
      offerId,
      publicationDigest,
      finding,
      reasons,
      evidenceRefs,
      expectedRevision,
    ]);
    const recovered = this.recover(key, signature);
    if (recovered) return recovered;
    if (record.status !== 'pending') reject('OBJECTION_ALREADY_DECIDED');
    if (now < record.filedAt) reject('INVALID_INSTANT');
    if (expectedRevision !== this.currentRevision) reject('STALE_OBJECTION_REVISION');

    const revision = this.currentRevision + 1;
    const next: ObjectionRecord = {
      ...record,
      status: finding,
      decision: {
        decidedAt: now,
        reviewerId: actor.id,
        reviewerInstitutionId: actor.institutionId,
        finding,
        reasons,
        evidenceRefs: [...evidenceRefs],
      },
    };
    const receipt: ObjectionReceipt = {
      sequence: revision,
      revision,
      action: 'decide_objection',
      requestKey,
      actorId: actor.id,
      objectionId,
      acceptedAt: now,
    };
    this.records.set(objectionId, next);
    this.receipts.set(key, { signature, receipt });
    this.currentRevision = revision;
    return { ...receipt };
  }
}
