'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { Actor, CaseRecord, Kind, Receipt } from '@cornerstone/contracts';
import { workflow } from '@cornerstone/domain';
import { WorkflowFields, formInput } from './workflow-fields.js';
import {
  prepareCreation,
  creationRequest,
  creationResult,
  creationFailure,
  type CreationAttempt,
} from './creation.js';

/** One in-memory creation intent. A lost response must not become a new record. */
export function RecordCreator({
  kind,
  actor,
  defaults,
  records,
  api,
  disabled,
  onBusyChange,
  onSaved,
}: {
  kind: Kind;
  actor: Actor;
  defaults: Record<string, unknown>;
  records: CaseRecord[];
  api: (path: string, body?: unknown) => Promise<any>;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onSaved: (result: { record: CaseRecord; receipt: Receipt }) => void;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [attempt, setAttempt] = useState<CreationAttempt | null>(null);
  const [error, setError] = useState('');
  const active = useRef(false);
  const generation = useRef(0);
  const frozen = useRef<CreationAttempt | null>(null);
  const notifyBusy = useRef(onBusyChange);
  notifyBusy.current = onBusyChange;
  useEffect(() => {
    generation.current++;
    return () => {
      generation.current++;
      frozen.current = null;
      notifyBusy.current(false);
    };
  }, []);
  useEffect(() => {
    if (!dirty && !attempt) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, attempt]);

  async function send(candidate: CreationAttempt, retry: boolean) {
    if (active.current || disabled) return;
    active.current = true;
    const current = generation.current;
    frozen.current = candidate;
    setAttempt(candidate);
    setBusy(true);
    notifyBusy.current(true);
    setError('');
    let accepted: ReturnType<typeof creationResult> | null = null;
    try {
      const raw: unknown = await api('records', creationRequest(candidate));
      if (generation.current !== current) return;
      accepted = creationResult(raw, candidate);
      frozen.current = null;
      setAttempt(null);
      setDirty(false);
    } catch (e) {
      if (generation.current !== current) return;
      if (creationFailure(e, retry) === 'rejected') {
        frozen.current = null;
        setAttempt(null);
        setError(e instanceof Error ? e.message : 'The server rejected this creation.');
      } else {
        setError(
          'Creation is unconfirmed. The record may already exist. Retry the exact creation to check its original receipt; do not start another copy.',
        );
      }
    } finally {
      if (generation.current === current) {
        active.current = false;
        setBusy(false);
        notifyBusy.current(false);
      }
    }
    // A later list-refresh error must not turn a confirmed creation into a retry.
    if (accepted && generation.current === current) onSaved(accepted);
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || disabled || frozen.current) return;
    try {
      const candidate = prepareCreation(
        {
          kind,
          title: String(new FormData(event.currentTarget).get('title') ?? ''),
          input: formInput(event.currentTarget, workflow(kind).createFields),
          idempotencyKey: crypto.randomUUID(),
        },
        actor,
      );
      await send(candidate, false);
    } catch {
      setError('Review the record title and draft fields before saving. Your input is retained.');
    }
  }
  return (
    <section className="action-panel" aria-labelledby={id + '-title'}>
      <h2 id={id + '-title'}>Prepare your new record</h2>
      <p className="hint">
        Unsaved input and retry details stay only in this open view. Closing it or signing out
        discards them. Closing an unconfirmed creation does not cancel a possible server save;
        inspect your records before starting another copy.
      </p>
      <form
        className="form-stack"
        onSubmit={(event) => void create(event)}
        onChange={() => setDirty(true)}
        aria-busy={busy}
      >
        <fieldset
          disabled={disabled || busy || !!attempt}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <div className="field">
            <label htmlFor={id + '-record-title'}>Record title</label>
            <input
              id={id + '-record-title'}
              name="title"
              required
              minLength={3}
              maxLength={160}
              defaultValue={String(defaults['title'] ?? '')}
            />
          </div>
          <WorkflowFields
            fields={workflow(kind).createFields}
            prefix={id + '-create'}
            values={defaults}
            records={records}
            api={api}
          />
          <button className="button">Save synthetic draft</button>
        </fieldset>
      </form>
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      {attempt && (
        <div className="form-stack">
          <p className="hint">
            The exact title, fields and retry key are frozen. A denied retry does not prove that the
            earlier request was not saved. No new creation is sent automatically.
          </p>
          <button
            className="button"
            disabled={busy || disabled}
            onClick={() => {
              if (frozen.current) void send(frozen.current, true);
            }}
          >
            Retry exact creation
          </button>
        </div>
      )}
    </section>
  );
}
