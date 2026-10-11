import Link from 'next/link';
import { PageIntro, Notice } from '@cornerstone/ui';
import { researchDataset, researchNotice, publicSourceUrl } from '@cornerstone/content/research';
export const metadata = { title: 'Research method & source coverage' };
export default function Page() {
  return (
    <main id="main" className="container page-content">
      <Link href="/events" className="text-link">
        ← Research register
      </Link>
      <PageIntro eyebrow="Provenance, not a verdict" title="The records behind the research.">
        <p>
          All six supplied workbook sheets are preserved. Stable IDs connect the census, event
          records, source audits, workforce evidence and worksites.
        </p>
      </PageIntro>
      <Notice title="The research screen and statutory test differ">
        {researchNotice} The source collection’s broad public-benefit/material-burden screen is not
        sufficient for proposed eligibility. The bill requires deliberate industry destruction or
        material contraction and separate direct individual harm.
      </Notice>
      <div className="cards-grid">
        {researchDataset.sheets.map((s) => (
          <article className="info-card" key={s.name}>
            <h2>{s.name}</h2>
            <p>{s.records.length} source records, with original row numbers.</p>
            <p className="small-muted">{s.context}</p>
          </article>
        ))}
      </div>
      <div className="article-narrow">
        <h2>What the import does</h2>
        <p>
          Seven original file hashes are checked. All 231 census IDs reconcile with the workbook.
          Original dates, limits and differences are retained. No certificate, proven victim count,
          geographic eligibility boundary or individual recommendation is created. No external URL
          is fetched during import.
        </p>
        <p>
          Source citation checks reflect the supplied September 28, 2026 review. Links may change;
          importing a link does not independently verify its contents. Some cited records are
          reproductions of primary decisions rather than the issuing authority’s original
          publication.
        </p>
        <p>
          <Link href="/policy">Download all originals and draft acts</Link>
        </p>
        {['Method', 'Coverage audit'].map((name) => {
          const s = researchDataset.sheets.find((s) => s.name === name)!;
          return (
            <details className="research-evidence" key={name}>
              <summary>
                Original {name.toLowerCase()} · {s.records.length} records
              </summary>
              {s.records.map((r) => (
                <article className="source-record" key={r.row}>
                  <p className="eyebrow">
                    {name} · row {r.row}
                  </p>
                  <dl>
                    {s.headers.map((h, i) => (
                      <div key={h}>
                        <dt>{h}</dt>
                        <dd>
                          {h.includes('URL') && publicSourceUrl(r.values[i] ?? '') ? (
                            <a
                              href={publicSourceUrl(r.values[i]!)!}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Open cited source ↗
                            </a>
                          ) : (
                            r.values[i]
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </details>
          );
        })}
        <h2>Corrections and unlisted events</h2>
        <p>
          Use the original event ID and source row when describing a correction. Until a moderated
          submission channel opens, keep source records in your preparation dossier. An unlisted
          action remains eligible for investigation under the same statutory criteria.
        </p>
        <Link href="/participate">Open the preparation guide →</Link>
      </div>
    </main>
  );
}
