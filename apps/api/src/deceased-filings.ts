import { randomUUID } from 'node:crypto';
import { IdSchema, type Actor, type CaseRecord, type Receipt } from '@cornerstone/contracts';
import { DomainError, parseFields, requireCondition, workflow } from '@cornerstone/domain';
import { digest } from '@cornerstone/security';
import { Store, type Transaction } from '@cornerstone/store';

/** Personal synthetic standing, followed by one new draft with separate injury evidence. */
export class DeceasedFilingService {
  constructor(private readonly store: Store) {}

  async checked<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      const messages: Record<string, string> = {
        DECEASED_FILING_SCOPE:
          'Assigned, unconflicted review of this packet and distinct synthetic worker and applicant identities is required.',
        DECEASED_FILING_REVIEW:
          'The reviewed worker or capacity changed. Request corrections and begin a fresh review.',
        DECEASED_FILING_RECEIPT:
          'This operation requires receipts bound to the exact standing review and new claim.',
        DECEASED_FILING_CONTESTED:
          'Another reviewed standing packet names this worker. Resolve the conflicting packet through assigned review before approval; no standing was granted.',
        DECEASED_WORKER_ALREADY_RECORDED:
          'A claim or approved filing already exists for this worker. Continue the existing case through its proper review route; no additional claim was created.',
        DECEASED_FILING_PERSONAL:
          'Only the approved applicant with current access may personally open this claim.',
        DECEASED_CLAIM_ALREADY_OPENED:
          'This standing decision already opened its one claim. Open the recorded claim instead.',
      };
      if (error instanceof Error && messages[error.message])
        throw new DomainError(error.message, messages[error.message]!, 409);
      throw error;
    }
  }

  async prepare(
    tx: Transaction,
    actor: Actor,
    record: CaseRecord,
    action: string,
    data: Record<string, unknown>,
  ) {
    return this.checked(async () => {
      if (
        workflow(record.kind).actions.find((candidate) => candidate.key === action)?.authority ===
        'claim'
      ) {
        const query =
          record.kind === 'deceased_filing'
            ? {
                sql: 'SELECT simulation_deceased_review_allowed($1,$2,$3) AS allowed',
                values: [record.id, IdSchema.parse(data['workerId']), data['capacity']],
              }
            : {
                sql: 'SELECT simulation_deceased_claim_review_allowed($1) AS allowed',
                values: [record.id],
              };
        const allowed = (await tx.query(query.sql, query.values)).rows[0]?.allowed;
        requireCondition(
          allowed === true,
          'DECEASED_FILING_SCOPE',
          'Every staff decision requires a currently assigned, independent Labor reviewer who is neither the worker nor a holder or applicant for this claim.',
        );
      }
      if (record.kind === 'claim') return data;
      if (['submit', 'revise_request', 'save_draft', 'open_claim'].includes(action))
        requireCondition(
          actor.id === record.ownerId,
          'DECEASED_FILING_PERSONAL',
          'The proposed successor or estate representative must act personally.',
        );
      if (action === 'submit' || action === 'revise_request') {
        requireCondition(
          IdSchema.parse(data['workerId']) !== record.ownerId,
          'DECEASED_FILING_PERSONAL',
          'Use the distinct deceased worker’s synthetic reference, never your own identity.',
        );
        for (const key of ['reviewedFiling', 'approvedStanding', 'openedClaimId', 'openedStanding'])
          delete data[key];
      }
      if (action === 'begin_review') {
        const workerId = IdSchema.parse(data['workerId']);
        data['reviewedFiling'] = {
          workerId,
          applicantId: record.ownerId,
          capacity: data['capacity'],
          reviewVersion: record.version + 1,
        };
      }
      if (action === 'approve') {
        const reviewed = data['reviewedFiling'] as Record<string, unknown> | undefined;
        requireCondition(
          reviewed &&
            reviewed['workerId'] === data['workerId'] &&
            reviewed['applicantId'] === record.ownerId &&
            reviewed['capacity'] === data['capacity'] &&
            Number.isInteger(reviewed['reviewVersion']),
          'DECEASED_FILING_REVIEW',
          'Begin assigned review of this exact worker, applicant and capacity before approval.',
        );
        data['approvedStanding'] = { ...reviewed };
      }
      if (action === 'open_claim') {
        const standing = (
          await tx.query('SELECT * FROM simulation_deceased_open_context($1)', [record.id])
        ).rows[0];
        requireCondition(
          standing &&
            standing.worker_id === data['workerId'] &&
            standing.applicant_id === actor.id &&
            standing.capacity === data['capacity'],
          'DECEASED_FILING_PERSONAL',
          'Current personal standing must match the approved worker and capacity.',
        );
        const event = await this.store.get(tx, IdSchema.parse(data['eventId']));
        requireCondition(
          event && event.kind === 'event_petition' && event.state === 'certified',
          'RELATED_RECORD',
          'Choose an accessible certified synthetic event. Research entries alone cannot establish eligibility.',
        );
        data['openedClaimId'] = randomUUID();
        data['openedStanding'] = {
          workerId: standing.worker_id,
          capacity: standing.capacity,
          approvalReceiptId: standing.approval_receipt_id,
        };
      }
      return data;
    });
  }

  async finish(tx: Transaction, actor: Actor, record: CaseRecord, receipt: Receipt) {
    return this.checked(async () => {
      if (receipt.action === 'begin_review')
        await tx.query('SELECT simulation_record_deceased_review($1,$2,$3,$4)', [
          record.id,
          record.data['workerId'],
          record.data['capacity'],
          receipt.id,
        ]);
      if (receipt.action === 'approve')
        await tx.query('SELECT simulation_approve_deceased_filing($1,$2,$3)', [
          record.id,
          (record.data['reviewedFiling'] as Record<string, unknown>)['reviewVersion'],
          receipt.id,
        ]);
      if (receipt.action !== 'open_claim') return;
      const standing = record.data['openedStanding'] as Record<string, unknown>;
      const input = Object.fromEntries(
        workflow('claim')
          .createFields.filter((field) => field.key !== 'evidenceIds')
          .map((field) => [field.key, record.data[field.key]]),
      );
      const claim: CaseRecord = {
        id: IdSchema.parse(record.data['openedClaimId']),
        kind: 'claim',
        realm: 'simulation',
        state: 'draft',
        version: 1,
        ownerId: actor.id,
        institutionId: actor.institutionId,
        jurisdiction: record.jurisdiction,
        policyVersion: record.policyVersion,
        title: ('Individual eligibility: ' + record.title).slice(0, 160),
        createdAt: record.updatedAt,
        updatedAt: record.updatedAt,
        data: {
          ...parseFields(workflow('claim').createFields, input),
          deceasedFilingId: record.id,
          claimControl: {
            originalWorkerId: standing['workerId'],
            holderId: actor.id,
            capacity: standing['capacity'],
            requestId: record.id,
            approvalReceiptId: standing['approvalReceiptId'],
            holderVersion: 1,
            caseSpecificAccess: true,
          },
        },
      };
      const creation = await this.store.save(
        tx,
        actor,
        claim,
        'create',
        randomUUID(),
        digest({ requestId: record.id, openingReceiptId: receipt.id, claimId: claim.id }),
        true,
      );
      await tx.query('SELECT simulation_register_deceased_claim($1,$2,$3,$4)', [
        record.id,
        claim.id,
        receipt.id,
        creation.id,
      ]);
    });
  }
}
