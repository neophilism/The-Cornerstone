import type { Metadata } from 'next';
import { Header, Footer } from '@cornerstone/ui';
import '@cornerstone/ui/styles.css';
export const metadata: Metadata = {
  title: 'Cornerstone Staff',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header
          portalUrl="/"
          publicOrigin={process.env['PUBLIC_ORIGIN'] || 'http://localhost:3000'}
        />
        {children}
        <Footer publicOrigin={process.env['PUBLIC_ORIGIN'] || 'http://localhost:3000'} />
      </body>
    </html>
  );
}
