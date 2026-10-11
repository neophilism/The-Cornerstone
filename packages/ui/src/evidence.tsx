'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  EvidenceViewSchema,
  MAX_SYNTHETIC_EVIDENCE_BYTES,
  type EvidenceView,
  type CaseRecord,
  type Receipt,
} from '@cornerstone/contracts';
type Result = { record: CaseRecord; receipt: Receipt };
export function EvidencePanel({
  record,
  actorId,
  canAttach,
  api,
  onChanged,
  onBusyChange,
}: {
  record: CaseRecord;
  actorId: string;
  canAttach: boolean;
  api: (path: string, body?: unknown) => Promise<any>;
  onChanged: (result: Result) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [items, setItems] = useState<EvidenceView[]>([]),
    [enabled, setEnabled] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const generation = useRef(0),
    retry = useRef<{ command: string; key: string } | null>(null);
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
  async function run(path: string, input: object, done?: () => void) {
    if (pending) return;
    onBusyChange(true);
    setPending(true);
    setError('');
    setMessage('');
    try {
      const command = JSON.stringify({ path, input });
      if (retry.current?.command !== command) retry.current = { command, key: crypto.randomUUID() };
      const result = await api(path, { ...input, idempotencyKey: retry.current.key });
      retry.current = null;
      await onChanged(result);
      await refresh();
      done?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The evidence action could not be completed.');
    } finally {
      setPending(false);
      onBusyChange(false);
    }
  }
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
      {enabled && canAttach ? (
        <details>
          <summary>Attach a synthetic text file</summary>
          <form className="form-stack" onSubmit={upload}>
            <div className="field">
              <label htmlFor="evidence-file">Synthetic text file</label>
              <input id="evidence-file" name="file" type="file" accept=".txt,text/plain" required />
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
                <a
                  className="button button-secondary"
                  href={'/api/private/evidence/download?id=' + item.id}
                  download={item.filename}
                >
                  Download synthetic text
                </a>
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
                  SHA-256 of supplied bytes. No security scan, legal acceptance, credibility finding
                  or external storage receipt is asserted.
                </p>
              </details>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No attachments on this record.</p>
      )}
    </section>
  );
}
