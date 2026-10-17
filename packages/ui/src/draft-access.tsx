'use client';
import { useAccessAction } from './access-action.js';
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
  disabled,
  onBusyChange,
}: {
  record: CaseRecord;
  api: (path: string, body?: unknown) => Promise<any>;
  onChanged: (result: Result) => Promise<void>;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [grants, setGrants] = useState<DraftAccessView[]>([]),
    [error, setError] = useState('');
  const generation = useRef(0),
    formRef = useRef<HTMLFormElement>(null);
  const recovery = useAccessAction({
    record,
    api,
    disabled,
    onBusyChange,
    onChanged: async (result) => {
      formRef.current?.reset();
      await onChanged(result);
    },
  });
  const pending = disabled || recovery.busy || recovery.locked;
  useEffect(() => {
    const current = ++generation.current;
    setGrants([]);
    setError('');
    void api('access?recordId=' + record.id)
      .then((raw) => {
        if (current === generation.current)
          setGrants(DraftAccessViewSchema.array().parse(raw.grants));
      })
      .catch(() => {
        if (current === generation.current) setError('Access details are unavailable.');
      });
    return () => {
      generation.current++;
    };
  }, [record.id, record.version]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
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
    recovery.submit('access/grant', { ...input, idempotencyKey: crypto.randomUUID() });
  }
  return (
    <details className="action-panel access-panel" style={{ marginTop: 25 }}>
      <summary>Help with this record</summary>
      <h2>Give someone scoped access</h2>
      <p className="muted">
        Use the workspace ID supplied by the person you want to help you. They can read this record,
        all saved versions and its receipts. Already downloaded copies cannot be recalled.
      </p>
      <p className="hint">
        Draft access grants no voting, payment, submission or official decision-making authority.
      </p>
      {(error || recovery.error) && (
        <p className="error-panel" role="alert">
          {recovery.error || error}
        </p>
      )}
      {recovery.recovery}
      <fieldset disabled={pending} className="workflow-fieldset">
        <form ref={formRef} className="form-stack" onSubmit={submit}>
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
                      recovery.submit('access/revoke', {
                        idempotencyKey: crypto.randomUUID(),
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
      </fieldset>
    </details>
  );
}
