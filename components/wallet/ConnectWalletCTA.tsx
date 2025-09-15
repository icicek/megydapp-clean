// components/wallet/ConnectWalletCTA.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState, type WalletName } from '@solana/wallet-adapter-base';

type Panel = 'actions' | 'pick';

export default function ConnectWalletCTA() {
  const {
    publicKey,
    disconnect,
    wallets,
    select,
    connect,
    connected,
    connecting,
    wallet, // mevcut seçili cüzdan
  } = useWallet();

  const short = (k: string) => k.slice(0, 4) + '…' + k.slice(-4);

  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>('actions');
  const [err, setErr] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<WalletName | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Yüklü / yüklenebilir cüzdanlar, isim bazında uniq
  const available = useMemo(() => {
    const seen = new Set<string>();
    return wallets
      .filter((w) =>
        [WalletReadyState.Installed, WalletReadyState.Loadable].includes(w.readyState)
      )
      .filter((w) => {
        const key = String(w.adapter.name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [wallets]);

  // Dış tıklamada kapat
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

  // Bağlılık değişince paneli ayarla
  useEffect(() => {
    setPanel(connected ? 'actions' : 'pick');
  }, [connected]);

  // Yarış çözücü: select(name) → provider state pendingName’e geldiğinde connect
  useEffect(() => {
    (async () => {
      if (!pendingName) return;
      const current = wallet?.adapter?.name as WalletName | undefined;

      if (current && current === pendingName && !connected && !connecting) {
        try {
          // MetaMask/Snap bazen injection sonrası 1-2 frame istiyor
          await new Promise((r) => setTimeout(r, 50));
          await connect();
          setOpen(false);
          setErr(null);
        } catch (e: any) {
          // MetaMask Solana hazır değilse: rehber linki öner
          const msg = String(e?.message || e || '');
          const isMetaMask = (current || '').toLowerCase().includes('metamask');
          const hint = isMetaMask
            ? ' MetaMask’te Solana’yı etkinleştirmeniz gerekebilir.'
            : '';
          setErr((msg || 'Failed to connect.') + hint);
        } finally {
          setPendingName(null);
          setPanel('actions');
        }
      }
    })();
  }, [wallet, connected, connecting, pendingName, connect]);

  // Bir cüzdan seç → select; connect() effect’te
  const handlePick = (name: WalletName) => {
    setErr(null);
    setPendingName(name);
    select(name);
  };

  const handleToggle = () => {
    setErr(null);
    if (!connected) setPanel('pick');
    setOpen((v) => !v);
  };

  const handleChangeWallet = () => setPanel('pick');

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
      if (publicKey) await navigator.clipboard.writeText(publicKey.toBase58());
    } catch {}
    setOpen(false);
  };

  const explorerUrl = publicKey
    ? `https://explorer.solana.com/address/${publicKey.toBase58()}`
    : '#';

  // MetaMask bilgi linkleri (yardım göster)
  const metaMaskHelp = 'https://support.metamask.io/configure/networks/navigating-solana/';
  const metaMaskHowTo = 'https://www.quicknode.com/guides/solana-development/wallets/metamask';

  return (
    <div className="relative inline-block text-left" ref={rootRef}>
      {/* Trigger */}
      <button
        onClick={handleToggle}
        className="bg-indigo-600 hover:bg-indigo-700 rounded px-3 py-2 text-sm font-semibold disabled:opacity-60 flex items-center gap-2"
        aria-expanded={open}
        aria-haspopup="true"
        disabled={connecting}
      >
        {connected && publicKey ? (
          <>
            {wallet?.adapter?.icon ? (
              // @ts-ignore adapter.icon çoğu kez string URL
              <img src={wallet.adapter.icon} alt="" className="h-4 w-4 rounded-sm" />
            ) : (
              <span>👛</span>
            )}
            <span>{short(publicKey.toBase58())}</span>
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
          className="absolute right-0 mt-2 w-64 rounded-xl border border-white/10 bg-zinc-900 shadow-2xl p-1 z-50"
          role="menu"
        >
          {panel === 'actions' && connected ? (
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

              {available.length === 0 && (
                <div className="px-4 py-2 text-sm text-gray-400">
                  No wallet detected.
                </div>
              )}

              {available.map((w) => {
                const name = String(w.adapter.name);
                const isMetaMask = name.toLowerCase().includes('metamask');
                return (
                  <div key={name}>
                    <button
                      onClick={() => handlePick(w.adapter.name)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-800 flex items-center gap-2 rounded-md disabled:opacity-60"
                      role="menuitem"
                      disabled={connecting}
                    >
                      {w.adapter.icon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={w.adapter.icon} alt="" className="h-4 w-4 rounded" />
                      )}
                      <span>{name}{isMetaMask ? ' (Solana)' : ''}</span>
                    </button>

                    {/* MetaMask için bağlanma ipucu */}
                    {isMetaMask && !connected && (
                      <div className="px-3 pb-2 text-[11px] text-gray-400">
                        Having trouble? Enable Solana in MetaMask:
                        {' '}
                        <a className="underline" href={metaMaskHelp} target="_blank" rel="noreferrer">Help</a>
                        {' · '}
                        <a className="underline" href={metaMaskHowTo} target="_blank" rel="noreferrer">How-to</a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {err && <div className="mt-1 text-xs text-red-400 max-w-xs">{err}</div>}
    </div>
  );
}
