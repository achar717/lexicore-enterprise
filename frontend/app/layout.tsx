import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LexiCore Enterprise',
  description: 'AI Document Intelligence for Law Firms',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
