// app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import WalletConnectionProvider from '@/components/WalletConnectionProvider';
import AdminSessionSync from '@/components/wallet/AdminSessionSync';
import AdminTopNav from '@/components/AdminTopNav'; // 👈 eklendi

export const metadata: Metadata = {
  title: 'Coincarnation',
  description: 'Rescue your deadcoins. Coincarnate now!',
  openGraph: {
    title: 'Coincarnation',
    description: 'Revive your deadcoins. Coincarnate them for $MEGY.',
    url: 'https://megydapp-clean.vercel.app',
    siteName: 'Coincarnation',
    images: [
      {
        url: 'https://megydapp-clean.vercel.app/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Coincarnation Promotional Visual',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Coincarnation',
    description: 'Trade your deadcoins for $MEGY and join the future.',
    images: ['https://megydapp-clean.vercel.app/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <WalletConnectionProvider>
          <AdminSessionSync />
          <AdminTopNav />  {/* 👈 yalnızca /admin altında (login hariç) görünür */}
          {children}
        </WalletConnectionProvider>
      </body>
    </html>
  );
}
