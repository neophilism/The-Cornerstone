'use client';
import { useEffect, useRef, useState } from 'react';
import {
  IdSchema,
  PublishedStateOfferSchema,
  PublishedStateOfferViewSchema,
  StateAuthorityVerificationSchema,
  StateOfferBindingSchema,
  type CaseRecord,
  type PublishedStateOffer,
  type PublishedStateOfferView,
} from '@cornerstone/contracts';

type Api = (path: string, body?: unknown) => Promise<any>;
export function PublishedOfferDetails({ publication: p }: { publication: PublishedStateOffer }) {
  return (
    <>
      <dl className="record-data">
        <dt>Trade and district</dt>
        <dd>
          {p.trade} · {p.district}
        </dd>
        <dt>Prospective state fraction</dt>
        <dd>
          {p.financialTerms.rate.numerator} / {p.financialTerms.rate.denominator}
        </dd>
        <dt>Rate Act and common method</dt>
        <dd>
          {p.financialTerms.rateActId} · {p.financialTerms.version}
        </dd>
        <dt>Term</dt>
        <dd>
          {p.initialYears} years; at most one {p.renewalYears}-year renewal under the separate
          statutory conditions.
        </dd>
        <dt>Technical and financial readiness</dt>
        <dd>{p.readinessSummary}</dd>
        <dt>Service obligations</dt>
        <dd>{p.serviceObligations}</dd>
        <dt>Launch requirements</dt>
        <dd>{p.launchRequirements}</dd>
        <dt>Regulatory and tax terms</dt>
        <dd>{p.regulatoryTerms}</dd>
        <dt>Public protections</dt>
        <dd>{p.publicProtections}</dd>
        <dt>Federal authority reference</dt>
        <dd>{p.federalAuthority}</dd>
        <dt>Disclosed findings</dt>
        <dd>{p.publicFindings}</dd>
        <dt>Authority packet</dt>
        <dd>
          Version {p.authority.version} · {p.authority.id}
        </dd>
        <dt>Enactment reference</dt>
        <dd>{p.authority.enactmentReference}</dd>
        <dt>Public appointment reference</dt>
        <dd>{p.authority.appointmentReference}</dd>
        <dt>Public fiscal report reference</dt>
        <dd>{p.authority.fiscalReportReference}</dd>
        <dt>Supervision resources</dt>
        <dd>{p.authority.supervisionResources}</dd>
        <dt>Recorded authority period</dt>
        <dd>
          {p.authority.effectiveFrom} through {p.authority.validThrough}
        </dd>
        <dt>Recorded final rules publication</dt>
        <dd>{p.authority.rulesPublishedDate}</dd>
        <dt>Synthetic publication accepted</dt>
        <dd>{p.publishedAt}</dd>
        <dt>Earliest ranking close under this preparation</dt>
        <dd>{p.earliestRankingsCloseAt}</dd>
      </dl>
      <h4>Fixed commercial menu</h4>
      {Object.keys(p.commercialMenu).length ? (
        <dl className="record-data">
          {Object.entries(p.commercialMenu).map(([term, choices]) => (
            <div key={term} style={{ display: 'contents' }}>
              <dt>{term}</dt>
              <dd>
                {choices
                  .map(
                    (choice) => `${String(choice)} (${choice === null ? 'null' : typeof choice})`,
                  )
                  .join(' · ')}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>This offer has no negotiable commercial choices.</p>
      )}
      <details>
        <summary>Inspect the complete disclosed snapshot</summary>
        <pre className="structured-value">{JSON.stringify(p, null, 2)}</pre>
      </details>
    </>
  );
}
export function PublishedOffers({ api }: { api: Api }) {
  const [offers, setOffers] = useState<PublishedStateOfferView[]>([]),
    [next, setNext] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const generation = useRef(0);
  async function load(after?: string) {
    const current = ++generation.current;
    setLoading(true);
    setError('');
    if (!after) {
      setOffers([]);
      setNext(null);
    }
    try {
      const result = await api(
        'published-offers' + (after ? '?after=' + encodeURIComponent(after) : ''),
      );
      const rows = (result.offers as unknown[]).map((item) =>
        PublishedStateOfferViewSchema.parse(item),
      );
      const cursor = result.nextCursor === null ? null : IdSchema.parse(result.nextCursor);
      if (generation.current !== current) return;
      setOffers((old) => (after ? [...old, ...rows] : rows));
      setNext(cursor);
    } catch {
      if (generation.current === current) {
        setOffers([]);
        setNext(null);
        setError('Current published terms could not be checked. Refresh the catalogue.');
      }
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, []);
  return (
    <section className="published-offers" aria-busy={loading}>
      <p className="eyebrow">Voluntary state-offer preparation</p>
      <h1>Synthetic published offers.</h1>
      <p>
        Inspect the exact terms intentionally disclosed to signed-in simulation participants. These
        preparations do not establish enactment, legal notice, public office or an active Exchange.
        Actual rankings remain closed.
      </p>
      <p className="hint">
        The draft acts require the complete offer and final rules at least 90 days before rankings
        close. A material revision needs a new publication and new rankings. Prospective withdrawal
        preserves existing compacts and their original obligations.
      </p>
      <button
        className="button button-secondary"
        type="button"
        disabled={loading}
        onClick={() => void load()}
      >
        Refresh published offers
      </button>
      {loading && <p role="status">Checking current publications...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && offers.length === 0 && (
        <p>No synthetic offers have been published yet.</p>
      )}
      {offers.map((view) => (
        <article className="action-panel" key={view.publication.offerId} style={{ marginTop: 24 }}>
          <h2>{view.publication.title}</h2>
          <p>
            {view.status === 'withdrawn'
              ? 'Withdrawn for new choices; historical terms preserved.'
              : view.status === 'authority_unavailable'
                ? 'Authority unavailable for new choices; historical terms preserved.'
                : 'Published synthetic terms; actual rankings remain closed.'}
          </p>
          {view.withdrawnAt && <p>Withdrawal recorded: {view.withdrawnAt}</p>}
          <p>
            Publication version {view.publication.version} · {view.publication.jurisdiction}
          </p>
          <p className="workspace-id">Offer reference: {view.publication.offerId}</p>
          <p className="workspace-id">Published snapshot SHA-256: {view.digest}</p>
          <details>
            <summary>Inspect immutable terms</summary>
            <PublishedOfferDetails publication={view.publication} />
          </details>
        </article>
      ))}
      {next && (
        <button
          className="button button-secondary"
          type="button"
          disabled={loading}
          onClick={() => void load(next)}
        >
          Load more published offers
        </button>
      )}
    </section>
  );
}
export function StateOfferSummary({ record }: { record: CaseRecord }) {
  if (!['state_authority', 'offer'].includes(record.kind)) return null;
  const verified = StateAuthorityVerificationSchema.safeParse(
    record.data['stateAuthorityVerification'],
  );
  const binding = StateOfferBindingSchema.safeParse(record.data['stateOfferBinding']);
  const publication = PublishedStateOfferSchema.safeParse(record.data['publishedStateOffer']);
  const authority = verified.success
    ? verified.data
    : binding.success
      ? binding.data.authority
      : null;
  return (
    <section className="action-panel state-offer-summary">
      <h2>
        {publication.success
          ? 'Frozen synthetic publication'
          : authority
            ? 'Exact verified authority and terms'
            : 'Prepare independent state review'}
      </h2>
      <p>
        This simulation records preparation and intentional disclosure. Independent legal authority,
        actual notice, appointments and an authorized Exchange remain separate.
      </p>
      {!authority && (
        <p>
          The complete draft will bind to its originating state and a separate current supervisor.
          Published fields include the listed public obligations, method, menu and public authority
          references. Private attachments, internal reasons and the no-new-harm working analysis are
          excluded.
        </p>
      )}
      {authority && (
        <>
          <p>
            Authority revision {authority.authorityVersion} · {authority.authorityId}
          </p>
          <p>
            Fixed rate {authority.financialTerms.rate.numerator} /{' '}
            {authority.financialTerms.rate.denominator} · {authority.financialTerms.rateActId} ·
            method {authority.financialTerms.version}
          </p>
          <p>
            Recorded authority: {authority.effectiveFrom} through {authority.validThrough}. Recorded
            final rules: {authority.rulesPublishedDate}.
          </p>
          <p className="workspace-id">Verified packet SHA-256: {authority.packetDigest}</p>
        </>
      )}
      {binding.success && (
        <p>
          Submitted offer revision {binding.data.submittedVersion} is fixed. A material change
          requires withdrawal and a new offer; past receipts retain their original terms.
        </p>
      )}
      {publication.success && (
        <>
          {record.state === 'withdrawn' && (
            <p>
              Withdrawn prospectively. This original snapshot and existing compact obligations
              remain intact.
            </p>
          )}
          <details>
            <summary>Inspect the intentionally disclosed terms</summary>
            <PublishedOfferDetails publication={publication.data} />
          </details>
        </>
      )}
    </section>
  );
}
