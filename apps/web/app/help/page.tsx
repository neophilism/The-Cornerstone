import { PageIntro, EmptyState } from '@cornerstone/ui';
import { searchHelp } from '@cornerstone/content';
export const metadata = { title: 'Help & questions' };
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const results = searchHelp(q.slice(0, 200));
  return (
    <main id="main" className="container page-content">
      <PageIntro eyebrow="Straight answers" title="What would you like to know?">
        <p>Plain language answers, grounded in the proposed design.</p>
      </PageIntro>
      <form className="filters" role="search">
        <label htmlFor="help-search">Search questions</label>
        <input
          className="search-input"
          id="help-search"
          name="q"
          defaultValue={q}
          maxLength={200}
          placeholder="Try eligibility, work, or funding"
        />
        <button className="button" type="submit">
          Search
        </button>
      </form>
      {results.length ? (
        <div className="faq-list">
          {results.map((f) => (
            <details key={f.question} open={!!q}>
              <summary>{f.question}</summary>
              <p>{f.answer}</p>
              <span className="source-note">
                Design reference: {f.source}. Draft, subject to legislative adoption.{' '}
                {f.source.toLowerCase().includes('federal') && (
                  <a href="/documents/federal-cornerstone-bill">Read the federal draft</a>
                )}
                {f.source.toLowerCase().includes('state') && (
                  <>
                    {' '}
                    <a href="/documents/model-state-cornerstone-enabling-act">
                      Read the state draft
                    </a>
                  </>
                )}
              </span>
            </details>
          ))}
        </div>
      ) : (
        <EmptyState title="No matching question">
          <p>Try a shorter search, or browse all questions.</p>
          <a href="/help">Show all questions</a>
        </EmptyState>
      )}
    </main>
  );
}
