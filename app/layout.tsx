import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jay Capital \u2014 Loan Portal',
  description: 'Hard money loan portfolio and borrower statements',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
