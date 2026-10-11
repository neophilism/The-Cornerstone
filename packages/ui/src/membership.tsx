'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  MembershipSnapshotSchema,
  FoundingRollViewSchema,
  MemberBallotViewSchema,
  type MembershipSnapshot,
  type FoundingRollView,
  type MemberBallotView,
  type CaseRecord,
  type Receipt,
} from '@cornerstone/contracts';
type Api = (path: string, body?: unknown) => Promise<any>;
type Result = { record: CaseRecord; receipt: Receipt };
function CopyId({ value, label = 'Copy ID' }: { value: string; label?: string }) {
  const [message, setMessage] = useState('');
  return (
    <>
      <p className="workspace-id">{value}</p>
      <button
        className="quiet-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setMessage('Copied.');
          } catch {
            setMessage('Select and copy the ID above.');
          }
        }}
      >
        {label}
      </button>
      {message && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
    </>
  );
}
export function MembershipPanel({
  records,
  api,
  onOpen,
  onRefresh,
}: {
  records: CaseRecord[];
  api: Api;
  onOpen: (r: CaseRecord) => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [snapshot, setSnapshot] = useState<MembershipSnapshot | null>(null),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  async function refresh() {
    setPending(true);
    setError('');
    try {
      await onRefresh();
      setSnapshot(MembershipSnapshotSchema.parse(await api('memberships')));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Memberships are unavailable.');
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const invitations =
    snapshot?.invitations.filter((i) => {
      const association = records.find((r) => r.id === i.associationId);
      return !association || ['submitted', 'review'].includes(association.state);
    }) ?? [];
  return (
    <section className="membership-overview">
      <p className="eyebrow">Your association</p>
      <h1>Membership & votes.</h1>
      <p className="muted">
        Choose whether to join. An invitation creates no unit; a personal acceptance and a separate
        closed-roll finding are required. These are synthetic development records.
      </p>
      <button className="button button-secondary" disabled={pending} onClick={() => void refresh()}>
        Refresh memberships
      </button>
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      <h2>Founding invitations</h2>
      {invitations.length ? (
        <ol className="activity-list">
          {invitations.map((i) => {
            const r = records.find((r) => r.id === i.associationId);
            return (
              <li className="activity-card invitation-card" key={i.id}>
                <p className="eyebrow">{i.response} · simulation</p>
                <h3>{r?.title || 'Association invitation'}</h3>
                <p>
                  Founding period closes {i.closesOn}. Review the unchanged constitution before
                  accepting.
                </p>
                <button
                  className="button button-secondary"
                  disabled={!r}
                  onClick={() => r && onOpen(r)}
                >
                  Review association
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">No founding invitations are available.</p>
      )}
      <h2>Your founding units</h2>
      {snapshot?.units.length ? (
        <ol className="activity-list">
          {snapshot.units.map((u) => {
            const r = records.find((r) => r.id === u.associationId);
            return (
              <li className="activity-card membership-card" key={u.unitId}>
                <p className="eyebrow">Active unit · simulation</p>
                <h3>{r?.title || 'Association membership'}</h3>
                <p>
                  One vote, equal base ownership and distribution rights, and inspection rights.
                  First opportunity for funded training, qualified work or a member franchise.
                  Participation stays voluntary; work-based wages and patronage may differ.
                </p>
                <CopyId value={u.unitId} label="Copy founding unit ID" />
                <button
                  className="button button-secondary"
                  disabled={!r}
                  onClick={() => r && onOpen(r)}
                >
                  Inspect association
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">No active founding unit has been created for this workspace.</p>
      )}
      <h2>Member decisions</h2>
      {records.some((r) => r.kind === 'resolution' && ['voting', 'tallied'].includes(r.state)) ? (
        <ol className="activity-list">
          {records
            .filter((r) => r.kind === 'resolution' && ['voting', 'tallied'].includes(r.state))
            .map((r) => (
              <li className="activity-card" key={r.id}>
                <p className="eyebrow">
                  {r.state === 'voting' ? 'Voting' : 'Tallied'} · simulation
                </p>
                <h3>{r.title}</h3>
                <p>
                  {String(r.data['decision']).replaceAll('_', ' ')} · {Number(r.data['unitCount'])}{' '}
                  frozen units
                </p>
                <button className="button button-secondary" onClick={() => onOpen(r)}>
                  Review decision
                </button>
              </li>
            ))}
        </ol>
      ) : (
        <p className="muted">No open or tallied member decisions are available.</p>
      )}
    </section>
  );
}
export function FoundingConsentPanel({
  record,
  actorId,
  api,
  onChanged,
}: {
  record: CaseRecord;
  actorId: string;
  api: Api;
  onChanged: (r: Result) => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<FoundingRollView | null>(null),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [acknowledged, setAcknowledged] = useState(false),
    [scaleChoice, setScaleChoice] = useState<'yes' | 'no' | 'abstain'>('abstain'),
    [visibleResponses, setVisibleResponses] = useState(50);
  const larger = Array.isArray(record.data['units']) && record.data['units'].length > 2500;
  const generation = useRef(0),
    retry = useRef<{ input: string; key: string } | null>(null);
  async function refresh() {
    const n = ++generation.current;
    const result = FoundingRollViewSchema.parse(
      await api('memberships/roll?recordId=' + record.id),
    );
    if (n === generation.current) {
      setSnapshot(result);
      setScaleChoice(
        result.invitations.find((i) => i.personId === actorId)?.ownScaleChoice ?? 'abstain',
      );
    }
  }
  useEffect(() => {
    void refresh().catch(() => setError('Founding responses are unavailable.'));
    return () => {
      generation.current++;
    };
  }, [record.id, record.version]);
  const own = snapshot?.invitations.find((i) => i.personId === actorId),
    canRespond =
      own &&
      ['submitted', 'review'].includes(record.state) &&
      own.closesOn >= new Date().toISOString().slice(0, 10);
  async function respond(response: 'accepted' | 'declined') {
    if (!own || pending) return;
    setPending(true);
    setError('');
    try {
      const input = {
        recordId: record.id,
        invitationId: own.id,
        expectedVersion: record.version,
        response,
        rightsAcknowledged: response === 'accepted' && acknowledged,
        ...(larger ? { scaleChoice } : {}),
      };
      const encoded = JSON.stringify(input);
      if (retry.current?.input !== encoded)
        retry.current = { input: encoded, key: crypto.randomUUID() };
      await onChanged(
        await api('memberships/respond', { ...input, idempotencyKey: retry.current.key }),
      );
      retry.current = null;
      setAcknowledged(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your response could not be saved.');
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="action-panel founding-consent" style={{ marginTop: 25 }}>
      <h2>Voluntary founding membership</h2>
      <p className="muted">
        Each person chooses for themselves. No one must relocate, retrain, work for the enterprise,
        contribute capital or take personal debt. A declined or unanswered invitation cannot create
        a founding unit.
      </p>
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      {own && <p className="badge">Your response: {own.response}</p>}
      {larger && own?.ownScaleChoice && <p>Your recorded scale choice: {own.ownScaleChoice}</p>}
      {canRespond && (
        <>
          <p>
            Review the member rights and governance above. Founding consent is bound to this
            association, its event, roll and constitution.
          </p>
          <div className="check-field">
            <input
              id="founding-rights"
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <label htmlFor="founding-rights">
              I voluntarily accept these unchanged terms, with one vote, equal base ownership and
              distribution rights, inspection rights and first opportunity for funded training,
              qualified work or a member franchise.
            </label>
          </div>
          {larger && (
            <fieldset className="structured-field">
              <legend>Should this association have more than 2,500 founders?</legend>
              <p className="hint">
                This is separate from accepting membership. Approval needs more than half of all
                proposed founders and written Labor findings about accessible participation. Your
                personal choice stays outside the shared record.
              </p>
              {(['yes', 'no', 'abstain'] as const).map((choice) => (
                <div className="check-field" key={choice}>
                  <input
                    id={`scale-${choice}`}
                    type="radio"
                    name="scaleChoice"
                    value={choice}
                    checked={scaleChoice === choice}
                    onChange={() => setScaleChoice(choice)}
                  />
                  <label htmlFor={`scale-${choice}`}>
                    {choice === 'yes'
                      ? 'Yes, approve this scale'
                      : choice === 'no'
                        ? 'No, do not approve this scale'
                        : 'Abstain from the scale decision'}
                  </label>
                </div>
              ))}
            </fieldset>
          )}
          <div className="record-actions">
            <button
              className="button"
              disabled={pending || !acknowledged || own.response === 'accepted'}
              onClick={() => void respond('accepted')}
            >
              Accept founding invitation
            </button>
            {larger && own.response === 'accepted' && (
              <button
                className="button button-secondary"
                disabled={pending || !acknowledged || own.ownScaleChoice === scaleChoice}
                onClick={() => void respond('accepted')}
              >
                Save scale choice
              </button>
            )}
            <button
              className="button button-secondary"
              disabled={pending || own.response === 'declined'}
              onClick={() => void respond('declined')}
            >
              {own.response === 'accepted'
                ? 'Withdraw founding consent'
                : 'Decline founding invitation'}
            </button>
          </div>
          <p className="hint">
            You can change your response during the founding period before the roll closes. An
            accepted invitation still requires eligibility and a separate closed-roll finding.
          </p>
        </>
      )}
      {snapshot?.fullRoll && snapshot.invitations.length > 0 && (
        <details>
          <summary>
            Founding responses (
            {snapshot.invitations.filter((i) => i.response === 'accepted').length} of{' '}
            {snapshot.invitations.length} accepted)
          </summary>
          <ol className="activity-list">
            {snapshot.invitations.slice(0, visibleResponses).map((i) => (
              <li className="activity-card" key={i.id}>
                <p className="eyebrow">
                  {i.response} · closes {i.closesOn}
                </p>
                <p className="workspace-id">Person {i.personId}</p>
                <p className="workspace-id">Claim {i.claimId}</p>
              </li>
            ))}
          </ol>
          {visibleResponses < snapshot.invitations.length && (
            <button
              className="button button-secondary"
              onClick={() => setVisibleResponses((n) => n + 50)}
            >
              Show 50 more responses
            </button>
          )}
        </details>
      )}
      {!own && !snapshot?.fullRoll && (
        <p className="hint">
          This workspace has no personal founding invitation for this association.
        </p>
      )}
    </section>
  );
}
export function MemberBallotPanel({
  record,
  canVote,
  api,
  onChanged,
}: {
  record: CaseRecord;
  canVote: boolean;
  api: Api;
  onChanged: (r: Result) => Promise<void>;
}) {
  const [view, setView] = useState<MemberBallotView | null>(null),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const generation = useRef(0),
    retry = useRef<{ input: string; key: string } | null>(null);
  async function refresh() {
    const n = ++generation.current,
      result = MemberBallotViewSchema.parse(await api('governance?recordId=' + record.id));
    if (n === generation.current) setView(result);
  }
  useEffect(() => {
    void refresh().catch(() => setError('Voting details are unavailable.'));
    return () => {
      generation.current++;
    };
  }, [record.id, record.version]);
  const unit = view?.ownUnits.find((id) => !view.ownBallots.some((b) => b.unitId === id)),
    open =
      canVote &&
      record.state === 'voting' &&
      unit &&
      view?.closesOn &&
      view.closesOn >= new Date().toISOString().slice(0, 10);
  async function vote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!unit || pending) return;
    const form = e.currentTarget;
    setPending(true);
    setError('');
    try {
      const input = {
        recordId: record.id,
        expectedVersion: record.version,
        action: 'record_vote',
        input: { unitId: unit, choice: String(new FormData(form).get('choice')) },
      };
      const encoded = JSON.stringify(input);
      if (retry.current?.input !== encoded)
        retry.current = { input: encoded, key: crypto.randomUUID() };
      await onChanged(await api('commands', { ...input, idempotencyKey: retry.current.key }));
      retry.current = null;
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your ballot could not be saved.');
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="action-panel member-ballot" style={{ marginTop: 25 }}>
      <h2>Your member vote</h2>
      <p className="muted">
        Approval requires more than half of all frozen founding units. Abstentions and units that do
        not vote remain in that total. Review the exact proposal above.
      </p>
      {view?.unitCount && (
        <p>
          {view.unitCount} frozen units · closes {view.closesOn} (UTC calendar date)
        </p>
      )}
      <p className="hint">
        Other members cannot read your choice. Authorized reviewers can inspect stored ballots. This
        development vote has no legal effect.
      </p>
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      {open && (
        <form className="form-stack" onSubmit={vote}>
          <div className="field">
            <label htmlFor="member-choice">Your vote</label>
            <select id="member-choice" name="choice" defaultValue="" required>
              <option value="">Choose your vote</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="abstain">Abstain</option>
            </select>
          </div>
          <p className="hint">One ballot per founding unit. A saved ballot cannot be replaced.</p>
          <button className="button" disabled={pending}>
            Save my ballot
          </button>
        </form>
      )}
      {view?.ownBallots.map((b) => (
        <div className="receipt own-ballot" key={b.unitId}>
          <strong>Your saved ballot: {b.choice}</strong>
          <p>Receipt</p>
          <p className="workspace-id">{b.receiptId}</p>
          <p className="hint">
            The receipt and stored ballot are bound to this resolution and founding unit.
          </p>
        </div>
      ))}
      {!view?.ownUnits.length && (
        <p className="hint">This workspace holds no active founding unit in this association.</p>
      )}
      {record.state === 'tallied' && (
        <p className="badge">
          {record.data['approved'] === true ? 'Approved' : 'Not approved'} ·{' '}
          {Number(record.data['yes'])} yes of {Number(record.data['unitCount'])} units
        </p>
      )}
    </section>
  );
}
