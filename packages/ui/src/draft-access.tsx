'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  DraftAccessViewSchema,
  type DraftAccessView,
  type CaseRecord,
  type Receipt,
} from '@cornerstone/contracts';
type Result = { record: CaseRecord; receipt: Receipt };
export function DraftAccessPanel({
  record,
  api,
  onChanged,
}: {
  record: CaseRecord;
  api: (path: string, body?: unknown) => Promise<any>;
  onChanged: (result: Result) => Promise<void>;
}) {
  const [grants, setGrants] = useState<DraftAccessView[]>([]),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const retry = useRef<{ command: string; key: string } | null>(null);
  async function refresh() {
    const r = await api('access?recordId=' + record.id);
    setGrants(DraftAccessViewSchema.array().parse(r.grants));
  }
  useEffect(() => {
    setGrants([]);
    void refresh().catch(() => setError('Access details are unavailable.'));
  }, [record.id, record.version]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form);
    const expires = String(data.get('expires'));
    const input = {
      recordId: record.id,
      expectedVersion: record.version,
      subjectId: String(data.get('subjectId')),
      expiresAt: expires + 'T00:00:00Z',
      allowDraftEdits: data.get('allowDraftEdits') === 'on',
      consent: data.get('consent') === 'on',
    };
    await run('access/grant', input, () => form.reset());
  }
  async function run(path: string, input: unknown, done?: () => void) {
    setPending(true);
    setError('');
    try {
      const command = JSON.stringify({ path, input });
      if (retry.current?.command !== command) retry.current = { command, key: crypto.randomUUID() };
      const result = await api(path, { ...(input as object), idempotencyKey: retry.current.key });
      retry.current = null;
      await onChanged(result);
      await refresh();
      done?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The access change could not be saved.');
    } finally {
      setPending(false);
    }
  }
  return (
    <details className="action-panel" style={{ marginTop: 25 }}>
      <summary>Help with this record</summary>
      <h2>Give someone scoped access</h2>
      <p className="muted">
        Use the workspace ID supplied by the person you want to help you. They can read this record,
        all saved versions and its receipts. Already downloaded copies cannot be recalled.
      </p>
      <p className="hint">
        Draft access grants no voting, payment, submission or official decision-making authority.
      </p>
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      <form className="form-stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="access-subject">Recipient workspace ID</label>
          <input id="access-subject" name="subjectId" required pattern="[0-9a-fA-F-]{36}" />
        </div>
        <div className="field">
          <label htmlFor="access-expires">Access expiration date</label>
          <input
            id="access-expires"
            name="expires"
            type="date"
            required
            min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
            max={new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)}
          />
          <span className="hint">Access ends at 00:00 UTC on this date, within ninety days.</span>
        </div>
        {record.state === 'draft' && (
          <div className="check-field">
            <input id="access-edit" name="allowDraftEdits" type="checkbox" />
            <label htmlFor="access-edit">Allow draft edits and synthetic attachments</label>
          </div>
        )}
        <div className="check-field">
          <input id="access-consent" name="consent" type="checkbox" required />
          <label htmlFor="access-consent">
            I authorize this person to read this record, its versions and receipts.
          </label>
        </div>
        <button className="button" disabled={pending}>
          Give draft access
        </button>
      </form>
      <h3>Access grants</h3>
      {grants.length ? (
        <ul className="activity-list">
          {grants.map((g) => (
            <li key={g.id} className="activity-card">
              <p className="workspace-id">{g.subjectId}</p>
              <p>
                {g.revokedAt
                  ? 'Revoked'
                  : new Date(g.expiresAt) <= new Date()
                    ? 'Expired'
                    : 'Active'}{' '}
                · {g.permissions.includes('save_draft') ? 'Read and draft edits' : 'Read only'}
              </p>
              <p className="hint">Expires {new Date(g.expiresAt).toLocaleString()}</p>
              {!g.revokedAt && (
                <button
                  className="quiet-button"
                  disabled={pending}
                  onClick={() =>
                    void run('access/revoke', {
                      recordId: record.id,
                      expectedVersion: record.version,
                      grantId: g.id,
                    })
                  }
                >
                  Revoke access
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No draft-access grants.</p>
      )}
    </details>
  );
}
