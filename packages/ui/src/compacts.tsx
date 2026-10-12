'use client';
import { useEffect, useState } from 'react';
import {
  CommercialMenuSchema,
  CommercialTermsSchema,
  CompactBindingSchema,
  CompactApprovalSchema,
  RecordSchema,
  IdSchema,
  type CaseRecord,
} from '@cornerstone/contracts';
import type { Field } from '@cornerstone/domain';

type Api = (path: string, body?: unknown) => Promise<any>;
export function CommercialTermsEditor({
  field,
  prefix,
  value,
  records,
  offerId,
  api,
}: {
  field: Field;
  prefix: string;
  value: unknown;
  records: CaseRecord[];
  offerId: string;
  api?: Api | undefined;
}) {
  const initial = CommercialTermsSchema.safeParse(value);
  const [terms, setTerms] = useState<Record<string, string | number | boolean | null>>(
    initial.success ? initial.data : {},
  );
  const [offer, setOffer] = useState<CaseRecord | null>(null);
  const [state, setState] = useState<'choose' | 'loading' | 'ready' | 'error'>('choose');
  useEffect(() => {
    let active = true;
    setOffer(null);
    if (!IdSchema.safeParse(offerId).success) {
      setState('choose');
      return;
    }
    const local = records.find((record) => record.id === offerId);
    const accept = (record: CaseRecord) => {
      if (!active) return;
      if (
        record.kind !== 'offer' ||
        record.state !== 'published' ||
        !CommercialMenuSchema.safeParse(record.data['commercialMenu']).success
      ) {
        setState('error');
        return;
      }
      setOffer(record);
      setState('ready');
      const menu = CommercialMenuSchema.parse(record.data['commercialMenu']);
      setTerms((old) =>
        Object.fromEntries(
          Object.entries(old).filter(([key, choice]) => menu[key]?.includes(choice)),
        ),
      );
    };
    if (local) accept(local);
    else if (api) {
      setState('loading');
      void api('records?recordId=' + encodeURIComponent(offerId))
        .then((result) => accept(RecordSchema.parse(result.records[0])))
        .catch(() => {
          if (active) setState('error');
        });
    } else setState('error');
    return () => {
      active = false;
    };
  }, [offerId, records]);
  const menu = offer ? CommercialMenuSchema.safeParse(offer.data['commercialMenu']) : null;
  return (
    <fieldset className="structured-field" aria-busy={state === 'loading'}>
      <legend>{field.label}</legend>
      <input
        type="hidden"
        name={field.key}
        value={JSON.stringify(state === 'ready' ? terms : {})}
      />
      <p className="hint">
        Choose one published option for every term. No default, unpublished term or negotiated state
        rate is supplied.
      </p>
      {state === 'choose' && <p>Choose an accessible published offer first.</p>}
      {state === 'loading' && <p role="status">Loading the published menu...</p>}
      {state === 'error' && (
        <p role="alert">
          The published menu is unavailable. Choose an accessible published offer; no terms have
          been accepted.
        </p>
      )}
      {state === 'ready' && menu?.success && (
        <>
          <p>
            {offer!.title} - offer version {offer!.version}
          </p>
          {Object.entries(menu.data).map(([key, choices], index) => (
            <div className="field" key={key}>
              <label htmlFor={`${prefix}-commercial-${index}`}>{key}</label>
              <select
                id={`${prefix}-commercial-${index}`}
                required
                value={
                  Object.hasOwn(terms, key)
                    ? String(choices.findIndex((choice) => choice === terms[key]))
                    : ''
                }
                onChange={(event) =>
                  setTerms((old) => {
                    const next = { ...old };
                    if (event.target.value === '') delete next[key];
                    else next[key] = choices[Number(event.target.value)]!;
                    return next;
                  })
                }
              >
                <option value="">Choose a published option</option>
                {choices.map((choice, i) => (
                  <option value={i} key={i}>
                    {String(choice)} ({choice === null ? 'null' : typeof choice})
                  </option>
                ))}
              </select>
            </div>
          ))}
          {Object.keys(menu.data).length === 0 && (
            <p>This fixed offer has no negotiable commercial choices.</p>
          )}
        </>
      )}
    </fieldset>
  );
}
export function CompactSummary({
  record,
  onVote,
  onOpen,
}: {
  record: CaseRecord;
  onVote?: (() => void) | undefined;
  onOpen: (id: string) => void;
}) {
  const approval = CompactApprovalSchema.safeParse(record.data['compactApproval']);
  const binding = CompactBindingSchema.safeParse(
    record.kind === 'compact' && approval.success
      ? approval.data.binding
      : record.data['compactBinding'],
  );
  if (binding.success) {
    const b = binding.data,
      p = b.plan;
    return (
      <section className="action-panel" style={{ marginTop: 24 }}>
        <h2>
          {record.kind === 'resolution'
            ? 'The exact compact this vote covers'
            : 'The exact compact members approved'}
        </h2>
        <p>
          Only this complete version is approved by a yes vote. Changed commercial choices,
          financial terms, service obligations or another compact require a fresh decision.
        </p>
        {approval.success && (
          <p>
            Recorded approval: {approval.data.yes} yes votes out of all {approval.data.unitCount}{' '}
            founding units. Separate private ballots are not disclosed.
          </p>
        )}
        <h3>{p.title}</h3>
        <p>
          {p.offer.trade} - {p.offer.district}
        </p>
        <dl className="record-detail-list">
          {Object.entries(p.terms).map(([key, value]) => (
            <div key={key} style={{ display: 'contents' }}>
              <dt>{key}</dt>
              <dd>
                {String(value)} ({value === null ? 'null' : typeof value})
              </dd>
            </div>
          ))}
          <dt>Services</dt>
          <dd>{p.services}</dd>
          <dt>Launch milestones</dt>
          <dd>{p.launchMilestones}</dd>
          <dt>Public protections</dt>
          <dd>{p.publicProtections}</dd>
          <dt>Published state surplus fraction</dt>
          <dd>
            {p.offer.financialTerms.rate.numerator} / {p.offer.financialTerms.rate.denominator}
          </dd>
          <dt>Rate act and method</dt>
          <dd>
            {p.offer.financialTerms.rateActId} - {p.offer.financialTerms.version}
          </dd>
          <dt>Exclusive term</dt>
          <dd>
            {p.initialYears} years, with at most one {p.renewalYears}-year renewal under the
            separately reviewed statutory conditions.
          </dd>
        </dl>
        <p>
          No outside votes, board seats, governance veto, unit pledge or compact foreclosure right.
          A vote does not require any individual to work, relocate, invest or take on personal debt.
        </p>
        <details>
          <summary>Inspect all bound offer and compact details</summary>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {JSON.stringify(p, null, 2)}
          </pre>
        </details>
        <p className="workspace-id">
          Compact draft version {b.version} - SHA-256: {b.digest}
        </p>
        <p className="hint">
          The frozen terms are visible to current founding members. They do not grant access to the
          author's private draft or its attachments. Approval does not execute a compact or supply
          an external match, signature, permit or legal authority.
        </p>
      </section>
    );
  }
  if (record.kind !== 'compact') return null;
  return (
    <section className="action-panel" style={{ marginTop: 24 }}>
      <h2>Approval follows the exact compact terms</h2>
      <p>
        Complete the services, launch milestones, public protections and every published commercial
        choice. A majority of all founding units must approve this version before submission.
        Editing the draft invalidates earlier approval.
      </p>
      <p className="hint">
        An independently verified exchange result remains a separate prerequisite. Synthetic
        fixtures and member votes cannot supply actual legal authority or execute a compact.
      </p>
      {record.state === 'draft' && onVote && (
        <button type="button" className="button" onClick={onVote}>
          Start a vote on this compact
        </button>
      )}
      {!!record.data['approvedCompactDigest'] && (
        <>
          <p className="workspace-id">
            Approved draft SHA-256: {String(record.data['approvedCompactDigest'])}
          </p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onOpen(String(record.data['memberResolutionId']))}
          >
            Inspect the compact approval
          </button>
        </>
      )}
    </section>
  );
}
