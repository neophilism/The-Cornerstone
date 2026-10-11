import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageIntro, Notice, ButtonLink } from '@cornerstone/ui';
import {
  findResearchEvent,
  relatedResearch,
  publicSourceUrl,
  researchDataset,
  researchNotice,
} from '@cornerstone/content/research';
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const event = findResearchEvent((await params).id);
  return { title: event ? `${event.title} · research` : 'Research entry not found' };
}
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const event = findResearchEvent((await params).id);
  if (!event) notFound();
  const census = researchDataset.census.find((c) => c.id === event.id)!;
  return (
    <main id="main" className="container page-content">
      <Link className="text-link" href="/events">
        ← Back to the research register
      </Link>
      <PageIntro eyebrow={`${event.id} · research only`} title={event.title}>
        <p>
          {event.jurisdiction} · {event.actionDate || 'Date not established'}
        </p>
      </PageIntro>
      <Notice title="No certification or individual finding">
        {researchNotice} A register entry does not establish the narrower statutory intent test, a
        particular worksite loss or anyone’s eligibility.
      </Notice>
      <div className="research-detail-grid">
        <article className="research-main">
          <h2>The government action</h2>
          <p>{event.action}</p>
          <p className="small-muted">Instrument: {event.instrument}</p>
          <h2>Why researchers included it</h2>
          <p>{event.rationale}</p>
          <h2>What still needs proof</h2>
          <p>{event.limits}</p>
          <p>{event.affectedGroup}</p>
          <Notice title="Individual proof remains separate">
            An established principal livelihood, material injury and direct causation must be
            proved. Ordinary market change, incidental losses and diffuse regional effects do not
            suffice. Later employment or ordinary transition benefits do not erase a proven original
            loss.
          </Notice>
          {['Citation audit', 'Workforce evidence', 'Worksites'].map((name) => {
            const rows = relatedResearch(name, event.id);
            return (
              <details className="research-evidence" key={name}>
                <summary>
                  {name} · {rows.length} source {rows.length === 1 ? 'record' : 'records'}
                </summary>
                {rows.length ? (
                  rows.map((r) => (
                    <article key={r.row} className="source-record">
                      <p className="eyebrow">
                        Workbook · {name} · row {r.row}
                      </p>
                      <dl>
                        {Object.entries(r.values)
                          .filter(([, v]) => v)
                          .map(([k, v]) => (
                            <div key={k}>
                              <dt>
                                {k.replace(
                                  'Current event disposition',
                                  'Original research disposition',
                                )}
                              </dt>
                              <dd>
                                {k.includes('URL') && publicSourceUrl(v) ? (
                                  <a
                                    href={publicSourceUrl(v)!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Open cited source ↗
                                  </a>
                                ) : (
                                  v
                                )}
                              </dd>
                            </div>
                          ))}
                      </dl>
                    </article>
                  ))
                ) : (
                  <p>
                    No separate record is supplied in this sheet. Missing evidence is not an adverse
                    individual finding.
                  </p>
                )}
              </details>
            );
          })}
          <details className="research-evidence">
            <summary>Original census wording &amp; provenance</summary>
            <p className="small-muted">
              Source screening labels are preserved as research wording, not adopted as statutory
              determinations. Census entry starts at paragraph {census.paragraph}.
            </p>
            {census.paragraphs.map((p) => (
              <div key={p.paragraph}>
                <p>{p.text}</p>
                {p.links
                  .filter((l) => publicSourceUrl(l.url))
                  .map((l, i) => (
                    <p key={i}>
                      <a href={publicSourceUrl(l.url)!} target="_blank" rel="noopener noreferrer">
                        {l.text || 'Census source'} ↗
                      </a>
                    </p>
                  ))}
              </div>
            ))}
          </details>
        </article>
        <aside className="research-source-panel">
          <p className="eyebrow">Follow the sources</p>
          <h2>Primary records and limitations.</h2>
          <ol>
            {event.urls.map((u, i) => (
              <li key={u}>
                <a href={u} target="_blank" rel="noopener noreferrer">
                  Cited source {i + 1} ↗
                </a>
              </li>
            ))}
          </ol>
          <p className="small-muted">{event.sourceCheck}</p>
          <p className="small-muted">
            Source review: {event.reviewed || 'Not specified'}. Import has not reverified external
            citations.
          </p>
          <details>
            <summary>Source files</summary>
            <p>
              Event evidence sheet, row {event.row}; census paragraph {census.paragraph}.
            </p>
            <Link href="/documents/event-evidence">Download workbook</Link>
            <br />
            <Link href="/documents/displacement-event-census">Download census</Link>
          </details>
          <ButtonLink href="/participate">Prepare your evidence</ButtonLink>
        </aside>
      </div>
    </main>
  );
}
