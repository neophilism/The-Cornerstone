import { PageIntro } from '@cornerstone/ui';
import Assessment from './assessment';
export const metadata = { title: 'Find your starting point' };
export default function Page() {
  return (
    <main id="main" className="container page-content">
      <PageIntro eyebrow="Workers, families & supporters" title="Let’s find your starting point.">
        <p>
          Three simple questions. No account, personal details, or eligibility promises. Just a
          useful next step.
        </p>
      </PageIntro>
      <Assessment />
    </main>
  );
}
