'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  EvidenceViewSchema,
  MAX_SYNTHETIC_EVIDENCE_BYTES,
  type EvidenceView,
  type CaseRecord,
  type Receipt,
} from '@cornerstone/contracts';
import {
  prepareEvidence,
  evidenceRequest,
  evidenceResult,
  type EvidenceAttempt,
} from './evidence-recovery.js';
import { EvidenceDownloader } from './evidence-downloader.js';
import { actionFailure } from './action-recovery.js';
type Result = { record: CaseRecord; receipt: Receipt };
export function EvidencePanel({
  record,
  actorId,
  canAttach,
  api,
  onChanged,
  onBusyChange,
  disabled,
}: {
  record: CaseRecord;
  actorId: string;
  canAttach: boolean;
  api: (path: string, body?: unknown) => Promise<any>;
  onChanged: (result: Result) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  disabled: boolean;
}) {
  const [items, setItems] = useState<EvidenceView[]>([]),
    [enabled, setEnabled] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const generation = useRef(0);
  const lifetime = useRef(0);
  const active = useRef(false);
  const frozen = useRef<EvidenceAttempt | null>(null);
  const doneAction = useRef<(() => void) | undefined>(undefined);
  const notify = useRef(onBusyChange);
  notify.current = onBusyChange;
  const [attempt, setAttempt] = useState<EvidenceAttempt | null>(null);
  useEffect(
    () => () => {
      lifetime.current++;
      frozen.current = null;
      notify.current(false);
    },
    [],
  );
  useEffect(() => {
    if (!attempt) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [attempt]);
  async function refresh() {
    const version = ++generation.current,
      result = await api('evidence?recordId=' + record.id);
    if (version === generation.current) {
      setItems(EvidenceViewSchema.array().parse(result.evidence));
      setEnabled(result.enabled === true);
    }
  }
  useEffect(() => {
    void refresh().catch(() => setError('Evidence details are unavailable.'));
    return () => {
      generation.current++;
    };
  }, [record.id, record.version]);
  async function send(intent: EvidenceAttempt, retry: boolean) {
    if (active.current) return;
    active.current = true;
    const current = lifetime.current;
    frozen.current = intent;
    setAttempt(intent);
    onBusyChange(true);
    setPending(true);
    setError('');
    setMessage('');
    let result: Result | null = null;
    try {
      result = evidenceResult(await api(intent.path, evidenceRequest(intent)), intent);
    } catch (failure) {
      if (current !== lifetime.current) return;
      if (actionFailure(failure, retry) === 'rejected') {
        frozen.current = null;
        setAttempt(null);
        onBusyChange(false);
        doneAction.current = undefined;
        setError(failure instanceof Error ? failure.message : 'The evidence action was rejected.');
      } else
        setError(
          'The evidence outcome is unknown. Retry the exact original request to recover its receipt. The file, metadata and retry key remain frozen in this tab.',
        );
    } finally {
      if (current === lifetime.current) {
        active.current = false;
        setPending(false);
      }
    }
    if (!result || current !== lifetime.current) return;
    frozen.current = null;
    setAttempt(null);
    onBusyChange(false);
    doneAction.current?.();
    doneAction.current = undefined;
    // A refresh failure does not invalidate an already correlated receipt.
    await onChanged(result);
  }
  async function run(path: EvidenceAttempt['path'], input: object, done?: () => void) {
    if (active.current || frozen.current) return;
    try {
      const intent = prepareEvidence(
        path,
        { ...input, idempotencyKey: crypto.randomUUID() },
        record,
      );
      doneAction.current = done;
      await send(intent, false);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Evidence details could not be confirmed.',
      );
    }
  }
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (active.current || frozen.current) return;
    const current = lifetime.current;
    const form = e.currentTarget,
      data = new FormData(form),
      file = data.get('file');
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_SYNTHETIC_EVIDENCE_BYTES) {
      setError('Choose a nonempty text file of at most 256 KiB.');
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer()),
      parts: string[] = [];
    for (let i = 0; i < bytes.length; i += 8192)
      parts.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
    if (current !== lifetime.current || active.current || frozen.current) return;
    const sourceUrl = String(data.get('sourceUrl') || '').trim(),
      sourceDate = String(data.get('sourceDate') || '');
    await run(
      'evidence/upload',
      {
        recordId: record.id,
        expectedVersion: record.version,
        filename: file.name,
        base64: btoa(parts.join('')),
        description: String(data.get('description')),
        attestedSynthetic: data.get('attestedSynthetic') === 'on',
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(sourceDate ? { sourceDate } : {}),
      },
      () => form.reset(),
    );
  }
  return (
    <section className="action-panel evidence-panel" style={{ marginTop: 25 }}>
      <h2>Evidence & sources</h2>
      <p className="muted">
        Synthetic text preparation only. An attachment is not proof of eligibility. Format
        validation is not a security scan or official acceptance.
      </p>
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {attempt && !pending && (
        <div className="evidence-recovery">
          <p>
            Recovery is available only while this tab remains open. Closing it loses the retry
            request, not any saved attachment.
          </p>
          <button
            className="button"
            type="button"
            onClick={() => {
              if (frozen.current) void send(frozen.current, true);
            }}
          >
            Retry exact evidence action
          </button>
        </div>
      )}
      <fieldset disabled={pending || !!attempt} style={{ border: 0, padding: 0, minWidth: 0 }}>
        {enabled && canAttach ? (
          <details>
            <summary>Attach a synthetic text file</summary>
            <form className="form-stack" onSubmit={upload}>
              <div className="field">
                <label htmlFor="evidence-file">Synthetic text file</label>
                <input
                  id="evidence-file"
                  name="file"
                  type="file"
                  accept=".txt,text/plain"
                  required
                />
                <span className="hint">
                  A plain UTF-8 .txt file, at most 256 KiB. Ten attachments per record.
                </span>
              </div>
              <div className="field">
                <label htmlFor="evidence-description">What this item shows</label>
                <textarea
                  id="evidence-description"
                  name="description"
                  rows={3}
                  minLength={3}
                  maxLength={2000}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="evidence-url">Source URL (optional)</label>
                <input id="evidence-url" name="sourceUrl" type="url" maxLength={2000} />
                <span className="hint">
                  The website does not fetch this URL or verify the source.
                </span>
              </div>
              <div className="field">
                <label htmlFor="evidence-date">Source date (optional)</label>
                <input id="evidence-date" name="sourceDate" type="date" />
              </div>
              <div className="check-field">
                <input id="evidence-attest" name="attestedSynthetic" type="checkbox" required />
                <label htmlFor="evidence-attest">
                  I am using invented development information only.
                </label>
              </div>
              <button className="button" disabled={pending || items.length >= 10}>
                Save quarantined attachment
              </button>
            </form>
          </details>
        ) : !enabled ? (
          <p className="hint">
            The synthetic upload adapter is disabled. Real private evidence intake is closed.
          </p>
        ) : null}
        {items.length ? (
          <ol className="activity-list">
            {items.map((item) => (
              <li className="activity-card evidence-card" key={item.id}>
                <p className="eyebrow">
                  {item.state === 'clean'
                    ? 'Synthetic text checked'
                    : item.state === 'rejected'
                      ? 'Rejected · text unavailable'
                      : 'Quarantined · download unavailable'}
                </p>
                <h3>{item.filename}</h3>
                <p>{item.description}</p>
                <p className="hint">
                  {item.byteLength.toLocaleString()} bytes · uploaded{' '}
                  {new Date(item.createdAt).toLocaleString()}
                  {item.sourceDate ? ' · source date ' + item.sourceDate : ''}
                </p>
                {item.sourceUrl && (
                  <p>
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                      Open supplied source
                    </a>
                  </p>
                )}
                <p className="workspace-id">{item.id}</p>
                <button
                  className="quiet-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(item.id);
                      setMessage('Evidence ID copied.');
                    } catch {
                      setError('Select and copy the evidence ID above.');
                    }
                  }}
                >
                  Copy evidence ID
                </button>
                {item.state === 'quarantined' &&
                  enabled &&
                  canAttach &&
                  (item.uploaderId === actorId || record.ownerId === actorId) && (
                    <button
                      className="button button-secondary"
                      disabled={pending}
                      onClick={() =>
                        void run('evidence/validate', {
                          recordId: record.id,
                          evidenceId: item.id,
                          expectedVersion: record.version,
                        })
                      }
                    >
                      Validate synthetic text
                    </button>
                  )}
                {item.state === 'clean' && (
                  <EvidenceDownloader
                    item={item}
                    api={api}
                    disabled={disabled || pending || !!attempt}
                  />
                )}
                {item.rejectionCode && (
                  <p className="hint">
                    {item.rejectionCode === 'INVALID_TEXT'
                      ? 'This file is not permitted plain UTF-8 text.'
                      : 'The stored attachment could not be verified.'}
                  </p>
                )}
                <details>
                  <summary>Integrity & scope</summary>
                  <p className="workspace-id">{item.plaintextSha256}</p>
                  <p className="hint">
                    SHA-256 of supplied bytes. No security scan, legal acceptance, credibility
                    finding or external storage receipt is asserted.
                  </p>
                </details>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No attachments on this record.</p>
        )}
      </fieldset>
    </section>
  );
}
