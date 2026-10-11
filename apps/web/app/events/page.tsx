import Link from 'next/link';
import { PageIntro, Notice, ButtonLink } from '@cornerstone/ui';
import {
  researchJurisdictions,
  searchResearch,
  researchNotice,
} from '@cornerstone/content/research';
export const metadata = { title: 'Research register' };
type Query = { q?: string; jurisdiction?: string; view?: string; page?: string };
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.slice(0, 150) : '';
  const jurisdiction =
    typeof params.jurisdiction === 'string' && researchJurisdictions.includes(params.jurisdiction)
      ? params.jurisdiction
      : '';
  const view = params.view === 'timeline' ? 'timeline' : 'list';
  const result = searchResearch({ query: q, jurisdiction, view, page: Number(params.page ?? '1') });
  function href(page: number) {
    const p = new URLSearchParams({ q, jurisdiction, view, page: String(page) });
    return `/events?${p}`;
  }
  return (
    <main id="main" className="container page-content">
      <PageIntro
        eyebrow="An open research register"
        title="Start with the action. Follow the evidence."
      >
        <p>
          Explore 231 research entries from the supplied census and workbook. Each person’s
          livelihood and direct loss would still require separate proof.
        </p>
      </PageIntro>
      <Notice title="Research is a starting point">
        {researchNotice} The source collection uses a broader research screen than the proposed
        deliberate-industry-contraction test. Historical and unlisted actions remain open to
        reliable evidence.
      </Notice>
      <form action="/events" method="get" className="research-search" role="search">
        <label>
          Search research
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={150}
            placeholder="An action, industry or instrument"
            aria-describedby="research-search-help"
          />
        </label>
        <label>
          Government jurisdiction
          <select name="jurisdiction" defaultValue={jurisdiction}>
            <option value="">All jurisdictions</option>
            {researchJurisdictions.map((j) => (
              <option key={j}>{j}</option>
            ))}
          </select>
        </label>
        <label>
          View
          <select name="view" defaultValue={view}>
            <option value="list">Register list</option>
            <option value="timeline">Chronological list</option>
          </select>
        </label>
        <button className="button primary" type="submit">
          Search
        </button>
        <p id="research-search-help" className="small-muted">
          Search public records only; do not enter private information. Location does not determine
          personal eligibility.
        </p>
      </form>
      <div className="research-results-heading">
        <p>
          {result.count} research {result.count === 1 ? 'entry' : 'entries'} · page {result.page} of{' '}
          {result.pages}
        </p>
        <Link href="/events/method">Sources &amp; research method →</Link>
      </div>
      {view === 'timeline' && (
        <p className="small-muted">
          Sorted by the earliest year in the supplied action-date label; uncertain and multi-year
          labels remain unchanged. These are not certified priority dates.
        </p>
      )}
      {result.events.length ? (
        <ol className="research-results">
          {result.events.map((e) => (
            <li className="info-card" key={e.id}>
              <div className="research-meta">
                <span>{e.id} · research only</span>
                <span>
                  {e.jurisdiction} · {e.actionDate || 'Date not established'}
                </span>
              </div>
              <h2>
                <Link href={`/events/${e.id}`}>{e.title}</Link>
              </h2>
              <p>{e.action}</p>
              <p className="small-muted">{e.limits}</p>
              <Link className="text-link" href={`/events/${e.id}`}>
                Follow the evidence →
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <div className="info-card">
          <h2>No research entry matches.</h2>
          <p>
            Absence from this register is no bar. Use the preparation guide for an unlisted action.
          </p>
          <ButtonLink href="/participate">Prepare an unlisted event</ButtonLink>
        </div>
      )}
      <nav aria-label="Research pages" className="research-pagination">
        {result.page > 1 && (
          <Link className="button button-secondary" href={href(result.page - 1)}>
            Previous page
          </Link>
        )}
        {result.page < result.pages && (
          <Link className="button button-secondary" href={href(result.page + 1)}>
            Next page
          </Link>
        )}
      </nav>
      <section className="research-unlisted">
        <h2>The register stays open.</h2>
        <p>
          Reliable historical evidence and unlisted government actions can be considered. Research
          entries never substitute for Labor’s event findings or an individual decision.
        </p>
        <ButtonLink href="/participate">Use the evidence guide</ButtonLink>
      </section>
    </main>
  );
}
