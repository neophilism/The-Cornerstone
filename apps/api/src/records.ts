import { RecordQuerySchema, RecordCapabilitiesSchema, type Actor } from '@cornerstone/contracts';
import {
  DomainError,
  workflow,
  evidencePreparationRoles,
  evidencePreparationStanding,
  financialAdjudicationActions,
  independentFinancialReviewer,
} from '@cornerstone/domain';
import { canRead, canAct } from '@cornerstone/security';
import { Store } from '@cornerstone/store';

export class RecordReader {
  constructor(readonly store: Store) {}
  async read(actor: Actor, input: unknown = {}) {
    const query = RecordQuerySchema.parse(input);
    const page =
      'recordId' in query
        ? {
            records: await this.store.transaction(actor, async (tx) => {
              const record = await this.store.get(tx, query.recordId);
              return record ? [record] : [];
            }),
            nextCursor: null,
          }
        : await this.store.listPage(actor, query);
    const grants = await this.store.transaction(actor, (tx) =>
      this.store.scopes(
        tx,
        page.records.map((r) => r.id),
      ),
    );
    const now = new Date().toISOString();
    const records = page.records.filter((r) => canRead(actor, r, grants, now));
    if ('recordId' in query && !records.length)
      throw new DomainError('NOT_FOUND', 'Record not found or no longer accessible.', 404);
    const capabilities = records.map((r) => {
      const wf = workflow(r.kind);
      const actions = wf.actions
        .filter(
          (action) =>
            action.from.includes(r.state) &&
            (r.kind !== 'financial_schedule' ||
              !financialAdjudicationActions.includes(action.key) ||
              independentFinancialReviewer(actor, r)) &&
            canAct(actor, r, action.roles, grants, action.key, now),
        )
        .map((action) => action.key);
      if (r.state === 'draft' && canAct(actor, r, wf.createRoles, grants, 'save_draft', now))
        actions.push('save_draft');
      if (
        evidencePreparationRoles(r).length > 0 &&
        evidencePreparationStanding(actor, r) &&
        canAct(actor, r, evidencePreparationRoles(r), grants, 'attach_evidence', now)
      )
        actions.push('attach_evidence');
      return RecordCapabilitiesSchema.parse({ recordId: r.id, version: r.version, actions });
    });
    return {
      context: { actorId: actor.id, realm: actor.realm },
      records,
      capabilities,
      nextCursor: page.nextCursor,
    };
  }
}
