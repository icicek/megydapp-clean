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
import { mainnet, bsc, polygon, base, arbitrum } from 'viem/chains';

type AnnounceDetail = {
  info: { uuid: string; name: string; icon: string; rdns?: string };
  provider: EIP1193Provider;
};

export type DiscoveredWallet = {
  id: string; name: string; icon: string; rdns?: string; provider: EIP1193Provider;
};

export type EvmWalletState = {
  isReady: boolean;
  isConnected: boolean;
  account: Address | null;
  chainId: number | null;
  chain: Chain;
  wallets: DiscoveredWallet[];
  walletClient: ReturnType<typeof createWalletClient> | null;
  publicClient: ReturnType<typeof createPublicClient>;   // ✅ her zaman mevcut (provider varsa custom, yoksa http)
  selectWallet: (id: string) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: (next: Chain) => Promise<void>;
  setChain: (next: Chain) => void;
};

export const EVM_CHAINS: Chain[] = [mainnet, bsc, polygon, base, arbitrum];

function toHexChainId(n: number) { return `0x${n.toString(16)}`; }

export default function useChainWalletEvm(initialChain: Chain = mainnet): EvmWalletState {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => wallets.find(w => w.id === selectedId) ?? wallets[0], [wallets, selectedId]);

  const [chain, setChain] = useState<Chain>(initialChain);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletClient, setWalletClient] = useState<ReturnType<typeof createWalletClient> | null>(null);

  // ❗️HTTP tabanlı “genel” client (fallback olarak durur)
  const httpPublicClient = useMemo(() => createPublicClient({ chain, transport: http() }), [chain]);

  // ✅ Provider geldiğinde burayı custom(provider) ile dolduracağız
  const [providerPublicClient, setProviderPublicClient] =
    useState<ReturnType<typeof createPublicClient> | null>(null);

  // Dışarıya verdiğimiz publicClient: provider varsa onu kullan, yoksa http
  const publicClient = providerPublicClient ?? httpPublicClient;

  const isConnected = !!account && !!chainId && !!walletClient;
  const isReady = typeof window !== 'undefined';

  // ---- EIP-6963 discovery ----
  useEffect(() => {
    if (!isReady) return;

    const handlers = new Set<string>();
    const onAnnounce = (event: Event) => {
      const e = event as CustomEvent<AnnounceDetail>;
      const { info, provider } = e.detail || ({} as AnnounceDetail);
      if (!info?.uuid || !provider || handlers.has(info.uuid)) return;
      handlers.add(info.uuid);
      setWallets(prev => (prev.some(w => w.id === info.uuid) ? prev
        : [...prev, { id: info.uuid, name: info.name, icon: info.icon, rdns: info.rdns, provider }]));
    };

    window.addEventListener('eip6963:announceProvider', onAnnounce as EventListener);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Legacy window.ethereum
    const legacy = (window as any)?.ethereum as EIP1193Provider | undefined;
    if (legacy && !handlers.has('legacy:window.ethereum')) {
      handlers.add('legacy:window.ethereum');
      setWallets(prev => (prev.some(w => w.id === 'legacy:window.ethereum') ? prev : [
        ...prev,
        { id: 'legacy:window.ethereum', name: (legacy as any)?.isMetaMask ? 'MetaMask (legacy)' : 'Injected (legacy)', icon: '', provider: legacy },
      ]));
    }
    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce as EventListener);
  }, [isReady]);

  // Seçili provider referansı
  const providerRef = useRef<EIP1193Provider | null>(null);
  useEffect(() => { providerRef.current = selected?.provider ?? null; }, [selected]);

  const selectWallet = useCallback((id: string) => setSelectedId(id), []);

  const wireListeners = useCallback((provider: EIP1193Provider) => {
    const onAccountsChanged = (accs: Address[]) => setAccount(accs?.[0] ?? null);
    const onChainChanged = (nextHex: `0x${string}`) => setChainId(Number(nextHex));
    provider.on?.('accountsChanged', onAccountsChanged);
    provider.on?.('chainChanged', onChainChanged);
    (providerRef as any).listeners = { onAccountsChanged, onChainChanged };
  }, []);

  const connect = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider) throw new Error('No EIP-1193 provider selected/found');

    const addresses = (await provider.request({ method: 'eth_requestAccounts' })) as Address[];
    const hexChainId = (await provider.request({ method: 'eth_chainId' })) as `0x${string}`;
    const wc = createWalletClient({ chain, transport: custom(provider) });

    setWalletClient(wc);
    setAccount(addresses?.[0] ?? null);
    setChainId(Number(hexChainId));
    setProviderPublicClient(createPublicClient({ chain, transport: custom(provider) })); // ✅ okuma da provider’dan

    wireListeners(provider);
  }, [chain, wireListeners]);

  const disconnect = useCallback(async () => {
    const provider = providerRef.current as any;
    if (provider?.disconnect) { try { await provider.disconnect(); } catch {} }
    if (provider?.removeListener && (providerRef as any).listeners) {
      const { onAccountsChanged, onChainChanged } = (providerRef as any).listeners;
      try { provider.removeListener('accountsChanged', onAccountsChanged); } catch {}
      try { provider.removeListener('chainChanged', onChainChanged); } catch {}
      (providerRef as any).listeners = undefined;
    }
    setWalletClient(null);
    setProviderPublicClient(null);
    setAccount(null);
    setChainId(null);
  }, []);

  const switchChain = useCallback(async (next: Chain) => {
    const provider = providerRef.current;
    if (!provider) throw new Error('No provider');
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: toHexChainId(next.id) }] });
    } catch (err: any) {
      if (err?.code === 4902) {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{ chainId: toHexChainId(next.id), chainName: next.name, nativeCurrency: next.nativeCurrency,
            rpcUrls: next.rpcUrls.default.http, blockExplorerUrls: next.blockExplorers ? [next.blockExplorers.default.url] : [] }],
        });
      } else { throw err; }
    }
    setChain(next);
    setChainId(next.id);
    // ✅ provider üzerinden public client’ı yeni chain ile yeniden kur
    setProviderPublicClient(createPublicClient({ chain: next, transport: custom(provider) }));
  }, []);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      const provider = providerRef.current as any;
      if (provider?.removeListener && (providerRef as any).listeners) {
        const { onAccountsChanged, onChainChanged } = (providerRef as any).listeners;
        try { provider.removeListener('accountsChanged', onAccountsChanged); } catch {}
        try { provider.removeListener('chainChanged', onChainChanged); } catch {}
      }
    };
  }, []);

  // ✅ Eager detection: yetkili provider varsa otomatik bağlan
  useEffect(() => {
    if (!isReady || wallets.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const w of wallets) {
        try {
          const accs = (await w.provider.request({ method: 'eth_accounts' })) as Address[];
          if (!accs || accs.length === 0) continue;
          if (cancelled) return;

          setSelectedId(w.id);
          const hex = (await w.provider.request({ method: 'eth_chainId' })) as `0x${string}`;
          const wc = createWalletClient({ chain, transport: custom(w.provider) });

          wireListeners(w.provider);
          setWalletClient(wc);
          setAccount(accs[0]);
          setChainId(Number(hex));
          setProviderPublicClient(createPublicClient({ chain, transport: custom(w.provider) })); // ✅
          break;
        } catch { /* diğer sağlayıcıya geç */ }
      }
    })();
    return () => { cancelled = true; };
  }, [isReady, wallets, chain, wireListeners]);

  // Seçimi sonradan değiştirirse tekrar eager bağla
  useEffect(() => {
    if (!isReady || !selected?.provider) return;
    let cancelled = false;
    (async () => {
      try {
        const accs = (await selected.provider.request({ method: 'eth_accounts' })) as Address[];
        if (!accs || accs.length === 0 || cancelled) return;
        const hex = (await selected.provider.request({ method: 'eth_chainId' })) as `0x${string}`;
        const wc = createWalletClient({ chain, transport: custom(selected.provider) });

        wireListeners(selected.provider);
        setWalletClient(wc);
        setAccount(accs[0]);
        setChainId(Number(hex));
        setProviderPublicClient(createPublicClient({ chain, transport: custom(selected.provider) })); // ✅
      } catch { /* sessiz */ }
    })();
    return () => { cancelled = true; };
  }, [isReady, selected?.id, chain, wireListeners]);

  return {
    isReady,
    isConnected,
    account,
    chainId,
    chain,
    wallets,
    walletClient,
    publicClient, // ✅ artık provider üzerinden okuyor (CORS yok)
    selectWallet,
    connect,
    disconnect,
    switchChain,
    setChain,
  };
}
