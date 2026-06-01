import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Your Savvy Advisor Page — Intake Form',
  description: 'Submit your advisor profile information for the Savvy Advisor page.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        {children}
      </body>
    </html>
  );
}
