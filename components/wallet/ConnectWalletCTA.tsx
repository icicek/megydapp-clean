'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useChainWallet from '@/hooks/useChainWallet';
import { useChain } from '@/app/providers/ChainProvider';
import { addressExplorer } from '@/lib/explorer';
import type { WalletName, WalletReadyState } from '@solana/wallet-adapter-base';

// Solana modalını korumak için:
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

type Panel = 'actions' | 'pick';

function short(k: string) {
  return k.slice(0, 4) + '…' + k.slice(-4);
}

export default function ConnectWalletCTA() {
  const { chain } = useChain();
  const { address, connected, connecting, wallets, select, connect, disconnect, icon, hasProvider } =
    useChainWallet();
  const { setVisible } = useWalletModal(); // Solana modal

  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>('actions');
  const [err, setErr] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<WalletName | null>(null);

  // buton / menü referansları
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // mobil yerleşim için pozisyon state (fixed + clamp)
  const [mobileStyle, setMobileStyle] = useState<React.CSSProperties>({});

  // “installed/loadable” olanları uniq filtrele (Solana için anlamlı)
  const available = useMemo(() => {
    if (chain !== 'solana') return wallets;
    const seen = new Set<string>();
    return wallets
      .filter((w) =>
        String(w.readyState ?? '').match(/Installed|Loadable/i)
      )
      .filter((w) => {
        const key = String(w.name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [wallets, chain]);

  // dış tıklamada kapat
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPanel('actions');
      }
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // bağlılık değişince paneli ayarla
  useEffect(() => {
    setPanel(connected ? 'actions' : chain === 'solana' ? 'pick' : 'actions');
  }, [connected, chain]);

  // Solana: seçim sonrası otomatik bağlanma yarışı çözücü
  useEffect(() => {
    (async () => {
      if (chain !== 'solana') return;
      if (!pendingName) return;
      // küçük gecikme ile connect tetikle
      try {
        await new Promise((r) => setTimeout(r, 50));
        await connect();
        setOpen(false);
        setErr(null);
      } catch (e: any) {
        const msg = String(e?.message || e || '');
        setErr(msg || 'Failed to connect.');
      } finally {
        setPendingName(null);
        setPanel('actions');
      }
    })();
  }, [pendingName, connect, chain]);

  // menü açıldığında mobilde konum hesapla (butonun altı, ekrana sığdır)
  useEffect(() => {
    if (!open) return;
    if (typeof window === 'undefined') return;

    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    if (isDesktop) {
      setMobileStyle({});
      return;
    }

    const place = () => {
      const btn = triggerRef.current;
      const menu = menuRef.current;
      if (!btn || !menu) return;

      const rect = btn.getBoundingClientRect();

      const margin = 10;
      const maxW = Math.min(288, window.innerWidth - margin * 2); // ~w-72
      const menuW = maxW;

      // buton ortasına göre x, sonra clamp
      let left = rect.left + rect.width / 2 - menuW / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - menuW - margin));

      // önce yaklaşık top hesapla (butonun altı)
      let top = rect.bottom + 8;

      // geçici width ile stil uygula, sonra yükseklik ölçüp alt taşmayı düzelt
      setMobileStyle({
        position: 'fixed',
        left,
        top,
        width: menuW,
      });

      // bir frame sonra yükseklik ölç
      requestAnimationFrame(() => {
        const h = menu.getBoundingClientRect().height || 0;
        let t = rect.bottom + 8;
        if (t + h + margin > window.innerHeight) {
          t = Math.max(margin, window.innerHeight - h - margin); // aşağı sığmıyorsa yukarı al
        }
        setMobileStyle({
          position: 'fixed',
          left,
          top: t,
          width: menuW,
        });
      });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place);
    };
  }, [open]);

  // seçim / toggle
  const handlePick = (name: WalletName) => {
    setErr(null);
    if (chain === 'solana') {
      setPendingName(name);
      select(name);
      return;
    }
    // EVM: seçilecek çoklu cüzdan yok; connect tetikle
    connect().catch((e) => setErr(String(e?.message || e) || 'Failed to connect.'));
  };

  const handleToggle = () => {
    setErr(null);
    if (!connected && chain === 'solana') setPanel('pick');
    setOpen((v) => !v);
  };

  const handleChangeWallet = () => {
    if (chain === 'solana') {
      // native Solana modalını da açabiliriz (opsiyonel):
      setVisible(true);
      setPanel('pick');
    } else {
      // EVM: tekrar connect isteği göster
      connect().catch((e) => setErr(String(e?.message || e) || 'Failed to connect.'));
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } finally {
      setOpen(false);
      setPanel('actions');
    }
  };

  const handleCopy = async () => {
    try {
      if (address) await navigator.clipboard.writeText(address);
    } catch {}
    setOpen(false);
  };

  const explorerUrl = address ? addressExplorer(chain, address) : '#';

  const links = {
    phantom: 'https://phantom.app/download',
    backpack: 'https://www.backpack.app/download',
    metamask: 'https://metamask.io/download/',
  };

  return (
    <div className="relative inline-block text-left" ref={rootRef}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="bg-indigo-600 hover:bg-indigo-700 rounded px-3 py-2 text-sm font-semibold disabled:opacity-60 flex items-center gap-2"
        aria-expanded={open}
        aria-haspopup="true"
        disabled={connecting}
      >
        {connected && address ? (
          <>
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} alt="" className="h-4 w-4 rounded-sm" />
            ) : (
              <span>👛</span>
            )}
            <span>{short(address)}</span>
            <svg
              className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" />
            </svg>
          </>
        ) : (
          <>{connecting ? 'Connecting…' : 'Connect Wallet'}</>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="
            z-50 p-1 rounded-xl border border-white/10 bg-zinc-900 shadow-2xl
            md:absolute md:right-0 md:top-full md:mt-2 md:w-64
          "
          style={mobileStyle} // mobilde fixed + ölçülmüş stil, desktop’ta absolute
        >
          {panel === 'actions' && connected && address ? (
            <div className="py-1">
              <button
                onClick={handleChangeWallet}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm"
                role="menuitem"
              >
                Change wallet
              </button>
              <button
                onClick={handleCopy}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm"
                role="menuitem"
              >
                Copy address
              </button>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="block px-3 py-2 rounded-lg hover:bg-white/10 text-sm"
                role="menuitem"
              >
                View on Explorer
              </a>
              <div className="h-px bg-white/10 my-1" />
              <button
                onClick={handleDisconnect}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm text-red-400 hover:text-red-200"
                role="menuitem"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="py-1">
              {connected && (
                <button
                  onClick={() => setPanel('actions')}
                  className="w-full px-3 py-2 text-left text-xs uppercase tracking-wide text-gray-400 hover:bg-white/5 rounded-md"
                >
                  ← Back
                </button>
              )}

              {/* Cüzdan yoksa indirme önerileri */}
              {(!hasProvider || (chain === 'solana' && available.length === 0)) && (
                <div className="px-3 py-2 text-sm text-gray-200 space-y-2">
                  <div className="text-gray-300">
                    No wallet detected. Install one to continue:
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {chain === 'solana' ? (
                      <>
                        <a
                          href={links.phantom}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-white/5 hover:bg-white/10 px-2 py-2 text-center"
                        >
                          Phantom
                        </a>
                        <a
                          href={links.backpack}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-white/5 hover:bg-white/10 px-2 py-2 text-center"
                        >
                          Backpack
                        </a>
                        <a
                          href={links.metamask}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-white/5 hover:bg-white/10 px-2 py-2 text-center"
                        >
                          MetaMask
                        </a>
                      </>
                    ) : (
                      <>
                        <a
                          href={links.metamask}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-white/5 hover:bg-white/10 px-2 py-2 text-center"
                        >
                          MetaMask
                        </a>
                        <a
                          href={links.phantom}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-white/5 hover:bg-white/10 px-2 py-2 text-center"
                        >
                          Phantom
                        </a>
                        <a
                          href={links.backpack}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-white/5 hover:bg-white/10 px-2 py-2 text-center"
                        >
                          Backpack
                        </a>
                      </>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    On mobile, opening this site inside your wallet app’s browser gives the best result.
                  </div>
                </div>
              )}

              {/* Solana için cüzdan listesi */}
              {chain === 'solana' &&
                available.map((w) => {
                  const name = String(w.name) as WalletName;
                  const icon = (w as any).icon as string | undefined;
                  return (
                    <button
                      key={name}
                      onClick={() => handlePick(name)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-800 flex items-center gap-2 rounded-md disabled:opacity-60"
                      role="menuitem"
                      disabled={connecting}
                    >
                      {icon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={icon} alt="" className="h-4 w-4 rounded" />
                      )}
                      <span>{name}</span>
                    </button>
                  );
                })}

              {/* EVM için tek “Connect” seçeneği */}
              {chain !== 'solana' && hasProvider && (
                <button
                  onClick={() =>
                    connect().catch((e) =>
                      setErr(String(e?.message || e) || 'Failed to connect.')
                    )
                  }
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-800 rounded-md"
                  role="menuitem"
                  disabled={connecting}
                >
                  Connect
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {err && <div className="mt-1 text-xs text-red-400 max-w-xs">{err}</div>}
    </div>
  );
}
