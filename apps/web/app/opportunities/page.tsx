import { PageIntro, Notice, EmptyState, ButtonLink } from '@cornerstone/ui';
export const metadata = { title: 'State opportunities' };
const checks = [
  [
    'Legal authority',
    'A state participates voluntarily. A presently prohibited trade and district must have valid sector authority, including express federal authorization where needed.',
  ],
  [
    'No new harm',
    'An offer cannot take an existing lawful job, license, contract, customer, queue position, or market. Cross-border, remote, and tribal rights matter.',
  ],
  [
    'Published financial terms',
    'The flat state rate, common calculation method, protected financial baseline, and bounded commercial menu must be fixed before associations rank. No rate has been settled.',
  ],
  [
    'Independent supervision',
    'An independent public supervisor actively reviews covered conduct. Ordinary safety, labor, consumer, and environmental law still applies.',
  ],
];
export default function Page() {
  return (
    <main id="main" className="container page-content">
      <PageIntro
        eyebrow="States participate voluntarily"
        title="New opportunity. No new displacement."
      >
        <p>
          A state offer must be lawful, specific, and published before anyone chooses it. Government
          cannot take an existing opportunity to make room for a Cornerstone association.
        </p>
      </PageIntro>
      <EmptyState title="No official state offers are open">
        <p>
          This proposal site does not legalize trades or issue licenses. Published offers would
          appear only after the relevant legal and administrative authority is verified.
        </p>
      </EmptyState>
      <h2 className="page-section-title">What every offer needs</h2>
      <div className="cards-grid">
        {checks.map(([t, d]) => (
          <article className="info-card" key={t}>
            <h3>{t}</h3>
            <p>{d}</p>
          </article>
        ))}
      </div>
      <Notice title="Terms come before choice">
        Officials cannot privately negotiate a favored percentage after matching. The state share
        provides no equity, vote, board seat, veto, or management power.
      </Notice>
      <ButtonLink href="/workspace">Explore the state workspace</ButtonLink>
    </main>
  );
}
