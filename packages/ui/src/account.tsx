'use client';
import { useEffect, useRef, useState } from 'react';
import type {
  Actor,
  SessionContext,
  SessionRevocationResult,
  WorkspaceSessionPage,
} from '@cornerstone/contracts';
import {
  prepareSessionRevocation,
  sessionRevocationRequest,
  sessionRevocationResult,
  verifiedSessionPage,
  SessionContextChangedError,
  type SessionRevocationAttempt,
} from './session-recovery.js';
import { actionFailure } from './action-recovery.js';

export function AccountPanel({
  actor,
  api,
  isCurrent,
  onContextChanged,
}: {
  actor: Pick<Actor, 'id' | 'realm'>;
  api: (path: string, body?: unknown) => Promise<any>;
  isCurrent: () => boolean;
  onContextChanged: () => void;
}) {
  const [inventory, setInventory] = useState<WorkspaceSessionPage | null>(null);
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [pending, setPending] = useState(false),
    [loading, setLoading] = useState(false),
    [attempt, setAttempt] = useState<SessionRevocationAttempt | null>(null),
    [confirmed, setConfirmed] = useState<SessionRevocationResult | null>(null);
  const lifetime = useRef(0),
    generation = useRef(0),
    active = useRef(false),
    context = useRef<SessionContext | null>(null),
    frozen = useRef<SessionRevocationAttempt | null>(null);
  async function refresh() {
    const current = lifetime.current,
      read = ++generation.current;
    const valid = () => current === lifetime.current && read === generation.current && isCurrent();
    setInventory(null);
    setLoading(true);
    setError('');
    try {
      const result = verifiedSessionPage(
        await api('auth/sessions'),
        actor,
        context.current ?? undefined,
      );
      if (valid()) {
        context.current = result.context;
        setInventory(result);
      }
    } catch (e) {
      if (valid()) {
        setError('Session details are unavailable. Refresh sessions to try again.');
        if (e instanceof SessionContextChangedError) onContextChanged();
      }
    } finally {
      if (valid()) setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    return () => {
      lifetime.current++;
      generation.current++;
      frozen.current = null;
    };
  }, [actor.id, actor.realm]);
  async function send(intent: SessionRevocationAttempt, retry: boolean) {
    if (active.current || !isCurrent()) return;
    active.current = true;
    const current = lifetime.current;
    const valid = () => current === lifetime.current && isCurrent();
    generation.current++;
    setInventory(null);
    setPending(true);
    setError('');
    setMessage('');
    setConfirmed(null);
    let result: SessionRevocationResult | null = null;
    try {
      const raw = await api('auth/sessions/revoke-selected', sessionRevocationRequest(intent));
      if (!valid()) return;
      result = sessionRevocationResult(raw, intent);
    } catch (e) {
      if (!valid()) return;
      if (actionFailure(e, retry) === 'rejected') {
        frozen.current = null;
        setAttempt(null);
        setError(e instanceof Error ? e.message : 'Session revocation was rejected.');
      } else
        setError(
          'The revocation outcome is unknown. Retry the exact selected sessions to recover their saved events. New sessions will not be added to this request.',
        );
    } finally {
      if (valid()) {
        active.current = false;
        setPending(false);
      }
    }
    if (!result || !valid()) return;
    frozen.current = null;
    setAttempt(null);
    setConfirmed(result);
    // A failed current inventory read does not undo the correlated historical events.
    await refresh();
  }
  async function revoke(ids: string[]) {
    if (active.current || frozen.current || !inventory || !isCurrent()) return;
    try {
      const intent = prepareSessionRevocation(ids, inventory, actor);
      frozen.current = intent;
      setAttempt(intent);
      await send(intent, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Select current sessions before continuing.');
    }
  }
  const others = inventory?.sessions.filter((session) => !session.current) ?? [];
  return (
    <section className="account-panel">
      <p className="eyebrow">Your workspace</p>
      <h1>Account & access.</h1>
      <p className="muted">
        Use Sign out to end this session. You can also end your other active workspace sessions
        here.
      </p>
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="receipt" role="status">
          {message}
        </p>
      )}
      {confirmed && (
        <div className="receipt session-revocation-confirmed" role="status">
          <p>
            Revocation confirmed for {confirmed.events.length} selected{' '}
            {confirmed.events.length === 1 ? 'session' : 'sessions'}.
          </p>
          <p className="hint">
            These saved events confirm the selected sessions were signed out. A recovered event may
            describe an earlier request; sessions created later are unaffected.
          </p>
        </div>
      )}
      {attempt && (
        <div className="action-panel session-revocation-recovery" aria-busy={pending}>
          <h2>Selected session request</h2>
          <p>{sessionRevocationRequest(attempt).sessionIds.length} other session(s) selected.</p>
          <p className="hint">
            The exact selection stays only in this tab. Leaving this view loses the retry selection,
            not any saved revocation. No newer session is included when retrying.
          </p>
          {!pending && (
            <>
              <button className="button" onClick={() => void send(attempt, true)}>
                Retry exact session revocation
              </button>
              <button
                className="quiet-button"
                onClick={() => {
                  frozen.current = null;
                  setAttempt(null);
                  void refresh();
                }}
              >
                Discard retry selection
              </button>
              <p className="hint">Discarding the selection does not undo a revocation.</p>
            </>
          )}
        </div>
      )}
      <div className="action-panel">
        <h2>Your workspace ID</h2>
        <p className="workspace-id">{actor.id}</p>
        <p className="hint">
          This identifies your synthetic account. It is not a verified legal identity or an
          eligibility finding.
        </p>
        <button
          className="quiet-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(actor.id);
              setMessage('Workspace ID copied.');
            } catch {
              setError('Select and copy the workspace ID above.');
            }
          }}
        >
          Copy workspace ID
        </button>
      </div>
      <div className="workspace-heading">
        <h2>Active workspace sessions</h2>
        <button
          className="button button-secondary"
          disabled={pending || loading || !!attempt || others.length === 0}
          onClick={() => void revoke(others.map((session) => session.id))}
        >
          Sign out listed other sessions
        </button>
      </div>
      <p className="hint">
        This bounded inventory shows up to 100 active sessions. A revocation targets only the
        selected sessions shown here. A new sign-in is not included automatically.
      </p>
      <button
        className="quiet-button"
        disabled={pending || loading || !!attempt}
        onClick={() => void refresh()}
      >
        Refresh sessions
      </button>
      {loading && <p role="status">Checking current sessions…</p>}
      <ol className="activity-list">
        {inventory?.sessions.map((s) => (
          <li className="activity-card" key={s.id} data-session-id={s.id}>
            <h3>{s.current ? 'Current session' : 'Other session'}</h3>
            <p>Signed in {new Date(s.authenticatedAt).toLocaleString()}</p>
            <p className="hint">Expires {new Date(s.expiresAt).toLocaleString()}</p>
            {!s.current && (
              <button
                className="quiet-button"
                disabled={pending || loading || !!attempt}
                onClick={() => void revoke([s.id])}
              >
                Sign out this session
              </button>
            )}
          </li>
        ))}
      </ol>
      <p className="hint">
        Session times do not verify a device or location. Protected identity, device authorization
        and recovery remain unavailable.
      </p>
    </section>
  );
}
