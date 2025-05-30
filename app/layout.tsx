import './globals.css';
import { ReactNode } from 'react';
import WalletConnectionProvider from '@/components/WalletConnectionProvider';

export const metadata = {
  title: 'Coincarnation',
  description: 'Rescue your deadcoins. Coincarnate now!',
  openGraph: {
    title: 'Coincarnation',
    description: 'Revive your deadcoins. Coincarnate them for $MEGY.',
    url: 'https://megydapp-clean.vercel.app',
    siteName: 'Coincarnation',
    images: [
      {
        url: 'https://megydapp-clean.vercel.app/og-image.png', // görsel buradaysa doğru
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
    <html lang="en">
      <body>
        <WalletConnectionProvider>
          {children}
        </WalletConnectionProvider>
      </body>
    </html>
  );
}
