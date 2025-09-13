// app/layout.tsx
import '@solana/wallet-adapter-react-ui/styles.css';
import './globals.css';

import type { Metadata } from 'next';
import { ReactNode } from 'react';
import WalletConnectionProvider from '@/components/WalletConnectionProvider';
import { APP_URL, absoluteUrl } from '@/app/lib/origin';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: 'Coincarnation',
  description: 'Rescue your deadcoins. Coincarnate now!',
  openGraph: {
    title: 'Coincarnation',
    description: 'Revive your deadcoins. Coincarnate them for $MEGY.',
    url: APP_URL,
    siteName: 'Coincarnation',
    images: [{ url: absoluteUrl('/og-image.png'), width: 1200, height: 630, alt: 'Coincarnation' }],
    locale: 'en_US',
    type: 'website'
  },
  twitter: { card: 'summary_large_image', title: 'Coincarnation', description: 'Trade your deadcoins for $MEGY and join the future.', images: [absoluteUrl('/og-image.png')] }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <WalletConnectionProvider>
          {children}
        </WalletConnectionProvider>
      </body>
    </html>
  );
}
