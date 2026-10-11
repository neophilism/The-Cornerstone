'use client';
import { useEffect, useState } from 'react';
import { WorkspaceSessionSchema, type WorkspaceSession } from '@cornerstone/contracts';

export function AccountPanel({
  actorId,
  api,
}: {
  actorId: string;
  api: (path: string, body?: unknown) => Promise<any>;
}) {
  const [sessions, setSessions] = useState<WorkspaceSession[]>([]);
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [pending, setPending] = useState(false);
  async function refresh() {
    const result = await api('auth/sessions');
    setSessions(WorkspaceSessionSchema.array().parse(result.sessions));
  }
  useEffect(() => {
    void refresh().catch(() => setError('Session details are unavailable.'));
  }, [actorId]);
  async function revoke(id?: string) {
    setPending(true);
    setError('');
    setMessage('');
    try {
      await api(id ? 'auth/sessions/revoke' : 'auth/sessions/revoke-others', id ? { id } : {});
      await refresh();
      setMessage(
        id ? 'That session has been signed out.' : 'Other active sessions have been signed out.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Session revocation is unavailable.');
    } finally {
      setPending(false);
    }
  }
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
      <div className="action-panel">
        <h2>Your workspace ID</h2>
        <p className="workspace-id">{actorId}</p>
        <p className="hint">
          This identifies your synthetic account. It is not a verified legal identity or an
          eligibility finding.
        </p>
        <button
          className="quiet-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(actorId);
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
          disabled={pending || sessions.filter((s) => !s.current).length === 0}
          onClick={() => void revoke()}
        >
          Sign out other sessions
        </button>
      </div>
      <ol className="activity-list">
        {sessions.map((s) => (
          <li className="activity-card" key={s.id}>
            <h3>{s.current ? 'Current session' : 'Other session'}</h3>
            <p>Signed in {new Date(s.authenticatedAt).toLocaleString()}</p>
            <p className="hint">Expires {new Date(s.expiresAt).toLocaleString()}</p>
            {!s.current && (
              <button className="quiet-button" disabled={pending} onClick={() => void revoke(s.id)}>
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
