'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ActivityNotificationSchema,
  draftAccessKinds,
  RecordCapabilitiesSchema,
  type RecordCapabilities,
  type ActivityNotification,
  type Actor,
  type CaseRecord,
  type Kind,
  type Receipt,
} from '@cornerstone/contracts';
import {
  workflows,
  workflowGroups,
  workflow,
  actionUnavailable,
  type Field,
} from '@cornerstone/domain';
import { StructuredField, listFields } from './structured-field.js';
import { AccountPanel } from './account.js';
import { DraftAccessPanel } from './draft-access.js';
import { EvidencePanel } from './evidence.js';
import { MembershipPanel, FoundingConsentPanel, MemberBallotPanel } from './membership.js';
import { EvidenceChoice, RecordChoice, IncomeShare, isRecordReference } from './record-fields.js';
import { PreparationGuide, RecordNextStep } from './journey.js';
import { CalculationSummary } from './financial-fields.js';
import { SuccessionSummary } from './succession.js';

type Session = { actor: Actor; csrf: string; mode: string; local: boolean };
export function WorkflowFields({
  fields,
  prefix,
  values = {},
  records = [],
  record,
  api,
}: {
  fields: Field[];
  prefix: string;
  values?: Record<string, unknown>;
  records?: CaseRecord[];
  record?: CaseRecord;
  api?: (path: string, body?: unknown) => Promise<any>;
}) {
  return (
    <>
      {fields
        .filter(
          (f) =>
            !fields.some((other) => other.key === 'financialTerms') ||
            !['rateAct', 'financialVersion'].includes(f.key),
        )
        .filter(
          (f) =>
            ![
              'accessibleMeetings',
              'accessibleVoting',
              'accessibleRecords',
              'practicalDeliberation',
            ].includes(f.key) ||
            (Array.isArray(record?.data['units']) && record.data['units'].length > 2500),
        )
        .map((f) =>
          f.key === 'evidenceIds' ? (
            <EvidenceChoice
              key={`${prefix}:${record?.id}:${record?.version}:${f.key}`}
              field={f}
              prefix={prefix}
              record={record}
              value={values[f.key]}
              api={api}
            />
          ) : isRecordReference(f.key) ? (
            <RecordChoice
              key={f.key}
              field={f}
              prefix={prefix}
              value={values[f.key]}
              records={records}
            />
          ) : f.key === 'earnedIncomeShare' ? (
            <IncomeShare key={f.key} prefix={prefix} value={values[f.key]} />
          ) : f.type === 'json' ? (
            <StructuredField
              key={f.key}
              field={f}
              prefix={prefix}
              value={values[f.key]}
              records={records}
            />
          ) : f.type === 'boolean' ? (
            <div className="check-field" key={f.key}>
              <input
                type="checkbox"
                name={f.key}
                id={`${prefix}-${f.key}`}
                defaultChecked={values[f.key] === true}
              />
              <label htmlFor={`${prefix}-${f.key}`}>
                {f.label}
                {f.required ? ' (required finding)' : ''}
              </label>
            </div>
          ) : (
            <div className="field" key={f.key}>
              <label htmlFor={`${prefix}-${f.key}`}>
                {f.label}
                {!f.required ? ' (optional)' : ''}
              </label>
              {f.type === 'select' ? (
                <select
                  id={`${prefix}-${f.key}`}
                  name={f.key}
                  required={f.required}
                  defaultValue={String(values[f.key] ?? '')}
                >
                  <option value="">Choose an option</option>
                  {f.options?.map((o) => (
                    <option value={o} key={o}>
                      {o.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea
                  id={`${prefix}-${f.key}`}
                  name={f.key}
                  required={f.required}
                  rows={3}
                  defaultValue={String(values[f.key] ?? '')}
                />
              ) : (
                <input
                  id={`${prefix}-${f.key}`}
                  name={f.key}
                  type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                  required={f.required}
                  min={f.type === 'number' ? 0 : undefined}
                  step={f.type === 'number' ? 'any' : undefined}
                  inputMode={f.type === 'money' ? 'decimal' : undefined}
                  pattern={f.type === 'money' ? '(0|[1-9][0-9]*)(\\.[0-9]{2})?' : undefined}
                  defaultValue={String(values[f.key] ?? '')}
                />
              )}
              <span className="hint">
                {f.help ||
                  (f.type === 'money' ? 'Use USD, with two digits for cents when included.' : '')}
              </span>
            </div>
          ),
        )}
    </>
  );
}
function formInput(form: HTMLFormElement, fields: Field[]) {
  const data = new FormData(form);
  const input: Record<string, unknown> = {};
  for (const f of fields) {
    const v = data.get(f.key);
    if (f.key === 'evidenceIds') {
      if (v !== null)
        input[f.key] = String(v)
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
      continue;
    }
    if (f.type === 'boolean') {
      input[f.key] = v === 'on';
      continue;
    }
    if (typeof v !== 'string' || !v.trim()) continue;
    input[f.key] =
      f.type === 'number'
        ? Number(v)
        : f.type === 'json'
          ? listFields.has(f.key)
            ? v
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean)
            : JSON.parse(v)
          : v;
  }
  return input;
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export function Workspace({
  staff = false,
  publicOrigin = '/',
}: {
  staff?: boolean;
  publicOrigin?: string;
}) {
  const [session, setSession] = useState<Session | null>(null),
    [records, setRecords] = useState<CaseRecord[]>([]),
    [notifications, setNotifications] = useState<ActivityNotification[]>([]),
    [view, setView] = useState<string>('home'),
    [selected, setSelected] = useState<CaseRecord | null>(null),
    [editing, setEditing] = useState(false),
    [creating, setCreating] = useState<Kind | null>(null),
    [error, setError] = useState(''),
    [receipt, setReceipt] = useState<Receipt | null>(null),
    [loading, setLoading] = useState(true),
    [pending, setPending] = useState(false),
    [local, setLocal] = useState(false);
  const [recordSearch, setRecordSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pagePending, setPagePending] = useState(false);
  const [recordReference, setRecordReference] = useState('');
  const recordGeneration = useRef(0);
  const retries = useRef(new Map<string, { input: string; key: string }>());
  const [capabilities, setCapabilities] = useState<RecordCapabilities[]>([]);
  const permitted = selected
    ? (capabilities.find((c) => c.recordId === selected.id && c.version === selected.version)
        ?.actions ?? [])
    : [];
  function requestKey(slot: string, input: unknown) {
    const encoded = JSON.stringify(input),
      previous = retries.current.get(slot);
    if (previous?.input === encoded) return previous.key;
    const key = crypto.randomUUID();
    retries.current.set(slot, { input: encoded, key });
    return key;
  }
  async function api(path: string, body?: unknown) {
    const response = await fetch(`/api/private/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        ...(body !== undefined
          ? { 'Content-Type': 'application/json', 'X-CSRF-Token': session?.csrf || '' }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        recordGeneration.current++;
        setSession(null);
        setRecords([]);
        setNotifications([]);
        setCapabilities([]);
        setSelected(null);
        setReceipt(null);
        setNextCursor(null);
      }
      throw Error(data.message || 'The request could not be completed.');
    }
    return data;
  }
  async function refresh() {
    const generation = ++recordGeneration.current;
    try {
      const me = await api('me');
      if (generation !== recordGeneration.current) return [];
      setSession(me);
      const list = await api('records?limit=50');
      if (generation !== recordGeneration.current) return [];
      setRecords(list.records);
      setNextCursor(list.nextCursor);
      setCapabilities(RecordCapabilitiesSchema.array().parse(list.capabilities));
      const inbox = await api('notifications');
      if (generation !== recordGeneration.current) return [];
      setNotifications(ActivityNotificationSchema.array().parse(inbox.notifications));
      return list.records as CaseRecord[];
    } catch (e) {
      if (generation === recordGeneration.current)
        setError(e instanceof Error ? e.message : 'Unavailable');
      return [];
    } finally {
      setLoading(false);
    }
  }
  async function loadOlderRecords() {
    if (!nextCursor || pagePending || pending) return;
    const generation = recordGeneration.current;
    setPagePending(true);
    setError('');
    try {
      const page = await api('records?limit=50&cursor=' + encodeURIComponent(nextCursor));
      if (generation !== recordGeneration.current) return;
      setRecords((previous) => [
        ...new Map([...previous, ...page.records].map((r) => [r.id, r])).values(),
      ]);
      const actions = RecordCapabilitiesSchema.array().parse(page.capabilities);
      setCapabilities((previous) => [
        ...new Map([...previous, ...actions].map((c) => [c.recordId, c])).values(),
      ]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      if (generation === recordGeneration.current)
        setError(e instanceof Error ? e.message : 'Older records could not be loaded.');
    } finally {
      setPagePending(false);
    }
  }
  async function openRecord(id: string) {
    if (pagePending || pending) return;
    const generation = recordGeneration.current;
    setPagePending(true);
    setError('');
    try {
      const result = await api('records?recordId=' + encodeURIComponent(id.trim()));
      if (generation !== recordGeneration.current) return;
      const record = result.records[0] as CaseRecord;
      const actions = RecordCapabilitiesSchema.array().parse(result.capabilities);
      setRecords((previous) => [...previous.filter((r) => r.id !== record.id), record]);
      setCapabilities((previous) => [
        ...previous.filter((c) => c.recordId !== record.id),
        ...actions,
      ]);
      setSelected(record);
      setCreating(null);
      setEditing(false);
      setView('records');
    } catch (e) {
      if (generation === recordGeneration.current) {
        setSelected(null);
        setRecords((previous) => previous.filter((r) => r.id !== id.trim()));
        setCapabilities((previous) => previous.filter((c) => c.recordId !== id.trim()));
        setError(e instanceof Error ? e.message : 'The record could not be opened.');
      }
    } finally {
      setPagePending(false);
    }
  }
  useEffect(() => {
    fetch('/api/private/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((s) => setLocal(s.localAuth === true))
      .catch(() => {});
    void refresh();
  }, []);
  async function signIn(persona: string) {
    recordGeneration.current++;
    setError('');
    setPending(true);
    try {
      const response = await fetch('/api/private/auth/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona }),
      });
      const r = await response.json();
      if (!response.ok) throw Error(r.message);
      setSelected(null);
      setCreating(null);
      setReceipt(null);
      setEditing(false);
      setNotifications([]);
      setCapabilities([]);
      retries.current.clear();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in unavailable.');
    } finally {
      setPending(false);
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!creating || pending) return;
    const form = e.currentTarget;
    setPending(true);
    setError('');
    try {
      const wf = workflow(creating);
      const input = {
        kind: creating,
        title: String(new FormData(form).get('title')),
        input: formInput(form, wf.createFields),
      };
      const result = await api('records', {
        ...input,
        idempotencyKey: requestKey('create', input),
      });
      retries.current.delete('create');
      setReceipt(result.receipt);
      setSelected(result.record);
      setCreating(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Record could not be saved.');
    } finally {
      setPending(false);
    }
  }
  async function command(e: FormEvent<HTMLFormElement>, key: string) {
    e.preventDefault();
    if (!selected || pending) return;
    const form = e.currentTarget;
    setPending(true);
    setError('');
    try {
      const wf = workflow(selected.kind);
      const fields =
        key === 'save_draft' ? wf.createFields : wf.actions.find((a) => a.key === key)!.fields;
      const input = {
        recordId: selected.id,
        action: key,
        expectedVersion: selected.version,
        input: formInput(form, fields),
      };
      const slot = `${selected.id}:${key}`;
      const result = await api('commands', { ...input, idempotencyKey: requestKey(slot, input) });
      retries.current.delete(slot);
      setReceipt(result.receipt);
      setSelected(result.record);
      setEditing(false);
      await refresh();
      form.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The action could not be completed.');
    } finally {
      setPending(false);
    }
  }
  if (loading)
    return (
      <main id="main" className="container page-content" aria-busy="true">
        <p style={{ paddingTop: 50 }}>Loading your workspace…</p>
      </main>
    );
  if (!session)
    return (
      <main id="main">
        <div className="login-card">
          <p className="eyebrow">{staff ? 'Assigned staff' : 'My Cornerstone'}</p>
          <h1>Your private workspace.</h1>
          <p className="muted">
            Protected program intake is not open. Development access is limited to synthetic local
            testing.
          </p>
          {error ? (
            <p className="error-panel" role="alert">
              {error}
            </p>
          ) : null}
          {local ? (
            <>
              <p className="hint">
                Choose an explicitly seeded synthetic persona. No real user identity or program
                authority is created.
              </p>
              <div className="persona-grid">
                {(staff
                  ? ['labor', 'commerce', 'state', 'supervisor', 'fiscal', 'adjudicator', 'support']
                  : ['participant', 'member', 'successor']
                ).map((p) => (
                  <button key={p} disabled={pending} onClick={() => void signIn(p)}>
                    {p.replaceAll('_', ' ')} · synthetic development
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p>
                Official sign-in requires an approved identity provider, independent security review
                and legal activation.
              </p>
              <a className="button button-secondary" href={publicOrigin}>
                Return to the public site
              </a>
            </>
          )}
        </div>
      </main>
    );
  const visible = workflows.filter((w) =>
    w.createRoles.some((r) => session.actor.roles.includes(r)),
  );
  const group = workflowGroups.find((g) => g.label === view);
  const receiptRecord = receipt
    ? records.find((r) => r.id === receipt.recordId) ||
      (selected?.id === receipt.recordId ? selected : null)
    : null;
  const receiptLabel =
    receipt?.action === 'create'
      ? 'Draft saved'
      : receipt?.action === 'save_draft'
        ? 'Draft changes saved'
        : receiptRecord
          ? workflow(receiptRecord.kind).actions.find((a) => a.key === receipt?.action)?.label
          : null;
  const labels = selected
    ? new Map(
        [
          ...workflow(selected.kind).actions.flatMap((a) => a.fields),
          ...workflow(selected.kind).createFields,
        ].map((f) => [f.key, f.label]),
      )
    : new Map<string, string>();
  const items = group
    ? visible.filter((w) => (group.kinds as readonly string[]).includes(w.kind))
    : visible;
  return (
    <main id="main">
      <div className="realm-banner">
        SYNTHETIC DEVELOPMENT · No real eligibility, license, ranking, payment or legal filing
      </div>
      <div className="workspace-layout">
        <aside className="workspace-sidebar">
          <p className="eyebrow">{staff ? 'Assigned staff' : 'My Cornerstone'}</p>
          <nav aria-label="Workspace navigation">
            <a
              href="#workspace"
              aria-current={view === 'home' ? 'page' : undefined}
              onClick={() => {
                setView('home');
                setSelected(null);
                setCreating(null);
              }}
            >
              Overview
            </a>
            {workflowGroups.map((g) => (
              <a
                key={g.label}
                href="#workspace"
                aria-current={view === g.label ? 'page' : undefined}
                onClick={() => {
                  setView(g.label);
                  setSelected(null);
                  setCreating(null);
                }}
              >
                {g.label}
              </a>
            ))}
            <a
              href="#workspace"
              onClick={() => {
                setView('records');
                setSelected(null);
                setCreating(null);
              }}
            >
              My records
            </a>
            <a
              href="#workspace"
              aria-current={view === 'activity' ? 'page' : undefined}
              onClick={() => {
                setView('activity');
                setSelected(null);
                setCreating(null);
              }}
            >
              Activity
              {notifications.some((n) => !n.readAt)
                ? ` (${notifications.filter((n) => !n.readAt).length} unread)`
                : ''}
            </a>
            <a
              href="#workspace"
              aria-current={view === 'memberships' ? 'page' : undefined}
              onClick={() => {
                setView('memberships');
                setSelected(null);
                setCreating(null);
              }}
            >
              Membership & votes
            </a>
            <a
              href="#workspace"
              aria-current={view === 'account' ? 'page' : undefined}
              onClick={() => {
                setView('account');
                setSelected(null);
                setCreating(null);
              }}
            >
              Account & access
            </a>
          </nav>
        </aside>
        <section className="workspace-main" id="workspace">
          <div className="session-strip">
            <span>
              {session.actor.roles.join(', ')} · {session.actor.realm}
            </span>
            <button
              className="quiet-button"
              onClick={async () => {
                recordGeneration.current++;
                try {
                  await api('auth/logout', {});
                  recordGeneration.current++;
                  setSession(null);
                  setRecords([]);
                  setNotifications([]);
                  setCapabilities([]);
                  setView('home');
                  setSelected(null);
                  setCreating(null);
                  setReceipt(null);
                  setNextCursor(null);
                  setRecordReference('');
                  setRecordSearch('');
                  retries.current.clear();
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Sign out
            </button>
          </div>
          {error ? (
            <p className="error-panel" role="alert">
              {error}
            </p>
          ) : null}
          {view === 'activity' && !selected && !creating && (
            <section className="activity-inbox">
              <p className="eyebrow">Your workspace</p>
              <h1>Activity updates.</h1>
              <p className="muted">
                These updates report record changes. They are not legal service and do not start a
                legal response deadline.
              </p>
              <button
                className="button button-secondary"
                disabled={pending}
                onClick={() => void refresh()}
              >
                Refresh updates
              </button>
              {notifications.length ? (
                <ol className="activity-list">
                  {notifications.map((n) => {
                    const record = records.find((r) => r.id === n.recordId);
                    const label =
                      n.action === 'create'
                        ? 'Draft saved'
                        : n.action === 'save_draft'
                          ? 'Draft changes saved'
                          : record
                            ? workflow(record.kind).actions.find((a) => a.key === n.action)?.label
                            : null;
                    return (
                      <li className="activity-card" key={n.id}>
                        <p className="eyebrow">{n.readAt ? 'Read' : 'Unread'} · simulation</p>
                        <h2>{record?.title || 'Record update'}</h2>
                        <p>
                          {label || 'Record changed'} · version {n.version}
                        </p>
                        <p className="hint">{new Date(n.createdAt).toLocaleString()}</p>
                        <div className="record-actions">
                          <button
                            className="button button-secondary"
                            disabled={pagePending || pending}
                            onClick={() => void openRecord(n.recordId)}
                          >
                            Open record
                          </button>
                          {!n.readAt && (
                            <button
                              className="quiet-button"
                              disabled={pending}
                              onClick={async () => {
                                setPending(true);
                                setError('');
                                try {
                                  await api('notifications/read', { ids: [n.id] });
                                  await refresh();
                                } catch (e) {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : 'Update could not be marked read.',
                                  );
                                } finally {
                                  setPending(false);
                                }
                              }}
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="info-card">
                  <h2>No activity updates yet.</h2>
                  <p>Your records and their version history remain available.</p>
                </div>
              )}
            </section>
          )}
          {view === 'account' && !selected && !creating && (
            <AccountPanel actorId={session.actor.id} api={api} />
          )}
          {view === 'memberships' && !selected && !creating && (
            <MembershipPanel
              records={records}
              api={api}
              onRefresh={refresh}
              onOpen={(id) => void openRecord(id)}
            />
          )}
          {receipt ? (
            <div className="receipt" role="status">
              <strong>Simulation receipt · version {receipt.version}</strong>
              <p>
                {receiptLabel || receipt.action.replaceAll('_', ' ')} ·{' '}
                {new Date(receipt.acceptedAt).toLocaleString()}
              </p>
              <p>{receipt.id}</p>
              <button
                className="quiet-button"
                onClick={() => download(receipt, 'cornerstone-simulation-receipt.json')}
              >
                Download receipt
              </button>
              <button className="quiet-button" onClick={() => setReceipt(null)}>
                Dismiss
              </button>
            </div>
          ) : null}
          {creating ? (
            <>
              <div className="workspace-heading">
                <div>
                  <p className="eyebrow">New synthetic record</p>
                  <h1>{workflow(creating).label}</h1>
                  <p>{workflow(creating).description}</p>
                </div>
                <button className="quiet-button" onClick={() => setCreating(null)}>
                  Cancel
                </button>
              </div>
              <PreparationGuide kind={creating} />
              <form className="form-stack action-panel" onSubmit={create}>
                <div className="field">
                  <label htmlFor="record-title">Record title</label>
                  <input id="record-title" name="title" required minLength={3} maxLength={160} />
                </div>
                <WorkflowFields
                  fields={workflow(creating).createFields}
                  prefix="create"
                  records={records}
                />
                <button className="button" disabled={pending}>
                  Save synthetic draft
                </button>
              </form>
            </>
          ) : selected ? (
            <div className="record-view" key={selected.id}>
              <div className="workspace-heading">
                <div>
                  <p className="eyebrow">
                    {workflow(selected.kind).label} · Version {selected.version}
                  </p>
                  <h1>{selected.title}</h1>
                  <span className="badge">{selected.state.replaceAll('_', ' ')}</span>
                </div>
                <button className="quiet-button" onClick={() => setSelected(null)}>
                  Back to records
                </button>
              </div>
              <RecordNextStep record={selected} />
              <SuccessionSummary record={selected} />
              <div className="record-links">
                {selected.state === 'draft' && permitted.includes('save_draft') ? (
                  <button className="button button-secondary" onClick={() => setEditing(!editing)}>
                    {editing ? 'Cancel editing' : 'Edit draft'}
                  </button>
                ) : null}
                <button
                  className="button button-secondary"
                  onClick={() => download(selected, 'cornerstone-synthetic-record.json')}
                >
                  Export record
                </button>
                <button className="quiet-button" onClick={() => window.print()}>
                  Print record
                </button>
                <button
                  className="quiet-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(selected.id);
                    } catch {
                      setError('Record ID: ' + selected.id);
                    }
                  }}
                >
                  Copy record ID
                </button>
              </div>
              {editing ? (
                <form
                  key={`${selected.id}:${selected.version}`}
                  className="action-panel form-stack"
                  onSubmit={(e) => void command(e, 'save_draft')}
                >
                  <h2>Continue your draft</h2>
                  <p className="muted">
                    Saving preserves the previous version and creates a new receipt. It does not
                    submit the record for review.
                  </p>
                  <WorkflowFields
                    fields={workflow(selected.kind).createFields}
                    prefix="edit"
                    values={selected.data}
                    records={records}
                    record={selected}
                    api={api}
                  />
                  <button className="button" disabled={pending}>
                    {pending ? 'Saving…' : 'Save draft changes'}
                  </button>
                </form>
              ) : null}
              {selected.kind === 'financial_schedule' && (
                <CalculationSummary value={selected.data['calculation']} />
              )}
              <details className="saved-details" open>
                <summary>Saved details</summary>
                <dl className="record-data">
                  {Object.entries(selected.data)
                    .filter(
                      ([k]) =>
                        ![
                          'history',
                          'rollDigest',
                          'lastBallotCommitment',
                          'lastScaleCommitment',
                        ].includes(k),
                    )
                    .map(([k, v]) => (
                      <div key={k} style={{ display: 'contents' }}>
                        <dt>
                          {labels.get(k) ||
                            (
                              {
                                unitCount: 'Founding-unit count',
                                votesCast: 'Ballots received',
                                notCast: 'Units that did not vote',
                                rollClosedAt: 'Founding roll closed',
                              } as Record<string, string>
                            )[k] ||
                            k.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ')}
                        </dt>
                        <dd>
                          {(k === 'units' || k === 'representedEvents') && Array.isArray(v) ? (
                            <details>
                              <summary>
                                Inspect {v.length}{' '}
                                {k === 'units' ? 'founding entries' : 'represented events'}
                              </summary>
                              <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                {JSON.stringify(v, null, 2)}
                              </pre>
                            </details>
                          ) : ['schedule', 'calculation', 'financialTerms'].includes(k) &&
                            typeof v === 'object' ? (
                            <details>
                              <summary>
                                Inspect saved {k === 'financialTerms' ? 'financial terms' : k}
                              </summary>
                              <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                {JSON.stringify(v, null, 2)}
                              </pre>
                            </details>
                          ) : isRecordReference(k) ? (
                            records.find((r) => r.id === v)?.title || String(v)
                          ) : k === 'evidenceIds' && Array.isArray(v) ? (
                            `${v.length} supporting attachment${v.length === 1 ? '' : 's'} · inspect below`
                          ) : k === 'earnedIncomeShare' && typeof v === 'number' ? (
                            `${Math.round(v * 10000) / 100}% of earned income before the action`
                          ) : typeof v === 'boolean' ? (
                            v ? (
                              'Yes'
                            ) : (
                              'No'
                            )
                          ) : typeof v === 'object' ? (
                            JSON.stringify(v, null, 2)
                          ) : (
                            String(v)
                          )}
                        </dd>
                      </div>
                    ))}
                </dl>
              </details>
              {selected.kind === 'association' && (
                <FoundingConsentPanel
                  record={selected}
                  actorId={session.actor.id}
                  api={api}
                  onChanged={async (result) => {
                    setReceipt(result.receipt);
                    setSelected(result.record);
                    await refresh();
                  }}
                />
              )}
              {selected.kind === 'resolution' && (
                <MemberBallotPanel
                  record={selected}
                  canVote={permitted.includes('record_vote')}
                  api={api}
                  onChanged={async (result) => {
                    setReceipt(result.receipt);
                    setSelected(result.record);
                    await refresh();
                  }}
                />
              )}
              <div className="record-evidence">
                {!['sealed_ranking', 'draw', 'round'].includes(selected.kind) && (
                  <EvidencePanel
                    record={selected}
                    actorId={session.actor.id}
                    canAttach={permitted.includes('attach_evidence')}
                    api={api}
                    onChanged={async (result) => {
                      setReceipt(result.receipt);
                      setSelected(result.record);
                      setEditing(false);
                      await refresh();
                    }}
                  />
                )}
              </div>
              <div className="workflow-actions">
                {workflow(selected.kind)
                  .actions.filter(
                    (a) =>
                      a.from.includes(selected.state) &&
                      permitted.includes(a.key) &&
                      !(selected.kind === 'resolution' && a.key === 'record_vote'),
                  )
                  .map((a) => {
                    const unavailable = actionUnavailable(selected.kind, a.key);
                    if (unavailable)
                      return (
                        <section
                          className="action-panel"
                          key={a.key}
                          aria-labelledby={`unavailable-${a.key}`}
                        >
                          <h2 id={`unavailable-${a.key}`}>{a.label}</h2>
                          <p>
                            <strong>Not available in this release</strong>
                          </p>
                          <p>{unavailable.message}</p>
                          <p className="hint">
                            You can keep preparing this synthetic record. This action cannot be
                            submitted, and no completed action or external acceptance is recorded.
                          </p>
                        </section>
                      );
                    const form = (
                      <form
                        key={`${a.key}:${selected.version}`}
                        className="action-panel form-stack"
                        onSubmit={(e) => void command(e, a.key)}
                      >
                        <h2>{a.label}</h2>
                        <p className="muted">{a.help}</p>
                        <WorkflowFields
                          fields={a.fields}
                          prefix={a.key}
                          records={records}
                          record={selected}
                          api={api}
                          values={{
                            evidenceIds: selected.data['evidenceIds'],
                            ...(a.key === 'correct' ? { schedule: selected.data['schedule'] } : {}),
                          }}
                        />
                        <button className="button" disabled={pending}>
                          {pending ? 'Submitting…' : a.label}
                        </button>
                      </form>
                    );
                    return selected.kind === 'financial_schedule' && a.key === 'correct' ? (
                      <details className="saved-details" key={`${a.key}:${selected.version}`}>
                        <summary>Prepare a calculation correction</summary>
                        {form}
                      </details>
                    ) : (
                      form
                    );
                  })}
              </div>
              {selected.kind === 'resolution' && !!selected.data['rollDigest'] && (
                <details className="action-panel" style={{ marginTop: 25 }}>
                  <summary>Vote verification details</summary>
                  <p className="hint">
                    These fingerprints bind the frozen roll and most recently received ballot. They
                    do not reveal individual choices.
                  </p>
                  <dl className="record-data">
                    <dt>Frozen roll fingerprint</dt>
                    <dd>{String(selected.data['rollDigest'])}</dd>
                    {!!selected.data['lastBallotCommitment'] && (
                      <>
                        <dt>Latest ballot commitment</dt>
                        <dd>{String(selected.data['lastBallotCommitment'])}</dd>
                      </>
                    )}
                  </dl>
                </details>
              )}
              <details className="action-panel" style={{ marginTop: 25 }}>
                <summary>Version history</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                  {JSON.stringify(selected.data['history'] || [], null, 2)}
                </pre>
              </details>
              {selected.ownerId === session.actor.id &&
                (draftAccessKinds as readonly string[]).includes(selected.kind) && (
                  <DraftAccessPanel
                    key={selected.id}
                    record={selected}
                    api={api}
                    onChanged={async (result) => {
                      setReceipt(result.receipt);
                      setSelected(result.record);
                      setEditing(false);
                      await refresh();
                    }}
                  />
                )}
            </div>
          ) : ['activity', 'account', 'memberships'].includes(view) ? null : (
            <>
              <div className="workspace-heading">
                <div>
                  <p className="eyebrow">A place to move forward</p>
                  <h1>
                    {view === 'home'
                      ? 'Your next step, made clear.'
                      : view === 'records'
                        ? 'Your records'
                        : view}
                  </h1>
                  <p>
                    Every saved action has a version and a receipt. Simulation results have no
                    official effect. Enter invented development information only.
                  </p>
                </div>
              </div>
              {view === 'home' ? (
                <div className="metric-grid">
                  <div className="metric-card">
                    <div className="label">Loaded simulation records</div>
                    <div className="value">
                      {records.length}
                      {nextCursor ? '+' : ''}
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="label">Your role</div>
                    <div className="value" style={{ fontSize: 20 }}>
                      {session.actor.roles[0]}
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="label">Program status</div>
                    <div className="value" style={{ fontSize: 20 }}>
                      Not activated
                    </div>
                  </div>
                </div>
              ) : null}
              {view === 'home' || view === 'records' ? (
                <section className="workspace-section">
                  <h2>{staff ? 'Assigned records' : 'Continue where you left off'}</h2>
                  {records.length > 0 && (
                    <div className="field record-search">
                      <label htmlFor="record-search">Find a record</label>
                      <input
                        id="record-search"
                        type="search"
                        value={recordSearch}
                        onChange={(e) => setRecordSearch(e.target.value)}
                        placeholder="Search by title, type or status"
                      />
                      <span className="hint">
                        Search the {records.length} records loaded here.{' '}
                        {nextCursor ? 'Load older records to extend your search.' : ''}
                      </span>
                    </div>
                  )}
                  <div className="task-list">
                    {records.length ? (
                      records
                        .filter((r) =>
                          `${r.title} ${workflow(r.kind).label} ${r.state.replaceAll('_', ' ')}`
                            .toLowerCase()
                            .includes(recordSearch.trim().toLowerCase()),
                        )
                        .map((r) => (
                          <article className="task-card" key={r.id}>
                            <div>
                              <span className="badge">{r.state.replaceAll('_', ' ')}</span>
                              <h2>{r.title}</h2>
                              <p>
                                {workflow(r.kind).label} · v{r.version}
                              </p>
                            </div>
                            <button
                              className="button button-secondary"
                              disabled={pagePending || pending}
                              onClick={() => void openRecord(r.id)}
                            >
                              Open
                            </button>
                          </article>
                        ))
                    ) : (
                      <p className="muted">
                        No accessible records yet. Start a synthetic draft below.
                      </p>
                    )}
                  </div>
                  {records.length > 0 &&
                    !records.some((r) =>
                      `${r.title} ${workflow(r.kind).label} ${r.state.replaceAll('_', ' ')}`
                        .toLowerCase()
                        .includes(recordSearch.trim().toLowerCase()),
                    ) && (
                      <p role="status">
                        No loaded records match this search.
                        {nextCursor ? ' Older records are still available.' : ''}
                      </p>
                    )}
                  <div className="record-actions" aria-busy={pagePending}>
                    {nextCursor && (
                      <button
                        className="button button-secondary"
                        disabled={pagePending || pending}
                        onClick={() => void loadOlderRecords()}
                      >
                        {pagePending ? 'Loading…' : 'Load older records'}
                      </button>
                    )}
                    <button
                      className="quiet-button"
                      disabled={pagePending || pending}
                      onClick={() => void refresh()}
                    >
                      Refresh recent records
                    </button>
                  </div>
                  <details className="record-reference">
                    <summary>Open a record by reference</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void openRecord(recordReference);
                      }}
                    >
                      <div className="field">
                        <label htmlFor="record-reference">Record reference</label>
                        <input
                          id="record-reference"
                          required
                          value={recordReference}
                          onChange={(e) => setRecordReference(e.target.value)}
                        />
                        <span className="hint">
                          Use the record ID from a receipt or invitation. A reference does not grant
                          access.
                        </span>
                      </div>
                      <button className="button button-secondary" disabled={pagePending || pending}>
                        Open reference
                      </button>
                    </form>
                  </details>
                </section>
              ) : null}
              <section className="workspace-section">
                <h2>Start a new record</h2>
                <div className="workflow-catalog">
                  {items.map((w) => (
                    <article className="workflow-card" key={w.kind}>
                      <h3>{w.label}</h3>
                      <p>{w.description}</p>
                      <button
                        className="button button-secondary"
                        onClick={() => {
                          setCreating(w.kind);
                          setError('');
                        }}
                      >
                        Start draft
                      </button>
                    </article>
                  ))}
                </div>
              </section>
              <aside className="notice">
                <div>
                  <strong>Protected functions remain gated.</strong>
                  <p>
                    Protected evidence storage, independently sealed rankings, Treasury transfers,
                    court filing and protected production identity require reviewed integrations. A
                    disabled provider never issues a fake success receipt.
                  </p>
                </div>
              </aside>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
