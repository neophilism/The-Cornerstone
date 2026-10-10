import { PageIntro, Notice, EmptyState } from '@cornerstone/ui';
export const metadata = { title: 'Public record' };
export default function Page() {
  return (
    <main id="main" className="container page-content">
      <PageIntro
        eyebrow="Reasons you can inspect"
        title="A public process deserves a public record."
      >
        <p>
          Event petitions, reviewed findings, state offers, exchange rules, and compact supervision
          belong in an accessible public record with appropriate privacy protections.
        </p>
      </PageIntro>
      <Notice>
        Private livelihood records, sealed choices, identity documents, and financial source records
        are never automatically published. A public summary needs separate review and approval.
      </Notice>
      <EmptyState title="No authorized program determinations have been published">
        <p>
          This site does not represent an agency docket or a court filing system. A future official
          record would identify its authority, version, reasons, notice dates, and review route.
        </p>
      </EmptyState>
    </main>
  );
}
