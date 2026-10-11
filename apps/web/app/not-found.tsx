import { EmptyState } from '@cornerstone/ui';
export default function Page() {
  return (
    <main id="main" className="container page-content" style={{ paddingTop: 60 }}>
      <EmptyState title="That page is not here" href="/" label="Back to the Cornerstone">
        <p>Use the navigation or search the help questions to find your next step.</p>
      </EmptyState>
    </main>
  );
}
