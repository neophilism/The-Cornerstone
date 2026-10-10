import { PageIntro, Notice, ButtonLink } from '@cornerstone/ui';
import { steps, rights } from '@cornerstone/content';
export const metadata = { title: 'How it works' };
export default function Page() {
  return (
    <main id="main" className="container page-content">
      <PageIntro eyebrow="The proposed program" title="A clear path. Your choice at every step.">
        <p>
          Cornerstone connects proven livelihood harm with new, voluntary opportunities under
          published rules.
        </p>
      </PageIntro>
      <div className="steps">
        {steps.map((s) => (
          <article className="step" key={s.number}>
            <div className="step-number">{s.number}</div>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
            <p>{s.detail}</p>
          </article>
        ))}
      </div>
      <Notice>
        These are proposed procedures. This website cannot make a government finding, grant a
        license, or commit public funds.
      </Notice>
      <section id="associations">
        <h2 className="page-section-title">An association you control.</h2>
        <div className="cards-grid">
          {rights.map((r) => (
            <article className="info-card" key={r.title}>
              <h3>{r.title}</h3>
              <p>{r.text}</p>
            </article>
          ))}
        </div>
        <p className="article-narrow">
          Associations form before opportunities are allocated. The ordinary founding roll is
          bounded, timely pending claims must be resolved, and a claim cannot appear on two active
          rolls. One person has one vote within an association. A verified single successor
          preserves one undivided claim or unit.
        </p>
      </section>
      <div className="cards-grid">
        <article className="info-card">
          <h2>States make the offers.</h2>
          <p>
            States participate voluntarily. A published offer identifies a presently prohibited
            trade and district. It must protect existing lawful jobs, licenses, contracts,
            customers, queue positions, and markets.
          </p>
          <p>
            Associations rank acceptable offers. Conflicts use the oldest still-unremedied certified
            event and a public random tie-break. Officials cannot choose favored workers.
          </p>
        </article>
        <article className="info-card">
          <h2>Funding has an end.</h2>
          <p>
            The Founding Fund makes a limited enterprise advance for approved preparation costs.
            Repayment includes a fixed public return under a predetermined formula. Once paid, the
            obligation ends.
          </p>
          <p>
            The separate state land share applies only to positive shareable surplus. The
            legislature must publish its prospective flat rate and calculation rules before offers
            are ranked.
          </p>
        </article>
      </div>
      <ButtonLink href="/participate">Find your starting point</ButtonLink>
    </main>
  );
}
