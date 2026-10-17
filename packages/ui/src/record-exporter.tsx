'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { printReviewedRecord } from './record-print.js';
import type { CaseRecord } from '@cornerstone/contracts';
import { reviewRecordExport, confirmRecordExport, type ExportReview } from './record-export.js';
import {
  disclosePrivate,
  preparePrivateDisclosure,
  type SessionBoundRead,
} from './private-disclosure.js';

export function RecordExporter({
  record,
  actorId,
  readPrivate,
  disabled,
  format = 'file',
}: {
  record: CaseRecord;
  actorId: string;
  readPrivate: SessionBoundRead;
  disabled: boolean;
  format?: 'file' | 'print';
}) {
  const id = useId();
  const printing = format === 'print';
  const releasePrint = useRef<(() => void) | null>(null);
  const [opened, setOpened] = useState(false);
  const [review, setReview] = useState<ExportReview | null>(null);
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
      releasePrint.current?.();
    },
    [],
  );
  useEffect(() => {
    if (disabled) close();
  }, [disabled]);
  function close() {
    releasePrint.current?.();
    releasePrint.current = null;
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
      const response = await preparePrivateDisclosure(
        readPrivate,
        'records?recordId=' + encodeURIComponent(record.id),
        (raw) =>
          confirm && review
            ? confirmRecordExport(raw, review, consent)
            : { status: 'review' as const, review: reviewRecordExport(raw, record, actorId) },
      );
      if (generation.current !== current || blocked.current) return;
      const result = response.value;
      if (result.status !== 'ready') {
        disclosePrivate(response, () => {
          setReview(result.review);
          setConsent(false);
          if (result.status === 'changed')
            setMessage(
              'The saved record changed. Review version ' +
                result.review.record.version +
                ' and confirm again. No file was exported.',
            );
        });
      } else {
        setConsent(false);
        if (printing) {
          releasePrint.current?.();
          releasePrint.current = disclosePrivate(response, () =>
            printReviewedRecord(result.content),
          );
          setMessage(
            'The reviewed record was sent to the browser print dialog. This does not confirm that printing or saving a PDF completed.',
          );
        } else {
          disclosePrivate(response, () => {
            const url = URL.createObjectURL(
              new Blob([result.content], { type: 'application/json;charset=utf-8' }),
            );
            const link = document.createElement('a');
            try {
              link.href = url;
              link.download = 'cornerstone-synthetic-record.json';
              document.body.append(link);
              link.click();
            } finally {
              link.remove();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
          });
          setMessage(
            'Record file prepared. Check your browser downloads. This is not a legal filing or a verified external delivery.',
          );
        }
      }
    } catch {
      if (generation.current === current) {
        setReview(null);
        setConsent(false);
        setError(
          'Current access or the reviewed saved version could not be verified. No file was exported.',
        );
      }
    } finally {
      if (generation.current === current) {
        active.current = false;
        setBusy(false);
      }
    }
  }
  if (record.realm !== 'simulation') return null;
  if (!opened)
    return (
      <div className="record-links">
        <button
          className="button button-secondary"
          disabled={disabled}
          onClick={() => void load(false)}
        >
          {printing ? 'Print record' : 'Export record'}
        </button>
      </div>
    );
  return (
    <section className="panel form-stack" aria-labelledby={id + '-title'} aria-busy={busy}>
      <h3 id={id + '-title'}>{printing ? 'Review record printing' : 'Review record export'}</h3>
      <p>
        The file contains the saved title, record and owner identifiers, saved details, status,
        version, policy reference and timestamps. Evidence references may be included; attachment
        bytes and private ballots are not retrieved by this export.
      </p>
      <p className="hint">
        {printing
          ? 'Printed pages, PDF files and printer queues are not encrypted by this app.'
          : 'The file is not encrypted.'}{' '}
        Device backups, shared folders or other people with device access may retain copies. This
        app cannot recall a downloaded copy. Unsaved edits are not included. Access is checked
        immediately before preparation, not guaranteed after download.
      </p>
      {review && (
        <>
          <dl className="record-data">
            <dt>Saved title</dt>
            <dd>{review.record.title}</dd>
            <dt>Reviewed version</dt>
            <dd>{review.record.version}</dd>
            <dt>Record identifier</dt>
            <dd>{review.record.id}</dd>
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
              {printing
                ? 'I agree to send this reviewed synthetic record to my browser print dialog.'
                : 'I agree to save this unencrypted synthetic record file on this device.'}
            </label>
          </div>
          <button
            className="button"
            disabled={busy || disabled || !consent}
            onClick={() => void load(true)}
          >
            {busy
              ? 'Checking current access...'
              : printing
                ? 'Print reviewed record'
                : 'Download reviewed record'}
          </button>
        </>
      )}
      {!review && !busy && (
        <button
          className="button button-secondary"
          disabled={disabled}
          onClick={() => void load(false)}
        >
          Check access again
        </button>
      )}
      {busy && <p role="status">Checking the current saved record...</p>}
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
        {printing ? 'Cancel printing' : 'Cancel export'}
      </button>
    </section>
  );
}
