import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jay Capital Funding',
  description: 'Residential, commercial, home equity and hard money lending.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Loaded by link rather than next/font so the build never depends on
            reaching Google at compile time. Lato was referenced in the CSS all
            along but never actually loaded. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600&family=Lato:wght@400;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
