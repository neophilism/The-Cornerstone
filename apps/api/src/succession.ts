import type { Actor, CaseRecord, Receipt } from '@cornerstone/contracts';
import { IdSchema } from '@cornerstone/contracts';
import { DomainError, requireCondition } from '@cornerstone/domain';
import type { Transaction } from '@cornerstone/store';

/** Synthetic transfer of one existing founding unit, never an account or a second vote. */
export class SuccessionService {
  async prepare(
    tx: Transaction,
    actor: Actor,
    record: CaseRecord,
    action: string,
    data: Record<string, unknown>,
  ) {
    if (action === 'submit' || action === 'revise_request') {
      requireCondition(
        actor.id === record.ownerId,
        'SUCCESSION_PERSONAL_REQUEST',
        'Only the proposed successor may submit or revise their own request.',
      );
      IdSchema.parse(data['unitId']);
      for (const key of ['reviewedUnit', 'approvedUnit', 'decisionDate']) delete data[key];
    }
    if (action === 'begin_review') {
      const unitId = IdSchema.parse(data['unitId']);
      const context = (
        await tx.query('SELECT * FROM simulation_succession_context($1,$2)', [record.id, unitId])
      ).rows[0];
      requireCondition(
        context,
        'SUCCESSION_SCOPE',
        'Separate assigned, unconflicted review of the request, association and original claim is required.',
      );
      data['reviewedUnit'] = {
        unitId: context.unit_id,
        associationId: context.association_id,
        claimId: context.claim_id,
        predecessorId: context.predecessor_id,
        holderVersion: context.holder_version,
        holderCapacity: context.holder_capacity,
        rightsHolderId: context.rights_holder_id,
      };
    }
    if (action === 'approve') {
      const context = data['reviewedUnit'] as Record<string, unknown> | undefined;
      requireCondition(
        context &&
          context['unitId'] === data['unitId'] &&
          Number.isInteger(context['holderVersion']),
        'SUCCESSION_REVIEW_REQUIRED',
        'Begin a new scoped review before approving this specific unit.',
      );
      requireCondition(
        (data['transferBasis'] === 'member_death' &&
          ['founder', 'designated_successor'].includes(String(context['holderCapacity']))) ||
          (data['transferBasis'] === 'estate_designation' &&
            context['holderCapacity'] === 'estate_representative' &&
            data['capacity'] === 'designated_successor'),
        'SUCCESSION_CAPACITY',
        'Use a documented death transition or the final designation from a pending estate representative; no sale or ordinary reassignment is allowed.',
      );
      data['approvedUnit'] = {
        ...context,
        successorId: record.ownerId,
        nextHolderVersion: Number(context['holderVersion']) + 1,
      };
    }
    return data;
  }
  async finish(tx: Transaction, record: CaseRecord, receipt: Receipt) {
    const context = record.data['reviewedUnit'] as Record<string, unknown>;
    try {
      await tx.query('SELECT simulation_transfer_unit($1,$2,$3,$4,$5,$6,$7)', [
        record.id,
        context['unitId'],
        context['holderVersion'],
        context['predecessorId'],
        record.data['transferBasis'],
        record.data['capacity'],
        receipt.id,
      ]);
    } catch (error) {
      const messages: Record<string, string> = {
        SUCCESSION_SCOPE:
          'The assigned review or related-record permissions changed. No unit was transferred.',
        SUCCESSION_STALE:
          'The unit holder changed during review. Reopen the review; no unit or receipt was changed.',
        SUCCESSION_RECIPIENT:
          'The proposed successor cannot receive this unit in the current scope.',
        SUCCESSION_CAPACITY:
          'The documented succession route does not match the current unit holder.',
        SUCCESSION_RECEIPT: 'An approval receipt bound to this exact decision is required.',
        SUCCESSION_VOTE_COLLISION:
          'This person already exercises a founding vote in this association. A lawful single-vote arrangement needs separate review; no right is forfeited or split.',
      };
      if (error instanceof Error && messages[error.message])
        throw new DomainError(error.message, messages[error.message]!, 409);
      throw error;
    }
  }
}
