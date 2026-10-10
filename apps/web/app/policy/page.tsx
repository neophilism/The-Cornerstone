import { PageIntro, Notice, ButtonLink } from '@cornerstone/ui';
export const metadata = { title: 'Policy & sources' };
export default function Page() {
  return (
    <main id="main" className="container page-content">
      <PageIntro
        eyebrow="The design, in plain language"
        title="A remedy for a deliberate policy choice."
      >
        <p>
          When government deliberately makes an industry’s destruction or material contraction an
          objective or intended means of policy, identifiable people may suffer a direct livelihood
          loss.
        </p>
      </PageIntro>
      <div className="article-narrow">
        <p className="callout-quote">
          The people who bore that loss should have a voluntary path to a new foundation.
        </p>
        <p>
          Cornerstone proposes a carefully bounded response: evidence-based event and individual
          findings; equal member associations; state offers that protect existing lawful interests;
          a fair public exchange; and member-controlled enterprises under ordinary protective law.
        </p>
        <h2>The policy and the evidence do different jobs.</h2>
        <p>
          The policy paper and design commentary establish the design. The displacement census and
          event evidence spreadsheet are research materials. Research entries never substitute for
          statutory findings or individual proof.
        </p>
        <h2>There are important limits.</h2>
        <p>
          Ordinary market change, incidental job losses, and diffuse regional effects are outside
          the proposed eligibility test. The program would not guarantee profits, remove business
          risk, command states to participate, or promise universal constitutionality.
        </p>
        <h2>Legislative drafts</h2>
        <p>
          A proposed federal bill assigns event and eligibility review to Labor, the exchange to
          Commerce, and a bounded revolving Founding Fund. A model state act governs voluntary
          offers, compacts, supervision, the separate state surplus share, and a dedicated
          land-acquisition account.
        </p>
        <Notice title="Source publication is pending">
          Original source files and legislative drafts have not been cleared for publication in this
          public repository. Download links will appear after that review; no unavailable file is
          offered as a download.
        </Notice>
        <h2>What an adopting state must resolve</h2>
        <p>
          Sector authority, constitutional restrictions, agency appointments, appropriations, local
          and tribal rights, and the prospective state rate require state-specific decisions.
          Enactment and independent review must precede official operation.
        </p>
        <ButtonLink href="/how-it-works">Understand the proposed process</ButtonLink>
      </div>
    </main>
  );
}
