'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { personalCalendarReminder } from '@cornerstone/domain/reminders';

/** Independent from case fields: only access is checked, never copied into the file. */
export function ReminderPanel({ recordId }: { recordId: string }) {
  const inputId = useId();
  const [date, setDate] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const prepared = useRef<{ date: string; content: string } | null>(null);
  useEffect(() => {
    generation.current++;
    return () => {
      generation.current++;
      active.current?.abort();
      active.current = null;
      prepared.current = null;
    };
  }, [recordId]);

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || !consent) return;
    const request = new AbortController();
    active.current = request;
    const current = generation.current;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const content =
        prepared.current?.date === date
          ? prepared.current.content
          : personalCalendarReminder({ date, consent });
      const response = await fetch(
        '/api/private/records?recordId=' + encodeURIComponent(recordId),
        {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: request.signal,
        },
      );
      if (!response.ok)
        throw Error('Current record access could not be verified. No reminder was exported.');
      const result: unknown = await response.json();
      if (generation.current !== current || request.signal.aborted) return;
      if (
        !result ||
        typeof result !== 'object' ||
        !('records' in result) ||
        !Array.isArray(result.records) ||
        !result.records.some(
          (record: unknown) =>
            record !== null &&
            typeof record === 'object' &&
            'id' in record &&
            record.id === recordId,
        )
      )
        throw Error('Current record access could not be verified. No reminder was exported.');
      prepared.current = { date, content };
      const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
      const link = document.createElement('a');
      try {
        link.href = url;
        link.download = 'preparation-reminder.ics';
        document.body.append(link);
        link.click();
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setMessage(
        'Calendar file prepared. Import it into a private calendar and choose notifications there. No calendar delivery or legal deadline has been confirmed.',
      );
    } catch (e) {
      if (generation.current === current && !request.signal.aborted)
        setError(e instanceof Error ? e.message : 'The reminder could not be exported.');
    } finally {
      if (active.current === request) active.current = null;
      if (generation.current === current) setBusy(false);
    }
  }

  return (
    <details className="saved-details">
      <summary>Personal calendar reminder</summary>
      <form className="form-stack" onSubmit={(event) => void prepare(event)} aria-busy={busy}>
        <p className="muted">
          Choose a date to review your preparation. This is not legal service or an official
          deadline. Nothing is sent to a calendar automatically.
        </p>
        <div className="field">
          <label htmlFor={inputId}>Reminder date</label>
          <input
            id={inputId}
            type="date"
            required
            min="1000-01-01"
            max="9999-12-30"
            value={date}
            disabled={busy}
            onChange={(event) => {
              setDate(event.target.value);
              setMessage('');
              setError('');
            }}
          />
        </div>
        <div className="check-field">
          <input
            id={inputId + '-consent'}
            type="checkbox"
            checked={consent}
            disabled={busy}
            onChange={(event) => {
              setConsent(event.target.checked);
              setMessage('');
            }}
          />
          <label htmlFor={inputId + '-consent'}>
            I understand that my calendar provider or people with calendar access may see this
            generic reminder and my use of this tool.
          </label>
        </div>
        <p className="hint">
          The file contains a generic title, date, random event identifier and software name. It
          excludes case titles, record identifiers, private text, contacts and links. Imported
          copies cannot be recalled; a calendar may ignore the private classification. Repeated
          downloads here reuse the event identifier, but import behavior varies.
        </p>
        <button className="button button-secondary" disabled={busy || !date || !consent}>
          {busy ? 'Preparing reminder...' : 'Download calendar reminder'}
        </button>
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
      </form>
    </details>
  );
}
