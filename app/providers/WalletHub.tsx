'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Chain } from '@/lib/chain/types';
import { useChain } from '@/app/providers/ChainProvider';

// ---- Solana modal akışı (mevcut sistemle uyumlu) ----
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { EVM_CHAIN_ID_HEX, evmChainKeyFromHex } from '@/lib/chain/evm';

export type WalletBrand =
  | 'phantom'
  | 'solflare'
  | 'backpack'
  | 'metamask'
  | 'rabby'
  | 'trust'
  | 'walletconnect';

type WalletHubState = {
  ready: boolean;
  brand: WalletBrand | null;
  isConnected: boolean;
  account: string | null;       // solana: base58, evm: 0x...
  chainKey: Chain;
  connect: (brand: WalletBrand) => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: (next: Chain) => Promise<void>;
};

const DEFAULT_CHAIN: Chain = 'solana';
const LAST_BRAND_KEY = 'cc_lastBrand';
const LAST_CHAIN_KEY = 'cc_lastChain';



function isSolanaBrand(b: WalletBrand | null): boolean {
  return b === 'phantom' || b === 'solflare' || b === 'backpack';
}
function isEvmBrand(b: WalletBrand | null): boolean {
  return b === 'metamask' || b === 'rabby' || b === 'trust' || b === 'walletconnect';
}

const WalletHubContext = createContext<WalletHubState>({
  ready: false,
  brand: null,
  isConnected: false,
  account: null,
  chainKey: DEFAULT_CHAIN,
  connect: async () => {},
  disconnect: async () => {},
  switchChain: async () => {},
});

export function useWalletHub() {
  return useContext(WalletHubContext);
}

export function WalletHubProvider({ children }: { children: React.ReactNode }) {
  const { chain, setChain } = useChain();

  // ---- Solana modal hooks (mevcut akış) ----
  const { publicKey, connected, wallet, disconnect: solDisconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const [brand, setBrand] = useState<WalletBrand | null>(null);
  const [evmAccount, setEvmAccount] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Solana public key string
  const solAccount = useMemo(
    () => (publicKey ? publicKey.toBase58() : null),
    [publicKey]
  );

  // “effective chain”: Solana brand varsa zorunlu solana, aksi halde ChainProvider’daki chain
  const chainKey: Chain = useMemo(() => {
    if (isSolanaBrand(brand)) return 'solana';
    return chain;
  }, [brand, chain]);

  // Persist last brand/chain
  useEffect(() => {
    try {
      if (brand) localStorage.setItem(LAST_BRAND_KEY, brand);
      else localStorage.removeItem(LAST_BRAND_KEY);
    } catch {}
  }, [brand]);

  useEffect(() => {
    try {
      if (chainKey) localStorage.setItem(LAST_CHAIN_KEY, chainKey);
    } catch {}
  }, [chainKey]);

  // Boot: last brand/chain
  useEffect(() => {
    try {
      const lb = localStorage.getItem(LAST_BRAND_KEY) as WalletBrand | null;
      const lc = (localStorage.getItem(LAST_CHAIN_KEY) as Chain | null) || DEFAULT_CHAIN;
      if (lb) setBrand(lb);
      if (lc) setChain(lc);
    } catch {}
    setReady(true);
  }, [setChain]);

  // ----- EVM provider (window.ethereum) -----
  const evm = useRef<any>(null);
  useEffect(() => {
    const anyWin = window as any;
    if (anyWin?.ethereum) evm.current = anyWin.ethereum;
  }, []);

  // EVM events
  useEffect(() => {
    if (!evm.current) return;
    const onAccountsChanged = (accs: string[]) => {
      setEvmAccount(accs?.[0] || null);
    };
    const onChainChanged = (hex: string) => {
      const ck = evmChainKeyFromHex(hex);
      if (ck) setChain(ck);
    };
    evm.current.on?.('accountsChanged', onAccountsChanged);
    evm.current.on?.('chainChanged', onChainChanged);
    return () => {
      evm.current?.removeListener?.('accountsChanged', onAccountsChanged);
      evm.current?.removeListener?.('chainChanged', onChainChanged);
    };
  }, [setChain]);

  // ---- Public API ----
  const connect = useCallback(async (b: WalletBrand) => {
    setBrand(b);

    if (isSolanaBrand(b)) {
      // Mevcut Solana modalını aç → kullanıcı hangi adaptörü isterse onu seçer
      setChain('solana');
      setVisible(true);
      return;
    }

    if (isEvmBrand(b)) {
      if (!evm.current) throw new Error('No EVM wallet detected');
      const accs: string[] = await evm.current.request({ method: 'eth_requestAccounts' });
      const primary = accs[0];
      if (!primary) throw new Error('No EVM account returned');
      setEvmAccount(primary);

      const hex: string = await evm.current.request({ method: 'eth_chainId' });
      const ck = evmChainKeyFromHex(hex) || 'ethereum';
      setChain(ck);
      return;
    }

    throw new Error('Unsupported wallet brand');
  }, [setChain, setVisible]);

  const disconnect = useCallback(async () => {
    if (isSolanaBrand(brand)) {
      try { await solDisconnect(); } catch {}
    } else if (isEvmBrand(brand)) {
      // EVM'de standart disconnect yok → local state sıfırla
      setEvmAccount(null);
    }
    setBrand(null);
  }, [brand, solDisconnect]);

  const switchChain = useCallback(async (next: Chain) => {
    if (isSolanaBrand(brand)) {
      setChain('solana'); // no-op
      return;
    }
    const hex = EVM_CHAIN_ID_HEX[next as Exclude<typeof next, 'solana'>];
    if (!hex || !evm.current) return;
    await evm.current.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hex }],
    });
    setChain(next);
  }, [brand, setChain]);

  // Tek bir "account" değeri yüzeye çıkar:
  const account: string | null = isSolanaBrand(brand) ? solAccount : evmAccount;
  const isConnected = isSolanaBrand(brand) ? !!(connected && solAccount) : !!evmAccount;

  const value = useMemo<WalletHubState>(() => ({
    ready,
    brand,
    isConnected,
    account,
    chainKey,
    connect,
    disconnect,
    switchChain,
  }), [ready, brand, isConnected, account, chainKey, connect, disconnect, switchChain]);

  return <WalletHubContext.Provider value={value}>{children}</WalletHubContext.Provider>;
}
