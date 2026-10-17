import { StateOriginSchema, type Actor, type CaseRecord } from '@cornerstone/contracts';

export const stateReviewActions = ['verify', 'begin_review', 'publish', 'deny'];
const incompatibleRoles = [
  'state',
  'participant',
  'representative',
  'member',
  'provider',
  'investor',
];

export function statePacketOwner(actor: Actor, record: CaseRecord): boolean {
  const origin = StateOriginSchema.safeParse(record.data['stateOrigin']);
  return (
    origin.success &&
    ['state_authority', 'offer'].includes(record.kind) &&
    actor.realm === 'simulation' &&
    record.realm === actor.realm &&
    actor.assurance === 'privileged' &&
    actor.roles.includes('state') &&
    actor.id === record.ownerId &&
    actor.id === origin.data.actorId &&
    actor.institutionId === origin.data.institutionId &&
    actor.jurisdiction === origin.data.jurisdiction &&
    record.jurisdiction === origin.data.jurisdiction &&
    !actor.conflicts.includes(record.id)
  );
}

export function independentStateReviewer(actor: Actor, record: CaseRecord): boolean {
  const origin = StateOriginSchema.safeParse(record.data['stateOrigin']);
  return (
    origin.success &&
    ['state_authority', 'offer'].includes(record.kind) &&
    actor.realm === 'simulation' &&
    record.realm === actor.realm &&
    actor.assurance === 'privileged' &&
    actor.roles.includes('supervisor') &&
    !actor.roles.some((role) => incompatibleRoles.includes(role)) &&
    actor.id !== record.ownerId &&
    actor.id !== origin.data.actorId &&
    actor.institutionId !== origin.data.institutionId &&
    actor.institutionId === record.institutionId &&
    actor.jurisdiction === origin.data.jurisdiction &&
    record.jurisdiction === origin.data.jurisdiction &&
    actor.assignments.includes(record.id) &&
    !actor.conflicts.includes(record.id)
  );
}
