import Preview from './preview';
export const metadata = { title: 'Explore the workspace', robots: { index: false } };
export default function Page() {
  return (
    <main id="main">
      <Preview />
    </main>
  );
}
