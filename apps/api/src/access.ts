import { randomUUID } from 'node:crypto';
import {
  GrantDraftAccessSchema,
  RevokeDraftAccessSchema,
  DraftAccessViewSchema,
  draftAccessKinds,
  type Actor,
  type CaseRecord,
  type Mode,
  type Realm,
} from '@cornerstone/contracts';
import { DomainError, requireCondition } from '@cornerstone/domain';
import { digest } from '@cornerstone/security';
import { Store, type Transaction } from '@cornerstone/store';

export class DraftAccessService {
  constructor(
    readonly store: Store,
    readonly mode: Mode,
    readonly realm: Realm,
  ) {}
  private writable(actor: Actor) {
    requireCondition(
      this.mode === 'simulation' && this.realm === 'simulation' && actor.realm === this.realm,
      'PROTECTED_INTAKE_DISABLED',
      'Draft access is available only in isolated synthetic development.',
    );
  }
  private recentSignIn(actor: Actor) {
    const age = Date.now() - new Date(actor.authenticationTime).getTime();
    requireCondition(
      Number.isFinite(age) && age >= -60000 && age <= 600000,
      'RECENT_SIGN_IN_REQUIRED',
      'Sign out and sign in again before changing another person’s access.',
    );
  }
  private async owned(tx: Transaction, actor: Actor, id: string, lock = false) {
    const r = await this.store.get(tx, id, lock);
    if (!r || r.ownerId !== actor.id || !(draftAccessKinds as readonly string[]).includes(r.kind))
      throw new DomainError(
        'NOT_FOUND',
        'An accessible preparation record you own is required.',
        404,
      );
    return r;
  }
  async list(actor: Actor, id: string) {
    return this.store.transaction(actor, async (tx) => {
      await this.owned(tx, actor, id);
      const rows = await tx.query(
        'SELECT id,subject_id,permissions,expires_at,revoked_at FROM grants WHERE record_id=$1 ORDER BY created_at DESC LIMIT 100',
        [id],
      );
      return rows.rows.map((g) =>
        DraftAccessViewSchema.parse({
          id: g.id,
          subjectId: g.subject_id,
          permissions: g.permissions,
          expiresAt: g.expires_at.toISOString(),
          revokedAt: g.revoked_at?.toISOString() ?? null,
        }),
      );
    });
  }
  private async save(
    tx: Transaction,
    actor: Actor,
    r: CaseRecord,
    input: { idempotencyKey: string },
    request: string,
    action: string,
    detail: Record<string, unknown>,
  ) {
    const now = new Date().toISOString(),
      history = Array.isArray(r.data['history']) ? r.data['history'] : [];
    const next = {
      ...r,
      version: r.version + 1,
      updatedAt: now,
      data: {
        ...r.data,
        history: [
          ...history,
          { version: r.version + 1, action, at: now, actorId: actor.id, ...detail },
        ],
      },
    };
    const receipt = await this.store.save(tx, actor, next, action, input.idempotencyKey, request);
    return { record: next, receipt };
  }
  async grant(actor: Actor, raw: unknown) {
    this.writable(actor);
    const input = GrantDraftAccessSchema.parse(raw),
      request = digest({ action: 'grant_draft_access', ...input });
    return this.store.transaction(actor, async (tx) => {
      const previous = await this.store.existingReceipt(tx, actor, input.idempotencyKey, request);
      if (previous) {
        await this.owned(tx, actor, previous.recordId);
        const record = await this.store.getVersion(tx, previous.recordId, previous.version);
        if (!record)
          throw new DomainError('NOT_FOUND', 'The historical access record is unavailable.', 404);
        return { receipt: previous, record };
      }
      this.recentSignIn(actor);
      const r = await this.owned(tx, actor, input.recordId, true);
      requireCondition(
        r.version === input.expectedVersion,
        'STALE_VERSION',
        'This record changed. Reload before submitting.',
      );
      requireCondition(
        !input.allowDraftEdits || r.state === 'draft',
        'DRAFT_ONLY',
        'Editing access can be granted only while the record is a draft.',
      );
      const expiry = new Date(input.expiresAt).getTime();
      requireCondition(
        expiry > Date.now() && expiry <= Date.now() + 90 * 86400000,
        'ACCESS_EXPIRY',
        'Access must expire within ninety days.',
      );
      const target = await tx.query('SELECT simulation_delegate_ok($1,$2) allowed', [
        r.id,
        input.subjectId,
      ]);
      requireCondition(
        target.rows[0]?.allowed === true,
        'RECIPIENT_UNAVAILABLE',
        'Use a different eligible, unconflicted synthetic participant workspace ID.',
      );
      const active = await tx.query(
        'SELECT subject_id FROM grants WHERE record_id=$1 AND revoked_at IS NULL AND expires_at>now()',
        [r.id],
      );
      requireCondition(
        active.rowCount !== null && active.rowCount < 20,
        'ACCESS_LIMIT',
        'At most twenty active draft-access grants are allowed.',
      );
      requireCondition(
        !active.rows.some((g) => g.subject_id === input.subjectId),
        'ACCESS_EXISTS',
        'This person already has access. Revoke that grant before changing its scope.',
      );
      const id = randomUUID(),
        permissions = ['read', ...(input.allowDraftEdits ? ['save_draft', 'attach_evidence'] : [])];
      await tx.query(
        'INSERT INTO grants(id,realm,record_id,owner_id,subject_id,permissions,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [id, r.realm, r.id, actor.id, input.subjectId, permissions, input.expiresAt],
      );
      return this.save(tx, actor, r, input, request, 'grant_draft_access', {
        grantId: id,
        subjectId: input.subjectId,
        permissions,
        expiresAt: input.expiresAt,
      });
    });
  }
  async revoke(actor: Actor, raw: unknown) {
    this.writable(actor);
    const input = RevokeDraftAccessSchema.parse(raw),
      request = digest({ action: 'revoke_draft_access', ...input });
    return this.store.transaction(actor, async (tx) => {
      const previous = await this.store.existingReceipt(tx, actor, input.idempotencyKey, request);
      if (previous) {
        await this.owned(tx, actor, previous.recordId);
        const record = await this.store.getVersion(tx, previous.recordId, previous.version);
        if (!record)
          throw new DomainError('NOT_FOUND', 'The historical access record is unavailable.', 404);
        return { receipt: previous, record };
      }
      this.recentSignIn(actor);
      const r = await this.owned(tx, actor, input.recordId, true);
      requireCondition(
        r.version === input.expectedVersion,
        'STALE_VERSION',
        'This record changed. Reload before submitting.',
      );
      const grant = await tx.query(
        'SELECT id FROM grants WHERE id=$1 AND record_id=$2 AND owner_id=$3 AND revoked_at IS NULL FOR UPDATE',
        [input.grantId, r.id, actor.id],
      );
      requireCondition(
        grant.rowCount === 1,
        'ACCESS_UNAVAILABLE',
        'An active grant on this record is required.',
      );
      await tx.query('UPDATE grants SET revoked_at=now() WHERE id=$1', [input.grantId]);
      return this.save(tx, actor, r, input, request, 'revoke_draft_access', {
        grantId: input.grantId,
      });
    });
  }
}
