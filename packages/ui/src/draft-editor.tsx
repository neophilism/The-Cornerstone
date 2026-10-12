'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CommandSchema, type CaseRecord, type Command, type Receipt } from '@cornerstone/contracts';
import { workflow } from '@cornerstone/domain';
import { WorkflowFields, formInput } from './workflow-fields.js';
import {
  currentDraft,
  draftSaveResult,
  reviewDraft,
  resolveDraft,
  saveFailure,
  showDraftValue,
  type DraftData,
  type DraftReview,
} from './draft-review.js';

type Comparison = {
  record: CaseRecord;
  editable: boolean;
  local: DraftData;
  review: DraftReview;
};

/** In-memory recovery only. An unconfirmed save retains its exact request and cannot be edited. */
export function DraftEditor({
  record,
  records,
  api,
  disabled,
  onBusyChange,
  onSaved,
}: {
  record: CaseRecord;
  records: CaseRecord[];
  api: (path: string, body?: unknown) => Promise<any>;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onSaved: (result: { record: CaseRecord; receipt: Receipt }) => void;
}) {
  const id = useId();
  const fields = workflow(record.kind).createFields;
  const [baseline, setBaseline] = useState(record);
  const [values, setValues] = useState<DraftData>(record.data);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState<Command | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [choices, setChoices] = useState<Record<string, 'local' | 'current'>>({});
  const form = useRef<HTMLFormElement>(null);
  const generation = useRef(0);
  const active = useRef(false);
  const attemptRef = useRef<Command | null>(null);
  const notifyBusy = useRef(onBusyChange);
  notifyBusy.current = onBusyChange;

  useEffect(() => {
    generation.current++;
    return () => {
      generation.current++;
      attemptRef.current = null;
      notifyBusy.current(false);
    };
  }, []);
  useEffect(() => {
    if (record.version > baseline.version) setStale(true);
  }, [record.version, baseline.version]);
  useEffect(() => {
    if (!dirty && !attempt) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, attempt]);

  function start() {
    active.current = true;
    setBusy(true);
    notifyBusy.current(true);
    setError('');
    setMessage('');
    return generation.current;
  }
  function finish(current: number) {
    if (generation.current !== current) return;
    active.current = false;
    setBusy(false);
    notifyBusy.current(false);
  }
  function remember(command: Command | null) {
    attemptRef.current = command;
    setAttempt(command);
  }

  async function send(command: Command) {
    const current = start();
    remember(command);
    let accepted: ReturnType<typeof draftSaveResult> | null = null;
    try {
      const raw: unknown = await api('commands', command);
      if (generation.current !== current) return;
      accepted = draftSaveResult(raw, command, baseline);
      remember(null);
      setDirty(false);
    } catch (e) {
      if (generation.current !== current) return;
      const outcome = saveFailure(e);
      if (outcome !== 'uncertain') remember(null);
      if (outcome === 'stale') {
        setStale(true);
        setError(
          'The saved draft changed. Your unsaved input is still here. Load the current version to review both before saving.',
        );
      } else if (outcome === 'rejected') {
        setError(
          e instanceof Error ? e.message : 'The server rejected this save. Your input is retained.',
        );
      } else {
        setError(
          'The save outcome is unknown. It may already be saved. Retry the exact save to check its receipt without creating a second change.',
        );
      }
    } finally {
      finish(current);
    }
    // A parent refresh failure must never turn an accepted save into an unconfirmed retry.
    if (accepted && generation.current === current) onSaved(accepted);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || disabled || attemptRef.current || comparison || stale) return;
    try {
      const input = formInput(event.currentTarget, fields);
      const command = CommandSchema.parse({
        recordId: baseline.id,
        action: 'save_draft',
        expectedVersion: baseline.version,
        idempotencyKey: crypto.randomUUID(),
        input,
      });
      await send(command);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review the draft fields before saving.');
    }
  }

  async function loadCurrent() {
    if (active.current || disabled || attemptRef.current || !form.current) return;
    // Read before disabling the fieldset, as disabled form controls are omitted from FormData.
    let local: DraftData;
    try {
      local = formInput(form.current, fields);
    } catch {
      setError(
        'A structured field cannot be read. Correct its format before comparing; your input has not been replaced.',
      );
      return;
    }
    const current = start();
    try {
      const raw: unknown = await api('records?recordId=' + encodeURIComponent(baseline.id));
      if (generation.current !== current) return;
      const snapshot = currentDraft(raw, baseline);
      if (snapshot.record.version !== baseline.version || !snapshot.editable) setStale(true);
      setComparison({
        ...snapshot,
        local,
        review: reviewDraft(
          fields.map((field) => field.key),
          baseline.data,
          local,
          snapshot.record.data,
        ),
      });
      setChoices({});
    } catch (e) {
      if (generation.current === current)
        setError(
          e instanceof Error
            ? e.message
            : 'Current access could not be verified. Your input is still here.',
        );
    } finally {
      finish(current);
    }
  }
  function applyReview() {
    if (!comparison?.editable || active.current || disabled) return;
    try {
      const reviewed = resolveDraft(comparison.review, choices);
      setBaseline(comparison.record);
      setValues(reviewed);
      setRevision((value) => value + 1);
      setComparison(null);
      setChoices({});
      setStale(false);
      setDirty(true);
      setError('');
      setMessage(
        'Reviewed draft loaded. Nothing has been saved yet. Check the fields, then save when ready.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Choose a value for every conflicting field.');
    }
  }
  const allChosen = comparison?.review.conflicts.every((conflict) => choices[conflict.field]);
  const label = (key: string) => fields.find((field) => field.key === key)?.label || key;
  return (
    <section className="panel" aria-labelledby={id + '-title'}>
      <h3 id={id + '-title'}>Edit your draft</h3>
      <p className="hint">
        Editing saved version {baseline.version}. Your changes stay only in this open view until a
        save is confirmed. Closing this view or signing out discards unsaved input. An interrupted
        save may already have reached the server.
      </p>
      <form
        ref={form}
        className="form-stack"
        onSubmit={(event) => void save(event)}
        onChange={() => setDirty(true)}
        aria-busy={busy}
      >
        <fieldset
          disabled={disabled || busy || !!attempt || !!comparison}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <WorkflowFields
            key={revision}
            fields={fields}
            prefix={id + '-draft'}
            values={values}
            records={records}
            record={baseline}
            api={api}
          />
          <button className="button" disabled={stale}>
            Save draft changes
          </button>
        </fieldset>
      </form>
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
      {attempt ? (
        <div className="form-stack">
          <p className="hint">
            The pending request is frozen, including its original version and retry key. No new save
            can be prepared until its outcome is resolved.
          </p>
          <button
            className="button"
            disabled={busy || disabled}
            onClick={() => {
              if (!active.current && attemptRef.current) void send(attemptRef.current);
            }}
          >
            Retry exact save
          </button>
        </div>
      ) : comparison ? (
        <section className="form-stack" aria-labelledby={id + '-review'}>
          <h3 id={id + '-review'}>Compare with saved version {comparison.record.version}</h3>
          <p>
            Independent field changes can be combined. When both copies changed the same field
            differently, choose which value to keep. Structured fields and lists are reviewed as a
            whole. Nothing is written during this review.
          </p>
          {!comparison.editable && (
            <p className="error-panel" role="alert">
              The current record is no longer editable with your permissions. Your input is retained
              here, but a new save cannot be prepared.
            </p>
          )}
          {comparison.review.changed.length === 0 && <p>The editable fields are unchanged.</p>}
          {comparison.review.changed.map((key) => {
            const conflict = comparison.review.conflicts.find((entry) => entry.field === key);
            return (
              <fieldset
                key={key}
                className="form-stack"
                disabled={!comparison.editable || busy || disabled}
              >
                <legend>{label(key)}</legend>
                <p>
                  <strong>Your unsaved value</strong>
                </p>
                <pre
                  className="code-block"
                  style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                >
                  {showDraftValue(comparison.local[key])}
                </pre>
                <p>
                  <strong>Current saved value</strong>
                </p>
                <pre
                  className="code-block"
                  style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                >
                  {showDraftValue(comparison.record.data[key])}
                </pre>
                {conflict ? (
                  (['local', 'current'] as const).map((value) => (
                    <div className="check-field" key={value}>
                      <input
                        type="radio"
                        id={id + '-' + key + '-' + value}
                        name={id + '-choice-' + key}
                        checked={choices[key] === value}
                        onChange={() => setChoices((previous) => ({ ...previous, [key]: value }))}
                      />
                      <label htmlFor={id + '-' + key + '-' + value}>
                        {value === 'local' ? 'Keep my unsaved value' : 'Use current saved value'}{' '}
                        for {label(key)}
                      </label>
                    </div>
                  ))
                ) : (
                  <p className="hint">
                    No conflicting edit. The changed value will be retained in the reviewed draft.
                  </p>
                )}
              </fieldset>
            );
          })}
          <button
            className="button"
            disabled={!comparison.editable || !allChosen || busy || disabled}
            onClick={applyReview}
          >
            Continue with reviewed draft
          </button>
          <button
            className="button button-secondary"
            disabled={busy || disabled}
            onClick={() => {
              setComparison(null);
              setChoices({});
              setError('');
            }}
          >
            Return to my unsaved draft
          </button>
        </section>
      ) : (
        <div className="form-stack">
          {stale && (
            <p className="hint">
              The saved version changed. Saving is paused until you explicitly review the current
              version.
            </p>
          )}
          <button
            className="button button-secondary"
            disabled={busy || disabled}
            onClick={() => void loadCurrent()}
          >
            Load current saved version
          </button>
        </div>
      )}
    </section>
  );
}
