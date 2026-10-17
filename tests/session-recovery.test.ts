import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { WorkspaceSessionPage } from '@cornerstone/contracts';
import {
  prepareSessionRevocation,
  sessionRevocationRequest,
  sessionRevocationResult,
  verifiedSessionPage,
} from '../packages/ui/src/session-recovery.js';
import { actionFailure } from '../packages/ui/src/action-recovery.js';
import { WorkspaceRequestError } from '../packages/ui/src/draft-review.js';

function fixture() {
  const actor = { id: randomUUID(), realm: 'simulation' as const };
  const current = randomUUID(),
    other = randomUUID(),
    another = randomUUID();
  const page: WorkspaceSessionPage = {
    context: { actorId: actor.id, realm: actor.realm, currentSessionId: current },
    sessions: [current, other, another].map((id) => ({
      id,
      authenticatedAt: '2026-10-17T12:00:00Z',
      expiresAt: '2026-10-17T20:00:00Z',
      current: id === current,
    })),
  };
  return { actor, current, other, another, page };
}
function result(page: WorkspaceSessionPage, ids: string[]) {
  return {
    context: page.context,
    sessionIds: [...ids].sort(),
    events: ids.map((sessionId) => ({
      id: randomUUID(),
      sessionId,
      revokedAt: '2026-10-17T12:01:00Z',
    })),
  };
}
describe('scoped session inventory and exact revocation recovery', () => {
  it('accepts the current actor, realm and uniquely identified current session', () => {
    const { actor, page } = fixture();
    expect(verifiedSessionPage(page, actor)).toEqual(page);
  });
  it('rejects another actor or realm before showing their session inventory', () => {
    const { actor, page } = fixture();
    expect(() => verifiedSessionPage(page, { ...actor, id: randomUUID() })).toThrow();
    expect(() => verifiedSessionPage(page, { ...actor, realm: 'program' })).toThrow();
    expect(() =>
      verifiedSessionPage(page, actor, {
        ...page.context,
        currentSessionId: randomUUID(),
      }),
    ).toThrow();
  });
  it('rejects duplicated, missing and substituted current-session flags and secret fields', () => {
    const { actor, page, other } = fixture();
    for (const raw of [
      { ...page, sessions: [...page.sessions, page.sessions[0]] },
      { ...page, sessions: page.sessions.map((session) => ({ ...session, current: false })) },
      { ...page, context: { ...page.context, currentSessionId: other } },
      { ...page, sessions: page.sessions.map((session) => ({ ...session, current: true })) },
      { ...page, sessions: [{ ...page.sessions[0], token_hash: 'forbidden' }] },
    ])
      expect(() => verifiedSessionPage(raw, actor)).toThrow();
  });
  it('freezes exact other-session targets even when a later session is added', () => {
    const { actor, page, other, another } = fixture();
    const ids = [other, another];
    const attempt = prepareSessionRevocation(ids, page, actor);
    ids.push(randomUUID());
    page.sessions.push({ ...page.sessions[0]!, id: randomUUID(), current: false });
    expect(sessionRevocationRequest(attempt).sessionIds).toEqual([other, another].sort());
    expect(Object.isFrozen(attempt)).toBe(true);
    expect(Object.isFrozen(attempt.context)).toBe(true);
    const editable = sessionRevocationRequest(attempt);
    editable.sessionIds.push(randomUUID());
    expect(sessionRevocationRequest(attempt).sessionIds).toHaveLength(2);
  });
  it('rejects current, repeated, missing and foreign targets before sending', () => {
    const { actor, page, other, current } = fixture();
    for (const ids of [[], [current], [other, other], [randomUUID()]])
      expect(() => prepareSessionRevocation(ids, page, actor)).toThrow();
  });
  it('accepts the same historical events without treating them as current inventory', () => {
    const { actor, page, other, another } = fixture();
    const attempt = prepareSessionRevocation([other, another], page, actor);
    const historical = result(page, [other, another]);
    expect(sessionRevocationResult(historical, attempt)).toEqual(historical);
    expect(sessionRevocationResult(structuredClone(historical), attempt)).toEqual(historical);
    expect('sessions' in sessionRevocationResult(historical, attempt)).toBe(false);
  });
  it('rejects another actor, realm or initiating session in the confirmation', () => {
    const { actor, page, other } = fixture();
    const attempt = prepareSessionRevocation([other], page, actor);
    const accepted = result(page, [other]);
    for (const context of [
      { ...page.context, actorId: randomUUID() },
      { ...page.context, realm: 'program' },
      { ...page.context, currentSessionId: randomUUID() },
    ])
      expect(() => sessionRevocationResult({ ...accepted, context }, attempt)).toThrow();
  });
  it('rejects booleans, incomplete events, extra targets and substituted session references', () => {
    const { actor, page, other, another } = fixture();
    const attempt = prepareSessionRevocation([other], page, actor);
    const accepted = result(page, [other]);
    for (const raw of [
      { revoked: true },
      { revoked: false },
      { ...accepted, events: [] },
      { ...accepted, events: [accepted.events[0], accepted.events[0]] },
      { ...accepted, events: [{ ...accepted.events[0], sessionId: another }] },
      result(page, [other, another]),
      result(page, [another]),
    ])
      expect(() => sessionRevocationResult(raw, attempt)).toThrow();
  });
  it('never lets a denied retry rewrite the unknown result of the earlier request', () => {
    for (const status of [401, 403, 404, 409, 422]) {
      const denial = new WorkspaceRequestError(status, 'DENIED', 'Invented denial');
      expect(actionFailure(denial, false)).toBe('rejected');
      expect(actionFailure(denial, true)).toBe('uncertain');
    }
    expect(actionFailure(new Error('Lost response'))).toBe('uncertain');
    expect(actionFailure(new WorkspaceRequestError(503, 'UNAVAILABLE', 'Unavailable'))).toBe(
      'uncertain',
    );
  });
});
