import { Arrow, Badge, ButtonLink, CommunityArt } from '@cornerstone/ui';
import { steps, rights, rolePaths, faqs } from '@cornerstone/content';

export default function Home() {
  return (
    <main id="main">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">
              <span className="status-dot" /> A foundation for a new beginning
            </p>
            <h1>
              When policy takes
              <br />a livelihood,
              <br />
              <em>build a future.</em>
            </h1>
            <p className="hero-copy">
              The Cornerstone is a proposal to help people rebuild when government deliberately
              closes down the industry they depend on. Together. Voluntarily. With a stake of their
              own.
            </p>
            <div className="hero-actions">
              <ButtonLink href="/participate">Find your starting point</ButtonLink>
              <a className="hero-link" href="/how-it-works">
                See how it works <span aria-hidden="true">↗</span>
              </a>
            </div>
            <p className="hero-note">A policy proposal. Official applications are not open.</p>
          </div>
          <div className="hero-art">
            <CommunityArt />
            <div className="art-caption">
              <span className="seal" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>Built around people.</strong>Owned and governed by members.
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="container">
        <div className="principles">
          {[
            ['01', 'Voluntary by design', 'Your home. Your work. Your choice.'],
            ['02', 'Members keep control', 'One founding vote. An equal base stake.'],
            ['03', 'Clear rules. A public process.', 'Evidence, written decisions, and review.'],
          ].map(([n, t, d]) => (
            <div className="principle" key={n}>
              <span className="principle-icon" aria-hidden="true">
                {n}
              </span>
              <div>
                <h2>{t}</h2>
                <p>{d}</p>
              </div>
            </div>
          ))}
        </div>
        <section className="section" aria-labelledby="path-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">The path forward</p>
              <h2 id="path-heading">
                From a proven loss
                <br />
                to a shared opportunity.
              </h2>
            </div>
            <p>
              A practical path for a specific kind of harm. No promise of profits. No obligation to
              participate.
            </p>
          </div>
          <div className="steps">
            {steps.map((s) => (
              <article className="step" key={s.number}>
                <div className="step-number" aria-hidden="true">
                  {s.number}
                </div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <details>
                  <summary>What this means</summary>
                  <p>{s.detail}</p>
                </details>
              </article>
            ))}
          </div>
        </section>
        <section className="ownership-section" aria-labelledby="rights-heading">
          <div>
            <p className="eyebrow">A stake. A voice. A choice.</p>
            <h2 id="rights-heading">
              Your future belongs
              <br />
              to you.
            </h2>
            <p className="ownership-copy">
              An association is more than a route to a job. It is an equal foundation that members
              build and govern together.
            </p>
            <a className="text-link" href="/how-it-works#associations">
              Explore your rights <Arrow />
            </a>
          </div>
          <div className="rights-grid">
            {rights.map((r, i) => (
              <article key={r.title}>
                <span className="right-icon" aria-hidden="true">
                  {['↗', '=', '⌂', '§'][i]}
                </span>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="section explore-teaser">
          <div className="research-panel">
            <span className="ribbon">Research, not a determination</span>
            <h3>
              A government action.
              <br />
              An industry affected.
              <br />A story to investigate.
            </h3>
            <p>
              The research register is a starting point for evidence. It is never proof of an
              individual claim.
            </p>
            <div className="research-line" />
            <div className="research-labels">
              <span>Past actions</span>
              <span>Reliable evidence</span>
              <span>Open register</span>
            </div>
          </div>
          <div className="explore-copy">
            <p className="eyebrow">Understand the evidence</p>
            <h2>
              Every claim starts
              <br />
              with the facts.
            </h2>
            <p>
              Historical and unlisted actions can be considered. What matters is reliable proof of
              deliberate policy and direct, material harm to an established livelihood.
            </p>
            <ButtonLink href="/events" secondary>
              Explore the research framework
            </ButtonLink>
            <p className="research-caution">
              A census entry is not a certified event, a proven injury, or a legal cause of action.
            </p>
          </div>
        </section>
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Find your place</p>
              <h2>A starting point for everyone.</h2>
            </div>
          </div>
          <div className="roles">
            {rolePaths.map((r) => (
              <article className="role-card" key={r.title}>
                <Badge>{r.title}</Badge>
                <h3 style={{ marginTop: 20 }}>{r.title}</h3>
                <p>{r.text}</p>
                <a className="text-link" href={r.href}>
                  {r.label}
                  <Arrow />
                </a>
              </article>
            ))}
          </div>
        </section>
        <section className="section centered" style={{ paddingTop: 0 }}>
          <div className="section-heading">
            <p className="eyebrow">Straight answers</p>
            <h2>A few things you may be wondering.</h2>
          </div>
          <div className="faq-list">
            {[faqs[0]!, faqs[1]!, faqs[4]!, faqs[7]!].map((f) => (
              <details key={f.question}>
                <summary>{f.question}</summary>
                <p>{f.answer}</p>
              </details>
            ))}
          </div>
          <p style={{ textAlign: 'center', marginTop: 28 }}>
            <a className="text-link" href="/help">
              See all questions
              <Arrow />
            </a>
          </p>
        </section>
        <section className="cta-section">
          <p className="eyebrow" style={{ justifyContent: 'center', color: 'var(--gold)' }}>
            Start with understanding
          </p>
          <h2>
            A fair foundation.
            <br />A future you help build.
          </h2>
          <p>
            Learn where you fit, what evidence would matter, and how the proposed process would
            work.
          </p>
          <ButtonLink href="/participate">Find your starting point</ButtonLink>
        </section>
      </div>
    </main>
  );
}
