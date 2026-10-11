import type { Metadata } from 'next';
import { Header, Footer } from '@cornerstone/ui';
import '@cornerstone/ui/styles.css';
import { headers } from 'next/headers';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  metadataBase: new URL(process.env['PUBLIC_ORIGIN'] || 'https://cornerstone.example'),
  title: {
    default: 'The Cornerstone — A fair foundation. A future you help build.',
    template: '%s | The Cornerstone',
  },
  description:
    'A proposed voluntary remedy for people whose established livelihoods were directly harmed by deliberate government industry contraction. Learn the policy and find your starting point.',
  robots: { index: true, follow: true },
};
export default async function Layout({ children }: { children: React.ReactNode }) {
  await headers();
  return (
    <html lang="en">
      <body>
        <Header portalUrl={process.env['PORTAL_ORIGIN'] || '/workspace'} />
        {children}
        <Footer />
      </body>
    </html>
  );
}
