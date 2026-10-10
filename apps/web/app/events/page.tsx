import { PageIntro, Notice, EmptyState, ButtonLink } from '@cornerstone/ui';
export const metadata = { title: 'Research register' };
export default function Page() {
  return (
    <main id="main" className="container page-content">
      <PageIntro
        eyebrow="An open research register"
        title="Start with the action. Follow the evidence."
      >
        <p>
          Research helps identify actions to investigate. It never certifies an event, proves
          individual injury, or creates a legal claim.
        </p>
      </PageIntro>
      <Notice title="Historical and unlisted actions remain open">
        An action need not be in a census to be considered. Reliable proof is required, regardless
        of its age.
      </Notice>
      <EmptyState title="The research collection is awaiting publication review">
        <p>
          The supplied census and evidence workbook have not been released on this public site. No
          illustrative entry is presented as a real certified event.
        </p>
      </EmptyState>
      <div className="cards-grid">
        <article className="info-card">
          <h2>What an event record would show</h2>
          <p>
            The action, its date and geographic reach, the affected industry, primary evidence of
            deliberate contraction, contrary evidence, and research uncertainty.
          </p>
        </article>
        <article className="info-card">
          <h2>What needs a separate finding</h2>
          <p>
            Labor would consider a public petition and record, then issue written event findings.
            Each person would still need a separate direct-injury and established-livelihood
            determination.
          </p>
        </article>
      </div>
      <ButtonLink href="/participate">Explore the evidence checklist</ButtonLink>
    </main>
  );
}
