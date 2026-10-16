'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CaseRecord, Receipt } from '@cornerstone/contracts';
import type { ActionDefinition } from '@cornerstone/domain';
import { WorkflowFields, formInput } from './workflow-fields.js';
import {
  actionFailure,
  actionRequest,
  actionResult,
  prepareAction,
  type ActionAttempt,
} from './action-recovery.js';

export function WorkflowAction({
  action,
  record,
  records,
  api,
  disabled,
  onBusyChange,
  onConfirmed,
}: {
  action: ActionDefinition;
  record: CaseRecord;
  records: CaseRecord[];
  api: (path: string, body?: unknown) => Promise<unknown>;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onConfirmed: (result: { record: CaseRecord; receipt: Receipt }) => void;
}) {
  const [attempt, setAttempt] = useState<ActionAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const generation = useRef(0);
  const frozen = useRef<ActionAttempt | null>(null);
  const notify = useRef(onBusyChange);
  notify.current = onBusyChange;
  useEffect(() => {
    generation.current++;
    return () => {
      generation.current++;
      frozen.current = null;
      notify.current(false);
    };
  }, []);
  useEffect(() => {
    if (!attempt) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [attempt]);

  async function send(intent: ActionAttempt, retry: boolean) {
    if (active.current) return;
    active.current = true;
    const current = generation.current;
    frozen.current = intent;
    setAttempt(intent);
    setBusy(true);
    setError('');
    notify.current(true);
    let result: ReturnType<typeof actionResult> | null = null;
    try {
      result = actionResult(await api('commands', actionRequest(intent)), intent);
    } catch (failure) {
      if (current !== generation.current) return;
      if (actionFailure(failure, retry) === 'rejected') {
        frozen.current = null;
        setAttempt(null);
        notify.current(false);
        setError(failure instanceof Error ? failure.message : 'The action was rejected.');
      } else {
        setError(
          'The action outcome is unknown. The server may already have recorded it. Retry the original request to recover its receipt; changing the form would create a different action.',
        );
      }
    } finally {
      if (current === generation.current) {
        active.current = false;
        setBusy(false);
      }
    }
    if (!result || current !== generation.current) return;
    frozen.current = null;
    setAttempt(null);
    notify.current(false);
    // A subsequent refresh failure cannot turn this confirmed write into a new intent.
    onConfirmed(result);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || active.current || frozen.current) return;
    try {
      const intent = prepareAction(
        {
          recordId: record.id,
          action: action.key,
          expectedVersion: record.version,
          idempotencyKey: crypto.randomUUID(),
          input: formInput(event.currentTarget, action.fields),
        },
        record,
      );
      void send(intent, false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Check the action fields.');
    }
  }

  return (
    <form className="action-panel form-stack" onSubmit={submit} aria-busy={busy}>
      <h2>{action.label}</h2>
      <p className="muted">{action.help}</p>
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      <fieldset
        disabled={disabled || busy || !!attempt}
        style={{ border: 0, padding: 0, minWidth: 0 }}
      >
        <WorkflowFields
          fields={action.fields}
          prefix={action.key}
          records={records}
          record={record}
          api={api}
          values={{
            evidenceIds: record.data['evidenceIds'],
            ...(action.key === 'correct' ? { schedule: record.data['schedule'] } : {}),
          }}
        />
        <button className="button" disabled={disabled || busy || !!attempt}>
          {busy ? 'Submitting…' : action.label}
        </button>
      </fieldset>
      {attempt && !busy && (
        <div className="action-recovery">
          <p>
            Original action: {action.label}, record version {actionRequest(attempt).expectedVersion}
            . Recovery stays in this tab only; closing it loses the request, not any saved action.
          </p>
          <button
            className="button"
            type="button"
            onClick={() => {
              if (frozen.current) void send(frozen.current, true);
            }}
          >
            Retry exact action
          </button>
        </div>
      )}
    </form>
  );
}
