'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChain } from '@/app/providers/ChainProvider';
import type { Chain } from '@/lib/chain/types';

// ---- Solana imports (existing behavior) ----
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName, WalletReadyState } from '@solana/wallet-adapter-base';

type WalletListItem = {
  name: WalletName;
  icon?: string;
  readyState?: WalletReadyState | string;
};

type UseChainWalletResult = {
  chain: Chain;
  address: string | null;
  connected: boolean;
  connecting: boolean;
  wallets: WalletListItem[];
  select: (name: WalletName) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  icon?: string;
  hasProvider: boolean; // whether a wallet/provider is detected for current chain
};

function getInjectedEvmName(): string | null {
  const anyWin = typeof window !== 'undefined' ? (window as any) : undefined;
  if (!anyWin || !anyWin.ethereum) return null;
  if (anyWin.ethereum.isMetaMask) return 'MetaMask';
  if (anyWin.ethereum.isBraveWallet) return 'Brave Wallet';
  if (anyWin.ethereum.isCoinbaseWallet) return 'Coinbase Wallet';
  return 'Injected EVM Wallet';
}

export default function useChainWallet(): UseChainWalletResult {
  const { chain } = useChain();

  // ---------- SOLANA ----------
  const sol = useWallet();

  // ---------- EVM minimal state ----------
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [evmConnecting, setEvmConnecting] = useState(false);
  const evmConnectedRef = useRef(false);

  // Detect provider presence
  const hasProvider = useMemo(() => {
    if (chain === 'solana') {
      return true;
    }
    return typeof window !== 'undefined' && !!(window as any).ethereum;
  }, [chain]);

  // EVM: read accounts silently on chain change
  useEffect(() => {
    if (chain === 'solana') return;
    const anyWin = (typeof window !== 'undefined' ? (window as any) : undefined);
    if (anyWin?.ethereum?.request) {
      anyWin.ethereum
        .request({ method: 'eth_accounts' })
        .then((accs: string[]) => {
          setEvmAddress(accs?.[0] ?? null);
          evmConnectedRef.current = !!accs?.[0];
        })
        .catch(() => {
          setEvmAddress(null);
          evmConnectedRef.current = false;
        });
    } else {
      setEvmAddress(null);
      evmConnectedRef.current = false;
    }
  }, [chain]);

  const wallets: WalletListItem[] = useMemo(() => {
    if (chain === 'solana') {
      return sol.wallets.map((w) => ({
        name: w.adapter.name as WalletName,
        icon: (w.adapter as any).icon,
        readyState: w.readyState,
      }));
    }
    const injected = getInjectedEvmName();
    return injected ? [{ name: injected as WalletName }] : [];
  }, [chain, sol.wallets]);

  const icon = useMemo(() => {
    if (chain === 'solana') {
      return (sol.wallet?.adapter as any)?.icon as string | undefined;
    }
    return undefined;
  }, [chain, sol.wallet]);

  const address = useMemo(() => {
    if (chain === 'solana') {
      return sol.publicKey ? sol.publicKey.toBase58() : null;
    }
    return evmAddress;
  }, [chain, sol.publicKey, evmAddress]);

  const connected = useMemo(() => {
    if (chain === 'solana') return sol.connected;
    return !!evmAddress;
  }, [chain, sol.connected, evmAddress]);

  const connecting = useMemo(() => {
    if (chain === 'solana') return sol.connecting;
    return evmConnecting;
  }, [chain, sol.connecting, evmConnecting]);

  const select = (name: WalletName) => {
    if (chain === 'solana' && typeof sol.select === 'function') {
      sol.select(name);
    }
    // EVM: single injected provider — nothing to select
  };

  const connect = async () => {
    if (chain === 'solana') {
      await sol.connect();
      return;
    }
    const anyWin = (typeof window !== 'undefined' ? (window as any) : undefined);
    if (!anyWin?.ethereum?.request) {
      throw new Error('No EVM provider detected');
    }
    try {
      setEvmConnecting(true);
      const accounts: string[] = await anyWin.ethereum.request({ method: 'eth_requestAccounts' });
      setEvmAddress(accounts?.[0] ?? null);
      evmConnectedRef.current = !!accounts?.[0];
    } finally {
      setEvmConnecting(false);
    }
  };

  const disconnect = async () => {
    if (chain === 'solana') {
      await sol.disconnect();
      return;
    }
    setEvmAddress(null);
    evmConnectedRef.current = false;
  };

  return {
    chain,
    address,
    connected,
    connecting,
    wallets,
    select,
    connect,
    disconnect,
    icon,
    hasProvider,
  };
}
