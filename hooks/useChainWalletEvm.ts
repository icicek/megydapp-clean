'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  type Address,
  type Chain,
  type EIP1193Provider,
} from 'viem';
import {
  mainnet,
  bsc,
  polygon,
  base,
  arbitrum,
} from 'viem/chains';

type AnnounceDetail = {
  info: {
    uuid: string;
    name: string;
    icon: string;       // data URI
    rdns?: string;
  };
  provider: EIP1193Provider;
};

export type DiscoveredWallet = {
  id: string;              // info.uuid
  name: string;
  icon: string;            // data URI
  rdns?: string;
  provider: EIP1193Provider;
};

export type EvmWalletState = {
  isReady: boolean;
  isConnected: boolean;
  account: Address | null;
  chainId: number | null;
  chain: Chain;
  wallets: DiscoveredWallet[];
  walletClient: ReturnType<typeof createWalletClient> | null;
  publicClient: ReturnType<typeof createPublicClient>;
  selectWallet: (id: string) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: (next: Chain) => Promise<void>;
  setChain: (next: Chain) => void;
};

// Supported chains (extendable)
export const EVM_CHAINS: Chain[] = [mainnet, bsc, polygon, base, arbitrum];

function toHexChainId(n: number) {
  return `0x${n.toString(16)}`;
}

export default function useChainWalletEvm(initialChain: Chain = mainnet): EvmWalletState {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => wallets.find(w => w.id === selectedId) ?? wallets[0],
    [wallets, selectedId]
  );

  const [chain, setChain] = useState<Chain>(initialChain);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletClient, setWalletClient] = useState<ReturnType<typeof createWalletClient> | null>(null);

  const publicClient = useMemo(
    () => createPublicClient({ chain, transport: http() }),
    [chain]
  );

  const isConnected = !!account && !!chainId && !!walletClient;

  // --- EIP-6963 discovery ---
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlers = new Set<string>();

    const onAnnounce = (event: Event) => {
      const e = event as CustomEvent<AnnounceDetail>;
      const { info, provider } = e.detail || ({} as AnnounceDetail);
      if (!info?.uuid || !provider) return;
      if (handlers.has(info.uuid)) return;

      handlers.add(info.uuid);
      setWallets(prev => {
        if (prev.some(w => w.id === info.uuid)) return prev;
        return [...prev, { id: info.uuid, name: info.name, icon: info.icon, rdns: info.rdns, provider }];
      });
    };

    window.addEventListener('eip6963:announceProvider', onAnnounce as EventListener);
    // request providers to announce themselves
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Fallback: legacy window.ethereum
    const anyWin = window as any;
    const legacy = anyWin?.ethereum as EIP1193Provider | undefined;
    if (legacy && !handlers.has('legacy:window.ethereum')) {
      handlers.add('legacy:window.ethereum');
      setWallets(prev => {
        if (prev.some(w => w.id === 'legacy:window.ethereum')) return prev;
        return [
          ...prev,
          {
            id: 'legacy:window.ethereum',
            name: (legacy as any)?.isMetaMask ? 'MetaMask (legacy)' : 'Injected (legacy)',
            icon: '', // unknown
            provider: legacy,
          },
        ];
      });
    }

    return () => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce as EventListener);
    };
  }, []);

  const providerRef = useRef<EIP1193Provider | null>(null);
  useEffect(() => {
    providerRef.current = selected?.provider ?? null;
  }, [selected]);

  const selectWallet = useCallback((id: string) => setSelectedId(id), []);

  const connect = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider) throw new Error('No EIP-1193 provider selected/found');

    // Request accounts
    const addresses = (await provider.request({ method: 'eth_requestAccounts' })) as Address[];
    const hexChainId = (await provider.request({ method: 'eth_chainId' })) as `0x${string}`;
    const cid = Number(hexChainId);

    // build viem client
    const wc = createWalletClient({ chain, transport: custom(provider) });
    setWalletClient(wc);
    setAccount(addresses?.[0] ?? null);
    setChainId(cid);

    // subscribe to changes
    const onAccountsChanged = (accs: Address[]) => setAccount(accs?.[0] ?? null);
    const onChainChanged = (nextHex: `0x${string}`) => setChainId(Number(nextHex));

    provider.on?.('accountsChanged', onAccountsChanged);
    provider.on?.('chainChanged', onChainChanged);

    // Store handlers so that disconnect/unmount can remove them
    (providerRef as any).listeners = { onAccountsChanged, onChainChanged };
  }, [chain]);

  const disconnect = useCallback(async () => {
    const provider = providerRef.current as any;
    // Some providers implement .disconnect()
    if (provider?.disconnect) {
      try { await provider.disconnect(); } catch {}
    }
    // remove listeners if we added them
    if (provider?.removeListener && (providerRef as any).listeners) {
      const { onAccountsChanged, onChainChanged } = (providerRef as any).listeners;
      try { provider.removeListener('accountsChanged', onAccountsChanged); } catch {}
      try { provider.removeListener('chainChanged', onChainChanged); } catch {}
      (providerRef as any).listeners = undefined;
    }
    setWalletClient(null);
    setAccount(null);
    setChainId(null);
  }, []);

  const switchChain = useCallback(async (next: Chain) => {
    const provider = providerRef.current;
    if (!provider) throw new Error('No provider');
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: toHexChainId(next.id) }],
      });
    } catch (err: any) {
      // Optional: handle add chain
      if (err?.code === 4902 /* unknown chain */) {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: toHexChainId(next.id),
            chainName: next.name,
            nativeCurrency: next.nativeCurrency,
            rpcUrls: next.rpcUrls.default.http,
            blockExplorerUrls: next.blockExplorers ? [next.blockExplorers.default.url] : [],
          }],
        });
      } else {
        throw err;
      }
    }
    setChain(next);
    setChainId(next.id);
    // Recreate walletClient for the new chain
    setWalletClient(createWalletClient({ chain: next, transport: custom(provider) }));
  }, []);

  const isReady = typeof window !== 'undefined';

  useEffect(() => {
    return () => { // unmount
      const provider = providerRef.current as any;
      if (provider?.removeListener && (providerRef as any).listeners) {
        const { onAccountsChanged, onChainChanged } = (providerRef as any).listeners;
        try { provider.removeListener('accountsChanged', onAccountsChanged); } catch {}
        try { provider.removeListener('chainChanged', onChainChanged); } catch {}
      }
    };
  }, []);

  return {
    isReady,
    isConnected,
    account,
    chainId,
    chain,
    wallets,
    walletClient,
    publicClient,
    selectWallet,
    connect,
    disconnect,
    switchChain,
    setChain,
  };
}
