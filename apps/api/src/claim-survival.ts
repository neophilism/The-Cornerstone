import { randomUUID } from 'node:crypto';
import { IdSchema, type Actor, type CaseRecord, type Receipt } from '@cornerstone/contracts';
import { DomainError, requireCondition } from '@cornerstone/domain';
import { digest } from '@cornerstone/security';
import { Store, type Transaction } from '@cornerstone/store';

/** Authority over one un-enrolled claim file, not an account or an eligibility finding. */
export class ClaimSurvivalService {
  constructor(private readonly store: Store) {}
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
        'SURVIVAL_PERSONAL_REQUEST',
        'Only the proposed successor may submit or revise this request.',
      );
      IdSchema.parse(data['claimId']);
      delete data['reviewedClaim'];
      delete data['approvedClaim'];
    }
    if (action === 'begin_review') {
      const context = (
        await tx.query('SELECT * FROM simulation_claim_survival_context($1,$2)', [
          record.id,
          IdSchema.parse(data['claimId']),
        ])
      ).rows[0];
      requireCondition(
        context,
        'CLAIM_SURVIVAL_SCOPE',
        'Separate assigned, unconflicted review of this request and the original claim is required.',
      );
      requireCondition(
        !context.enrolled && !['provisional', 'remedied'].includes(context.claim_state),
        'CLAIM_ALREADY_ENROLLED',
        'An enrolled claim follows the founding-unit succession route, not a new claim or unit.',
      );
      data['reviewedClaim'] = {
        claimId: context.claim_id,
        claimVersion: context.claim_version,
        claimState: context.claim_state,
        predecessorId: context.predecessor_id,
        holderVersion: context.holder_version,
        holderCapacity: context.holder_capacity,
        originalWorkerId: context.original_worker_id,
        rightsHolderId: context.rights_holder_id,
      };
    }
    if (action === 'approve') {
      const context = data['reviewedClaim'] as Record<string, unknown> | undefined;
      requireCondition(
        context &&
          context['claimId'] === data['claimId'] &&
          Number.isInteger(context['claimVersion']) &&
          Number.isInteger(context['holderVersion']),
        'CLAIM_SURVIVAL_REVIEW_REQUIRED',
        'Begin a scoped review of the original claim before approving this request.',
      );
      requireCondition(
        (data['transferBasis'] === 'holder_death' &&
          ['worker', 'designated_successor'].includes(String(context['holderCapacity']))) ||
          (data['transferBasis'] === 'estate_designation' &&
            context['holderCapacity'] === 'estate_representative' &&
            data['capacity'] === 'designated_successor'),
        'CLAIM_SURVIVAL_CAPACITY',
        'Use a documented death or the final designation from an existing estate representative. Ordinary reassignment is unavailable.',
      );
      data['approvedClaim'] = {
        ...context,
        successorId: record.ownerId,
        nextClaimVersion: Number(context['claimVersion']) + 1,
      };
    }
    return data;
  }
  async recordReview(tx: Transaction, request: CaseRecord, receipt: Receipt) {
    await tx.query('SELECT simulation_record_claim_survival_review($1,$2,$3)', [
      request.id,
      IdSchema.parse(request.data['claimId']),
      receipt.id,
    ]);
  }
  async finish(tx: Transaction, actor: Actor, request: CaseRecord, approval: Receipt) {
    const context = request.data['reviewedClaim'] as Record<string, unknown>;
    const claimId = IdSchema.parse(context['claimId']);
    const old = await this.store.get(tx, claimId, true);
    requireCondition(
      old && old.kind === 'claim',
      'CLAIM_SURVIVAL_SCOPE',
      'The original claim is no longer available in this review scope.',
    );
    try {
      await tx.query('SELECT simulation_transfer_claim_control($1,$2,$3,$4,$5,$6,$7,$8)', [
        request.id,
        claimId,
        context['claimVersion'],
        context['holderVersion'],
        context['predecessorId'],
        request.data['transferBasis'],
        request.data['capacity'],
        approval.id,
      ]);
    } catch (error) {
      const messages: Record<string, string> = {
        CLAIM_SURVIVAL_SCOPE:
          'The assigned review or claim permissions changed. No claim was transferred.',
        CLAIM_ALREADY_ENROLLED:
          'This claim has entered a founding roll. Use the unit-succession route; no second claim or unit was created.',
        CLAIM_SURVIVAL_CONTESTED:
          'Another live reviewed successor request names this claim. Resolve the competing request through assigned review before approval; no holder was changed.',
        CLAIM_SURVIVAL_STALE:
          'The original claim or its holder changed. Reopen review; the decision and transfer were rolled back.',
        CLAIM_SURVIVAL_RECIPIENT:
          'The proposed successor cannot receive this claim in the current scope.',
        CLAIM_SURVIVAL_CAPACITY: 'The documented route does not match the current claim holder.',
        CLAIM_SURVIVAL_RECEIPT: 'A receipt bound to this exact approval is required.',
      };
      if (error instanceof Error && messages[error.message])
        throw new DomainError(error.message, messages[error.message]!, 409);
      throw error;
    }
    const next: CaseRecord = {
      ...old,
      ownerId: request.ownerId,
      version: old.version + 1,
      updatedAt: request.updatedAt,
      data: {
        ...old.data,
        claimControl: {
          originalWorkerId: context['originalWorkerId'],
          holderId: request.ownerId,
          capacity: request.data['capacity'],
          requestId: request.id,
          approvalReceiptId: approval.id,
          holderVersion: Number(context['holderVersion']) + 1,
          caseSpecificAccess: true,
        },
        history: [
          ...(Array.isArray(old.data['history']) ? old.data['history'] : []),
          {
            version: old.version + 1,
            action: 'claim_survival_control',
            at: request.updatedAt,
            actorId: actor.id,
            requestId: request.id,
            approvalReceiptId: approval.id,
          },
        ],
      },
    };
    // A separate receipt covers this same claim's new version, within the approval transaction.
    await this.store.save(
      tx,
      actor,
      next,
      'claim_survival_control',
      randomUUID(),
      digest({ requestId: request.id, approvalReceiptId: approval.id, claimId }),
    );
  }
}
