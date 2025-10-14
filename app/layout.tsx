// app/layout.tsx
import '@solana/wallet-adapter-react-ui/styles.css';
import './globals.css';

import type { Metadata } from 'next';
import Providers from './providers';
import { APP_URL, absoluteUrl } from '@/app/lib/origin';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: 'Coincarnation — Unite Deadcoins. Fund the Future.',
  description: 'Unite deadcoins, rescue value, and join the Fair Future Fund. Coincarnate now.',
  alternates: {
    canonical: APP_URL,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    url: APP_URL,
    siteName: 'Coincarnation',
    title: 'Coincarnation — Unite Deadcoins. Fund the Future.',
    description: 'Unite deadcoins, rescue value, and join the Fair Future Fund.',
    images: [
      {
        url: absoluteUrl('/og-image.png'),
        width: 1200,
        height: 630,
        alt: 'Coincarnation — Unite Deadcoins. Fund the Future.',
      },
    ],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Coincarnation — Unite Deadcoins. Fund the Future.',
    description: 'Unite deadcoins, rescue value, and join the Fair Future Fund.',
    images: [absoluteUrl('/og-image.png')],
  },
  // (opsiyonel) favicon vs.
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
