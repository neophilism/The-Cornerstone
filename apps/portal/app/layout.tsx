import type { Metadata } from 'next';
import { Header, Footer } from '@cornerstone/ui';
import '@cornerstone/ui/styles.css';
export const metadata: Metadata = {
  title: 'My Cornerstone',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header portalUrl="/" />
        {children}
        <Footer />
      </body>
    </html>
  );
}
