import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: '__TITLE__', template: '%s · __TITLE__' },
  description: '__TITLE__',
  metadataBase: new URL('https://__HOST__'),
  openGraph: { siteName: '__TITLE__', type: 'website' },
};

/**
 * Deliberately bare: no analytics, no third-party script, no structured data
 * belonging to anyone else. Everything that renders here belongs to this site.
 *
 * This matters more than it looks. A site served on a subdomain of a domain we
 * own must carry none of our marks — a previous site inherited another
 * product's header, tracking and Organization schema, and told crawlers it was
 * a different company.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
