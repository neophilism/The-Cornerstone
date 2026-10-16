'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { Receipt } from '@cornerstone/contracts';
import { reviewReceiptExport, confirmReceiptExport, type ReceiptReview } from './receipt-export.js';

export function ReceiptExporter({
  receipt,
  api,
  disabled,
}: {
  receipt: Receipt;
  api: (path: string, body?: unknown) => Promise<any>;
  disabled: boolean;
}) {
  const id = useId();
  const [opened, setOpened] = useState(false);
  const [review, setReview] = useState<ReceiptReview | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const active = useRef(false);
  const blocked = useRef(disabled);
  blocked.current = disabled;
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (disabled) close();
  }, [disabled]);
  function close() {
    generation.current++;
    active.current = false;
    setOpened(false);
    setReview(null);
    setConsent(false);
    setBusy(false);
    setError('');
    setMessage('');
  }
  async function load(confirm: boolean) {
    if (active.current || blocked.current || (confirm && (!review || !consent))) return;
    active.current = true;
    const current = ++generation.current;
    setBusy(true);
    setOpened(true);
    setError('');
    setMessage('');
    try {
      const raw: unknown = await api('receipts?receiptId=' + encodeURIComponent(receipt.id));
      if (generation.current !== current || blocked.current) return;
      if (!confirm || !review) {
        setReview(reviewReceiptExport(raw, receipt));
        setConsent(false);
      } else {
        const result = confirmReceiptExport(raw, review, consent);
        setConsent(false);
        const url = URL.createObjectURL(
          new Blob([result], { type: 'application/json;charset=utf-8' }),
        );
        const link = document.createElement('a');
        try {
          link.href = url;
          link.download = 'cornerstone-simulation-receipt.json';
          document.body.append(link);
          link.click();
        } finally {
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        setMessage(
          'Receipt file prepared. Check your browser downloads. This is not a legal filing or a verified external delivery.',
        );
      }
    } catch {
      if (generation.current === current) {
        setReview(null);
        setConsent(false);
        setError(
          'Current access or the reviewed receipt could not be verified. No file was exported.',
        );
      }
    } finally {
      if (generation.current === current) {
        active.current = false;
        setBusy(false);
      }
    }
  }
  if (receipt.realm !== 'simulation') return null;
  if (!opened)
    return (
      <div className="record-links">
        <button
          className="button button-secondary"
          disabled={disabled}
          onClick={() => void load(false)}
        >
          Download receipt
        </button>
      </div>
    );
  return (
    <section className="panel form-stack" aria-labelledby={id + '-title'} aria-busy={busy}>
      <h3 id={id + '-title'}>Review receipt export</h3>
      <p>
        The file contains receipt and record identifiers, the historical action and version,
        timestamp, digest and simulation status. It does not include record details, attachments,
        other people's receipts or request keys. This receipt is not independently signed proof, a
        legal filing or confirmation of external delivery. The record may have changed since it.
      </p>
      <p className="hint">
        The file is not encrypted. Device backups, shared folders or other people with device access
        may retain copies. This app cannot recall a downloaded copy. Current access is checked
        immediately before preparation, not guaranteed after download.
      </p>
      {review && (
        <>
          <dl className="record-data">
            <dt>Action</dt>
            <dd>{review.receipt.action}</dd>
            <dt>Historical version</dt>
            <dd>{review.receipt.version}</dd>
            <dt>Record identifier</dt>
            <dd>{review.receipt.recordId}</dd>
          </dl>
          <details className="saved-details">
            <summary>Review the complete file contents</summary>
            <pre
              className="code-block"
              style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            >
              {review.content}
            </pre>
          </details>
          <div className="check-field">
            <input
              type="checkbox"
              id={id + '-consent'}
              checked={consent}
              disabled={busy || disabled}
              onChange={(event) => {
                setConsent(event.target.checked);
                setMessage('');
              }}
            />
            <label htmlFor={id + '-consent'}>
              I agree to save this unencrypted synthetic receipt file on this device.
            </label>
          </div>
          <button
            className="button"
            disabled={busy || disabled || !consent}
            onClick={() => void load(true)}
          >
            {busy ? 'Checking current access...' : 'Download reviewed receipt'}
          </button>
        </>
      )}
      {!review && !busy && (
        <button
          className="button button-secondary"
          disabled={disabled}
          onClick={() => void load(false)}
        >
          Check receipt access again
        </button>
      )}
      {busy && <p role="status">Checking current receipt access...</p>}
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
      <button className="quiet-button" onClick={close}>
        Cancel receipt export
      </button>
    </section>
  );
}
