import { PageIntro } from '@cornerstone/ui';
export const metadata = { title: 'Accessibility' };
export default function Page() {
  return (
    <main id="main" className="container page-content">
      <PageIntro eyebrow="Designed for everyone" title="Clear, usable, and welcoming.">
        <p>
          You should be able to understand the proposal without a legal background or a fast
          computer.
        </p>
      </PageIntro>
      <div className="article-narrow">
        <p>
          The interface uses semantic headings, labeled form controls, keyboard access, visible
          focus, responsive layouts, and reduced-motion preferences. Information is not conveyed by
          color alone. The starting guide does not impose a time limit.
        </p>
        <p>
          Browser zoom, keyboard navigation, and printing are supported. Native disclosure controls
          let you choose how much detail to read. A Spanish introduction is available, with its
          review status stated.
        </p>
        <h2>Verification</h2>
        <p>
          Automated accessibility checks and manual desktop and mobile inspection are part of
          development. These do not constitute an independent accessibility certification.
          Screen-reader and lived-experience review remain release requirements for protected
          services.
        </p>
        <h2>Getting help</h2>
        <p>
          Official assisted-intake, telephone, mail, and accommodation routes must be published by
          an authorized operator before intake opens. This proposal site does not invent an agency
          phone number or promise a service that has not been established.
        </p>
      </div>
    </main>
  );
}
