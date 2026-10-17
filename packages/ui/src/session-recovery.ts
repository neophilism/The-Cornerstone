import {
  RevokeSelectedSessionsSchema,
  SessionRevocationResultSchema,
  WorkspaceSessionPageSchema,
  type Actor,
  type SessionContext,
  type WorkspaceSessionPage,
} from '@cornerstone/contracts';

export type SessionRevocationAttempt = Readonly<{ wire: string; context: SessionContext }>;

export class SessionContextChangedError extends Error {}

export function verifiedSessionPage(
  raw: unknown,
  actor: Pick<Actor, 'id' | 'realm'>,
  expected?: SessionContext,
) {
  const page = WorkspaceSessionPageSchema.parse(raw);
  if (
    page.context.actorId !== actor.id ||
    page.context.realm !== actor.realm ||
    (expected && page.context.currentSessionId !== expected.currentSessionId)
  )
    throw new SessionContextChangedError(
      'The session inventory belongs to another workspace or sign-in.',
    );
  return page;
}

export function prepareSessionRevocation(
  ids: string[],
  rawPage: WorkspaceSessionPage,
  actor: Pick<Actor, 'id' | 'realm'>,
): SessionRevocationAttempt {
  const page = verifiedSessionPage(rawPage, actor);
  const request = RevokeSelectedSessionsSchema.parse({
    currentSessionId: page.context.currentSessionId,
    sessionIds: [...ids].sort(),
  });
  if (
    request.sessionIds.some(
      (id) => !page.sessions.some((session) => session.id === id && !session.current),
    )
  )
    throw Error('Select other sessions from the current inventory.');
  return Object.freeze({
    wire: JSON.stringify(request),
    context: Object.freeze({ ...page.context }),
  });
}

export function sessionRevocationRequest(attempt: SessionRevocationAttempt) {
  return RevokeSelectedSessionsSchema.parse(JSON.parse(attempt.wire));
}

/** Immutable events establish prior revocation, not the current active-session inventory. */
export function sessionRevocationResult(raw: unknown, attempt: SessionRevocationAttempt) {
  const result = SessionRevocationResultSchema.parse(raw),
    request = sessionRevocationRequest(attempt);
  if (
    result.context.actorId !== attempt.context.actorId ||
    result.context.realm !== attempt.context.realm ||
    result.context.currentSessionId !== request.currentSessionId ||
    JSON.stringify(result.sessionIds) !== JSON.stringify(request.sessionIds)
  )
    throw Error('The response did not confirm the exact selected sessions and workspace.');
  return result;
}
