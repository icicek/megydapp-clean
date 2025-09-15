// components/WalletConnectionProvider.tsx
'use client';

import { FC, useMemo, useEffect, useRef } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletAdapter } from '@solana/wallet-adapter-base';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  WalletConnectWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, useWalletModal } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

import '@solana/wallet-adapter-react-ui/styles.css';

// 👉 Cüzdan listesinde bir cüzdan seçildiğinde otomatik connect yapar.
//    Sayfa açılışında "eski seçim" varsa bağlanmaz (autoConnect=false kalır).
function AutoConnectOnSelect() {
  const { wallet, connected, connecting, connect } = useWallet();
  const { setVisible, visible } = useWalletModal() as { setVisible: (v: boolean) => void; visible?: boolean };

  const prevWalletNameRef = useRef<string | null>(null);
  const modalWasOpenRef = useRef(false);

  // Modal açıldı mı? (Seçim modalı üzerinden yapıldıysa auto-connect edeceğiz)
  useEffect(() => {
    if (visible) modalWasOpenRef.current = true;
  }, [visible]);

  // Cüzdan seçimi değiştiğinde ve modal gerçekten kullanılmışsa → connect()
  useEffect(() => {
    const currentName = wallet?.adapter?.name ?? null;
    const changed = currentName && currentName !== prevWalletNameRef.current;

    if (changed) {
      prevWalletNameRef.current = currentName;

      if (modalWasOpenRef.current && !connected && !connecting) {
        (async () => {
          try {
            await connect();           // 🔗 seçer seçmez bağlan
            setVisible(false);         // modalı kapat
          } catch {
            // kullanıcı iptal ederse vs. sessiz geç
          } finally {
            modalWasOpenRef.current = false; // bayrağı sıfırla
          }
        })();
      }
    }
  }, [wallet, connected, connecting, connect, setVisible]);

  return null;
}

const WalletConnectionProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
  // RPC endpoint: env varsa onu kullan, yoksa mainnet-beta
  const endpoint = useMemo(() => {
    return (
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      process.env.NEXT_PUBLIC_SOLANA_RPC ||
      clusterApiUrl('mainnet-beta')
    );
  }, []);

  const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

  // Production/staging için doğru origin (WalletConnect metadata)
  const APP_ORIGIN =
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://coincarnation.com');

  // Adapters tek seferlik oluşturulsun
  const wallets = useMemo((): WalletAdapter[] => {
    const list: WalletAdapter[] = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(), // parametresiz: sürümler arası TS uyumu
    ];

    if (WC_PROJECT_ID) {
      const wc = new WalletConnectWalletAdapter({
        // bazı sürümlerde gerekebiliyor → esnek bırakıyoruz
        network: 'mainnet-beta' as any,
        options: {
          projectId: WC_PROJECT_ID,
          relayUrl: 'wss://relay.walletconnect.com',
          metadata: {
            name: 'Coincarnation DApp',
            description: 'Revive value, claim the Fair Future.',
            url: APP_ORIGIN,
            icons: [`${APP_ORIGIN}/icon.png`],
          },
        } as any,
      } as any) as unknown as WalletAdapter;

      list.push(wc);
    }

    return list;
  }, [WC_PROJECT_ID, APP_ORIGIN]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect={false} // ❗ sayfa açılışında otomatik bağlanma yok
        onError={(e) => {
          console.error('[WALLET ERROR]', e?.name, e?.message, e);
        }}
      >
        <WalletModalProvider>
          {/* 🧠 Seçim yapıldığı an otomatik connect eden mini yardımcı */}
          <AutoConnectOnSelect />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default WalletConnectionProvider;
