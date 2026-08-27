import type { Metadata } from 'next';
import Script from 'next/script';
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
      <body>
        {children}

        {/* The FleetCrown feedback widget.
            The owner looks at their own site, points at what they do not like,
            and an agent changes it — without emailing anyone. This is why the
            site is maintainable by its owner rather than by us, and it is
            provisioned when the site is created rather than "later".
            Env-gated, so a local dev run and a fork carry no widget at all. */}
        {process.env.NEXT_PUBLIC_FC_WIDGET_TOKEN && (
          <Script
            src="https://fleetcrown.orangecat.ch/widget.js"
            strategy="afterInteractive"
            data-fc-project={process.env.NEXT_PUBLIC_FC_WIDGET_TOKEN}
          />
        )}
      </body>
    </html>
  );
}
