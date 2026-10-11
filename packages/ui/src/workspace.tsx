'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ActivityNotificationSchema,
  type ActivityNotification,
  type Actor,
  type CaseRecord,
  type Kind,
  type Receipt,
} from '@cornerstone/contracts';
import { workflows, workflowGroups, workflow, type Field } from '@cornerstone/domain';
import { StructuredField, listFields } from './structured-field.js';

type Session = { actor: Actor; csrf: string; mode: string; local: boolean };
export function WorkflowFields({
  fields,
  prefix,
  values = {},
}: {
  fields: Field[];
  prefix: string;
  values?: Record<string, unknown>;
}) {
  return (
    <>
      {fields.map((f) =>
        f.type === 'json' ? (
          <StructuredField key={f.key} field={f} prefix={prefix} value={values[f.key]} />
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
  const retries = useRef(new Map<string, { input: string; key: string }>());
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
        setSession(null);
        setRecords([]);
        setNotifications([]);
        setSelected(null);
        setReceipt(null);
      }
      throw Error(data.message || 'The request could not be completed.');
    }
    return data;
  }
  async function refresh() {
    try {
      const me = await api('me');
      setSession(me);
      const list = await api('records');
      setRecords(list.records);
      const inbox = await api('notifications');
      setNotifications(ActivityNotificationSchema.array().parse(inbox.notifications));
      return list.records as CaseRecord[];
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unavailable');
      return [];
    } finally {
      setLoading(false);
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
                  : ['participant', 'member']
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
          ...workflow(selected.kind).createFields,
          ...workflow(selected.kind).actions.flatMap((a) => a.fields),
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
                try {
                  await api('auth/logout', {});
                  setSession(null);
                  setRecords([]);
                  setNotifications([]);
                  setSelected(null);
                  setCreating(null);
                  setReceipt(null);
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
                            disabled={!record}
                            onClick={() => {
                              if (record) {
                                setSelected(record);
                                setView('records');
                              }
                            }}
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
              <form className="form-stack action-panel" onSubmit={create}>
                <div className="field">
                  <label htmlFor="record-title">Record title</label>
                  <input id="record-title" name="title" required minLength={3} maxLength={160} />
                </div>
                <WorkflowFields fields={workflow(creating).createFields} prefix="create" />
                <button className="button" disabled={pending}>
                  Save synthetic draft
                </button>
              </form>
            </>
          ) : selected ? (
            <>
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
              <div className="record-links">
                {selected.state === 'draft' &&
                workflow(selected.kind).createRoles.some((r) => session.actor.roles.includes(r)) ? (
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
                  />
                  <button className="button" disabled={pending}>
                    {pending ? 'Saving…' : 'Save draft changes'}
                  </button>
                </form>
              ) : null}
              <dl className="record-data">
                {Object.entries(selected.data)
                  .filter(([k]) => k !== 'history')
                  .map(([k, v]) => (
                    <div key={k} style={{ display: 'contents' }}>
                      <dt>
                        {labels.get(k) ||
                          k.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ')}
                      </dt>
                      <dd>
                        {typeof v === 'boolean'
                          ? v
                            ? 'Yes'
                            : 'No'
                          : typeof v === 'object'
                            ? JSON.stringify(v, null, 2)
                            : String(v)}
                      </dd>
                    </div>
                  ))}
              </dl>
              <div className="workflow-actions">
                {workflow(selected.kind)
                  .actions.filter(
                    (a) =>
                      a.from.includes(selected.state) &&
                      a.roles.some((r) => session.actor.roles.includes(r)),
                  )
                  .map((a) => (
                    <form
                      key={a.key}
                      className="action-panel form-stack"
                      onSubmit={(e) => void command(e, a.key)}
                    >
                      <h2>{a.label}</h2>
                      <p className="muted">{a.help}</p>
                      <WorkflowFields fields={a.fields} prefix={a.key} />
                      <button className="button" disabled={pending}>
                        {pending ? 'Submitting…' : a.label}
                      </button>
                    </form>
                  ))}
              </div>
              <details className="action-panel" style={{ marginTop: 25 }}>
                <summary>Version history</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                  {JSON.stringify(selected.data['history'] || [], null, 2)}
                </pre>
              </details>
            </>
          ) : view === 'activity' ? null : (
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
                    <div className="label">Accessible simulation records</div>
                    <div className="value">{records.length}</div>
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
                  <div className="task-list">
                    {records.length ? (
                      records.map((r) => (
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
                            onClick={() => {
                              setSelected(r);
                              setEditing(false);
                              setError('');
                            }}
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
                    Evidence storage, independently sealed rankings, Treasury transfers, court
                    filing and protected production identity require reviewed integrations. A
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
