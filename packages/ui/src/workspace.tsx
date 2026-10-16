'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityPageSchema,
  ActivityReadResultSchema,
  draftAccessKinds,
  RecordCapabilitiesSchema,
  RecordSchema,
  type RecordCapabilities,
  type ActivityNotification,
  type Actor,
  type CaseRecord,
  type Kind,
  type Receipt,
} from '@cornerstone/contracts';
import { workflows, workflowGroups, workflow, actionUnavailable } from '@cornerstone/domain';
import { AccountPanel } from './account.js';
import { DraftAccessPanel } from './draft-access.js';
import { EvidencePanel } from './evidence.js';
import { MembershipPanel, FoundingConsentPanel, MemberBallotPanel } from './membership.js';
import { isRecordReference } from './record-fields.js';
import { PreparationGuide, RecordNextStep } from './journey.js';
import { CalculationSummary } from './financial-fields.js';
import { SuccessionSummary } from './succession.js';
import { ClaimSurvivalSummary } from './claim-survival.js';
import { GovernanceSummary } from './governance.js';
import { CompactSummary } from './compacts.js';
import { WorkflowAction } from './workflow-action.js';
import { DraftEditor } from './draft-editor.js';
import { RecordExporter } from './record-exporter.js';
import { ReceiptExporter } from './receipt-exporter.js';
import { RecordCreator } from './record-creator.js';
import { WorkspaceRequestError } from './draft-review.js';
export { WorkflowFields } from './workflow-fields.js';

