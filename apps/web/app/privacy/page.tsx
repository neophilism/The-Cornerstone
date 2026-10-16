import { PageIntro, Notice } from '@cornerstone/ui';
export const metadata = { title: 'Privacy' };
export default function Page() {
  return (
    <main id="main" className="container page-content">
      <PageIntro eyebrow="Your information" title="Start without sharing your story.">
        <p>You can read the policy and use the starting guide without creating an account.</p>
      </PageIntro>
      <div className="article-narrow">
        <h2>This public site</h2>
        <p>
          The starting guide keeps answers only in page memory. It does not save them in browser
          storage or send them to a server. Help searches place the search text in the URL, so do
          not enter private facts there. No advertising trackers or third-party analytics are
          included.
        </p>
        <h2>Hosting records</h2>
        <p>
          The hosting provider may retain ordinary request and security records, including an IP
          address, time, and requested path. Avoid putting names or sensitive details in a search or
          URL.
        </p>
        <h2>Private services</h2>
        <p>
          Private program intake is not open. The development workspaces use synthetic data in a
          separate simulation environment. This site does not accept identity documents, evidence
          uploads, sealed rankings, payments, or private claims.
        </p>
        <Notice title="Do not submit sensitive documents">
          Verified security controls, approved identity and recovery arrangements, retention rules,
          and legal authority must be in place before protected program services open.
          External expert review can follow when funded; it is not an activation prerequisite.
        </Notice>
        <h2>Accounts and rights</h2>
        <p>
          An activated participant service would provide scoped representation, access and
          correction requests, export, retention notices, and documented review routes. No real
          account is created by the public preview.
        </p>
      </div>
    </main>
  );
}
