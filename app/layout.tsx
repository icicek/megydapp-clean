import './globals.css';
import { ReactNode } from 'react';
import WalletConnectionProvider from '@/components/WalletConnectionProvider';

export const metadata = {
  title: 'Coincarnation',
  description: 'Revive your deadcoins.',
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
