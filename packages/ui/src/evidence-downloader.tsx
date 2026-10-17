'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { EvidenceView } from '@cornerstone/contracts';
import { reviewEvidenceDownload } from './evidence-download.js';
import type { EvidenceDownload } from './evidence-download-session.js';
export function EvidenceDownloader({
  item,
  api,
  download,
  disabled,
}: {
  item: EvidenceView;
  api: (path: string, body?: unknown) => Promise<unknown>;
  download: EvidenceDownload;
  disabled: boolean;
}) {
  const id = useId(),
    generation = useRef(0),
    active = useRef(false),
    blocked = useRef(disabled),
    controller = useRef<AbortController | null>(null);
  blocked.current = disabled;
  const [review, setReview] = useState<EvidenceView | null>(null),
    [opened, setOpened] = useState(false),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  function close() {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    active.current = false;
    setReview(null);
    setOpened(false);
    setConsent(false);
    setBusy(false);
    setError('');
    setMessage('');
  }
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (disabled) close();
  }, [disabled]);
  async function load(confirm: boolean) {
    if (active.current || blocked.current || (confirm && (!review || !consent))) return;
    active.current = true;
    const current = ++generation.current;
    setOpened(true);
    setBusy(true);
    setError('');
    setMessage('');
    if (confirm) setConsent(false);
    try {
      const checked = reviewEvidenceDownload(
        await api('evidence?recordId=' + encodeURIComponent(item.recordId)),
        review ?? item,
      );
      if (generation.current !== current || blocked.current) return;
      if (!confirm) {
        setReview(checked);
        setConsent(false);
        return;
      }
      const abort = new AbortController();
      controller.current = abort;
      const timeout = setTimeout(() => abort.abort(), 15000);
      let downloaded: Awaited<ReturnType<EvidenceDownload>>;
      try {
        downloaded = await download(checked, abort.signal);
      } finally {
        clearTimeout(timeout);
        if (controller.current === abort) controller.current = null;
      }
      if (generation.current !== current || blocked.current || !downloaded.isCurrent()) return;
      const url = URL.createObjectURL(
          new Blob([downloaded.bytes], { type: 'text/plain;charset=utf-8' }),
        ),
        link = document.createElement('a');
      try {
        link.href = url;
        link.download = checked.filename;
        document.body.append(link);
        link.click();
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setMessage(
        'Reviewed text file prepared. Check your browser downloads. This is not legal acceptance or proof of delivery.',
      );
    } catch {
      if (generation.current === current) {
        setConsent(false);
        setError(
          'The attachment could not be verified for download. No file was prepared. Review current access and try again.',
        );
      }
    } finally {
      if (generation.current === current) {
        active.current = false;
        setBusy(false);
      }
    }
  }
  if (!opened)
    return (
      <button
        className="button button-secondary"
        disabled={disabled}
        onClick={() => void load(false)}
      >
        Download synthetic text
      </button>
    );
  return (
    <section className="evidence-download-review" aria-busy={busy}>
      <h4>Review attachment download</h4>
      <p>
        The original synthetic text will be saved without encryption. Device backups, synced folders
        and other apps may retain it. This app cannot recall downloaded copies. Current access and
        the exact byte digest are checked before preparing the file.
      </p>
      {review && (
        <>
          <p>
            {review.filename} · {review.byteLength.toLocaleString()} bytes
          </p>
          <p>{review.description}</p>
          <div className="check-field">
            <input
              id={id}
              type="checkbox"
              checked={consent}
              disabled={busy || disabled}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <label htmlFor={id}>
              I agree to save this unencrypted synthetic text file on this device.
            </label>
          </div>
          <button
            className="button"
            disabled={busy || disabled || !consent}
            onClick={() => void load(true)}
          >
            Download reviewed text
          </button>
        </>
      )}
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <button type="button" className="quiet-button" onClick={close}>
        Cancel attachment download
      </button>
    </section>
  );
}