type Session = { actor: Actor; csrf: string; mode: string; local: boolean };
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
  const [creationDefaults, setCreationDefaults] = useState<Record<string, unknown>>({});
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const evidenceBusyRef = useRef(false);
  function evidenceBusyChanged(busy: boolean) {
    evidenceBusyRef.current = busy;
    setEvidenceBusy(busy);
  }
  const [activityCursor, setActivityCursor] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activityPending, setActivityPending] = useState(false);
  const activityGeneration = useRef(0);
  const [recordSearch, setRecordSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pagePending, setPagePending] = useState(false);
  const [recordReference, setRecordReference] = useState('');
  const recordGeneration = useRef(0);
  const [capabilities, setCapabilities] = useState<RecordCapabilities[]>([]);
  const permitted = selected
    ? (capabilities.find((c) => c.recordId === selected.id && c.version === selected.version)
        ?.actions ?? [])
    : [];
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
    // Expired sessions clear private UI even if a proxy returns a non-JSON error body.
    if (response.status === 401) {
      recordGeneration.current++;
      setSession(null);
      setRecords([]);
      setNotifications([]);
      setActivityCursor(null);
      setUnreadCount(0);
      activityGeneration.current++;
      setCapabilities([]);
      setSelected(null);
      setReceipt(null);
      setNextCursor(null);
    }
    const data = await response.json();
    if (!response.ok) {
      throw new WorkspaceRequestError(
        response.status,
        typeof data?.code === 'string' ? data.code : 'REQUEST_FAILED',
        typeof data?.message === 'string' ? data.message : 'The request could not be completed.',
      );
    }
    return data;
  }
  async function refresh() {
    const generation = ++recordGeneration.current;
    activityGeneration.current++;
    try {
      const me = await api('me');
      if (generation !== recordGeneration.current) return [];
      setSession(me);
      const list = await api('records?limit=50');
      if (generation !== recordGeneration.current) return [];
      setRecords(list.records);
      setNextCursor(list.nextCursor);
      setCapabilities(RecordCapabilitiesSchema.array().parse(list.capabilities));
      const inbox = ActivityPageSchema.parse(await api('notifications'));
      if (generation !== recordGeneration.current) return [];
      setNotifications(inbox.notifications);
      setActivityCursor(inbox.nextCursor);
      setUnreadCount(inbox.unreadCount);
      return list.records as CaseRecord[];
    } catch (e) {
      if (generation === recordGeneration.current)
        setError(e instanceof Error ? e.message : 'Unavailable');
      return [];
    } finally {
      setLoading(false);
    }
  }
  async function loadOlderActivity() {
    if (!activityCursor || activityPending || pending) return;
    const generation = recordGeneration.current;
    const request = ++activityGeneration.current;
    setActivityPending(true);
    setError('');
    try {
      const page = ActivityPageSchema.parse(
        await api('notifications?cursor=' + encodeURIComponent(activityCursor)),
      );
      if (generation !== recordGeneration.current || request !== activityGeneration.current) return;
      setNotifications((previous) => [
        ...new Map([...previous, ...page.notifications].map((n) => [n.id, n])).values(),
      ]);
      setActivityCursor(page.nextCursor);
      setUnreadCount(page.unreadCount);
    } catch (e) {
      if (generation === recordGeneration.current && request === activityGeneration.current)
        setError(e instanceof Error ? e.message : 'Older activity could not be loaded.');
    } finally {
      setActivityPending(false);
    }
  }
  async function markRead(id: string) {
    if (pending || activityPending) return;
    const generation = recordGeneration.current;
    const request = ++activityGeneration.current;
    setPending(true);
    setError('');
    try {
      const result = ActivityReadResultSchema.parse(await api('notifications/read', { ids: [id] }));
      if (generation !== recordGeneration.current || request !== activityGeneration.current) return;
      const marked = new Map(result.marked.map((n) => [n.id, n.readAt]));
      setNotifications((previous) =>
        previous.map((n) => (marked.has(n.id) ? { ...n, readAt: marked.get(n.id)! } : n)),
      );
      setUnreadCount(result.unreadCount);
    } catch (e) {
      if (generation === recordGeneration.current && request === activityGeneration.current)
        setError(e instanceof Error ? e.message : 'Update could not be marked read.');
    } finally {
      setPending(false);
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
  async function confirmedAction(result: { record: CaseRecord; receipt: Receipt }) {
    // A recovered receipt describes the accepted historical version. Re-read
    // current permissions/state before presenting another workflow action.
    setReceipt(result.receipt);
    setSelected(null);
    setEditing(false);
    setPending(true);
    const generation = ++recordGeneration.current;
    try {
      const current = await api('records?recordId=' + encodeURIComponent(result.record.id));
      if (generation !== recordGeneration.current) return;
      const record = RecordSchema.parse(current.records?.[0]);
      const actions = RecordCapabilitiesSchema.array().parse(current.capabilities);
      if (
        record.id !== result.record.id ||
        record.realm !== result.record.realm ||
        record.version < result.record.version
      )
        throw Error('The current action record could not be verified.');
      setSelected(record);
      setRecords((previous) => [...previous.filter((item) => item.id !== record.id), record]);
      setCapabilities((previous) => [
        ...previous.filter((item) => item.recordId !== record.id),
        ...actions,
      ]);
    } catch {
      if (generation === recordGeneration.current)
        setError(
          'The action receipt was confirmed, but current record access could not be refreshed. Reopen the record before taking another action.',
        );
    } finally {
      setPending(false);
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
      setActivityCursor(null);
      setUnreadCount(0);
      activityGeneration.current++;
      setCapabilities([]);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in unavailable.');
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
      <main id="main" className="private-workspace">
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
    <main id="main" className="private-workspace">
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
              {unreadCount ? ` (${unreadCount} unread)` : ''}
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
                  setActivityCursor(null);
                  setUnreadCount(0);
                  activityGeneration.current++;
                  setCapabilities([]);
                  setView('home');
                  setSelected(null);
                  setCreating(null);
                  setReceipt(null);
                  setNextCursor(null);
                  setRecordReference('');
                  setRecordSearch('');
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
                disabled={pending || activityPending}
                onClick={() => void refresh()}
              >
                Refresh updates
              </button>
              <p className="hint" role="status">
                {notifications.length} loaded updates. {unreadCount} unread across your currently
                accessible activity at the latest check. Refresh to see new changes.
              </p>
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
                              disabled={pending || activityPending}
                              onClick={() => void markRead(n.id)}
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
              {activityCursor ? (
                <button
                  className="button button-secondary"
                  disabled={pending || activityPending}
                  onClick={() => void loadOlderActivity()}
                >
                  {activityPending ? 'Loading older updates...' : 'Load older updates'}
                </button>
              ) : notifications.length ? (
                <p className="hint">All available updates loaded.</p>
              ) : null}
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
            <div className="receipt">
              <strong>Simulation receipt · version {receipt.version}</strong>
              <p>
                {receiptLabel || receipt.action.replaceAll('_', ' ')} ·{' '}
                {new Date(receipt.acceptedAt).toLocaleString()}
              </p>
              <p>{receipt.id}</p>
              <ReceiptExporter
                key={receipt.id}
                receipt={receipt}
                api={api}
                disabled={pending || editing || !!creating}
              />
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
              <RecordCreator
                key={session.actor.id + ':' + session.actor.realm + ':' + creating}
                kind={creating}
                actor={session.actor}
                defaults={creationDefaults}
                records={records}
                api={api}
                disabled={pending}
                onBusyChange={setPending}
                onSaved={(result) => {
                  setReceipt(result.receipt);
                  setSelected(result.record);
                  setCreating(null);
                  setError('');
                  void refresh();
                }}
              />
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
              <CompactSummary
                record={selected}
                onOpen={(id) => void openRecord(id)}
                {...(!editing &&
                selected.kind === 'compact' &&
                selected.state === 'draft' &&
                permitted.includes('submit') &&
                session.actor.roles.includes('member')
                  ? {
                      onVote: () => {
                        setCreationDefaults({
                          title: ('Compact vote: ' + selected.title).slice(0, 160),
                          associationId: selected.data['associationId'],
                          decision: 'compact',
                          compactId: selected.id,
                          proposal:
                            'Approve only this complete compact and immutable published offer, subject to ordinary legal prerequisites and voluntary individual participation.',
                        });
                        setCreating('resolution');
                        setSelected(null);
                        setEditing(false);
                      },
                    }
                  : {})}
              />
              <GovernanceSummary
                record={selected}
                onOpen={(id) => void openRecord(id)}
                {...(!editing && selected.kind === 'opportunity' && permitted.includes('adopt_plan')
                  ? {
                      onVote: () => {
                        setCreationDefaults({
                          title: ('Plan vote: ' + selected.title).slice(0, 160),
                          associationId: selected.data['associationId'],
                          decision: 'opportunity_plan',
                          opportunityId: selected.id,
                          proposal:
                            'Adopt this exact shared planning proposal, subject to separate legal and operational prerequisites and voluntary individual participation.',
                        });
                        setCreating('resolution');
                        setSelected(null);
                        setError('');
                      },
                    }
                  : {})}
              />
              <SuccessionSummary record={selected} />
              <ClaimSurvivalSummary record={selected} onOpen={(id) => void openRecord(id)} />
              <div className="record-links">
                {selected.state === 'draft' && permitted.includes('save_draft') ? (
                  <button className="button button-secondary" onClick={() => setEditing(!editing)}>
                    {editing ? 'Cancel editing' : 'Edit draft'}
                  </button>
                ) : null}
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
              <RecordExporter
                key={'print:' + session.actor.id + ':' + selected.id + ':' + selected.version}
                record={selected}
                api={api}
                disabled={pending || editing || !!creating}
                format="print"
              />
              <RecordExporter
                key={
                  session.actor.id +
                  ':' +
                  selected.realm +
                  ':' +
                  selected.id +
                  ':' +
                  selected.version
                }
                record={selected}
                api={api}
                disabled={pending || editing || evidenceBusy}
              />
              {editing ? (
                <DraftEditor
                  key={selected.id}
                  record={selected}
                  records={records}
                  api={api}
                  disabled={pending || evidenceBusy}
                  onBusyChange={setPending}
                  onSaved={(result) => {
                    setReceipt(result.receipt);
                    setSelected(result.record);
                    setEditing(false);
                    setError('');
                    void refresh();
                  }}
                />
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
                          'opportunityBinding',
                          'compactBinding',
                          'compactApproval',
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
              {editing && (
                <p className="hint">
                  Finish or cancel draft editing before using other record actions. Closing this
                  view discards unsaved input.
                </p>
              )}
              <fieldset
                disabled={editing}
                aria-label="Other record actions"
                style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
              >
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
                      onBusyChange={evidenceBusyChanged}
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
                <div
                  className="workflow-actions"
                  aria-busy={pending || evidenceBusy}
                  style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
                >
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
                        <WorkflowAction
                          key={`${a.key}:${selected.version}`}
                          action={a}
                          record={selected}
                          records={records}
                          api={api}
                          disabled={pending || evidenceBusy}
                          onBusyChange={evidenceBusyChanged}
                          onConfirmed={(result) => {
                            void confirmedAction(result);
                          }}
                        />
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
                      These fingerprints bind the frozen roll and most recently received ballot.
                      They do not reveal individual choices.
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
              </fieldset>
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
                          setCreationDefaults({});
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
