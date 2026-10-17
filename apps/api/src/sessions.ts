import {
  ActorSchema,
  RevokeSelectedSessionsSchema,
  SessionRevocationResultSchema,
  WorkspaceSessionPageSchema,
  type Actor,
} from '@cornerstone/contracts';
import { DomainError } from '@cornerstone/domain';
import { Store, type Transaction } from '@cornerstone/store';

export class SessionService {
  constructor(readonly store: Store) {}

  private async assertCaller(tx: Transaction, actor: Actor, token: string) {
    const lookup = await tx.query('SELECT actor FROM auth_lookup($1)', [token]);
    if (!lookup.rows[0])
      throw new DomainError('SESSION_EXPIRED', 'Your session expired. Sign in again.', 401);
    const current = ActorSchema.parse(lookup.rows[0].actor);
    if (current.id !== actor.id || current.realm !== actor.realm)
      throw new DomainError('SESSION_SCOPE', 'This session belongs to another workspace.', 403);
  }

  private async inventory(tx: Transaction, actor: Actor, token: string) {
    await this.assertCaller(tx, actor, token);
    const rows = await tx.query('SELECT * FROM auth_sessions($1)', [token]);
    const current = rows.rows.find((session) => session.current_session);
    if (!current) {
      await this.assertCaller(tx, actor, token);
      // The existing inventory function returns at most 100 sessions. Do not guess
      // the caller when a very old session is outside that bounded inventory.
      throw new DomainError(
        'SESSION_INVENTORY_UNAVAILABLE',
        'The current session is outside the bounded inventory. Sign in again to manage sessions.',
        503,
      );
    }
    return WorkspaceSessionPageSchema.parse({
      context: { actorId: actor.id, realm: actor.realm, currentSessionId: current.id },
      sessions: rows.rows.map((session) => ({
        id: session.id,
        authenticatedAt: session.authenticated_at.toISOString(),
        expiresAt: session.expires_at.toISOString(),
        current: session.current_session,
      })),
    });
  }

  async list(actor: Actor, token: string) {
    return this.store.transaction(actor, async (tx) => {
      const page = await this.inventory(tx, actor, token);
      await this.assertCaller(tx, actor, token);
      return page;
    });
  }

  async revoke(actor: Actor, token: string, raw: unknown) {
    const input = RevokeSelectedSessionsSchema.parse(raw);
    return this.store.transaction(actor, async (tx) => {
      const page = await this.inventory(tx, actor, token);
      if (input.currentSessionId !== page.context.currentSessionId)
        throw new DomainError(
          'SESSION_CONTEXT_CHANGED',
          'The initiating session changed. Refresh your workspace before another request.',
          409,
        );
      // A fixed locking order prevents overlapping batches from locking targets in
      // opposite orders. Existing revocation and its unique event are one SQL action.
      for (const id of [...input.sessionIds].sort())
        await tx.query('SELECT auth_revoke_session($1,$2)', [token, id]);
      const events = await tx.query(
        `SELECT id,session_id,created_at FROM session_events
         WHERE actor_id=$1 AND session_id=ANY($2::uuid[]) AND action='revoked'
         ORDER BY session_id`,
        [actor.id, input.sessionIds],
      );
      await this.assertCaller(tx, actor, token);
      if (events.rowCount !== input.sessionIds.length)
        throw new DomainError(
          'SESSION_NOT_FOUND',
          'One or more selected sessions are unavailable. No new revocations were committed.',
          404,
        );
      return SessionRevocationResultSchema.parse({
        context: page.context,
        sessionIds: input.sessionIds,
        events: events.rows.map((event) => ({
          id: event.id,
          sessionId: event.session_id,
          revokedAt: event.created_at.toISOString(),
        })),
      });
    });
  }
}
