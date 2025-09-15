'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState, type WalletName } from '@solana/wallet-adapter-base';

export default function ConnectWalletCTA() {
  const {
    publicKey,
    disconnect,
    wallets,
    select,
    connect,
    connected,
    connecting,
    wallet, // 👈 mevcut seçili cüzdan (provider state)
  } = useWallet();

  const short = (k: string) => k.slice(0, 4) + '…' + k.slice(-4);

  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Seçilen cüzdan adını burada tutuyoruz; provider state'e yansıdığında connect edeceğiz
  const [pendingName, setPendingName] = useState<WalletName | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);

  // Sadece kullanılabilir cüzdanlar (Installed / Loadable) + isim bazında uniq
  const available = useMemo(() => {
    const seen = new Set<string>();
    return wallets
      .filter(
        (w) =>
          w.readyState === WalletReadyState.Installed ||
          w.readyState === WalletReadyState.Loadable
      )
      .filter((w) => {
        const key = String(w.adapter.name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [wallets]);

  // Dış tıklamada menüyü kapat
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // 👇 Yarışı çözen kısım:
  // - handlePick -> select(name) + pendingName = name
  // - Bu effect, provider state'teki wallet adı pendingName'e eşit olduğunda connect() çağırır.
  useEffect(() => {
    (async () => {
      if (!pendingName) return;
      const current = wallet?.adapter?.name as WalletName | undefined;

      if (
        current &&
        current === pendingName &&
        !connected &&
        !connecting
      ) {
        try {
          // küçük bir microtask/raf beklemek bazı ortamlarda daha stabil
          await new Promise((r) => setTimeout(r, 0));
          await connect();
          setOpen(false);
          setErr(null);
        } catch (e: any) {
          setErr(e?.message || 'Failed to connect.');
        } finally {
          setPendingName(null);
        }
      }
    })();
  }, [wallet, connected, connecting, pendingName, connect]);

  // Bir cüzdan seç → önce select, connect'i effect’e bırak
  const handlePick = (name: WalletName) => {
    setErr(null);
    setPendingName(name);
    select(name); // state güncellemesini tetikle
  };

  if (publicKey) {
    return (
      <button
        onClick={() => disconnect()}
        className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
        aria-label="Disconnect wallet"
      >
        {short(publicKey.toBase58())} — Disconnect
      </button>
    );
  }

  return (
    <div className="relative inline-block text-left" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="bg-indigo-600 hover:bg-indigo-700 rounded px-3 py-2 text-sm font-semibold"
        aria-expanded={open}
        aria-haspopup="true"
        disabled={connecting}
      >
        {connecting ? 'Connecting…' : 'Connect Wallet'}
      </button>

      {open && (
        <div
          className="absolute z-50 mt-2 w-56 origin-top-right rounded-md bg-gray-900 border border-gray-700 shadow-lg focus:outline-none"
          role="menu"
        >
          <div className="py-1">
            {available.length === 0 && (
              <div className="px-4 py-2 text-sm text-gray-400">
                No wallet detected.
              </div>
            )}
            {available.map((w) => (
              <button
                key={w.adapter.name as string}
                onClick={() => handlePick(w.adapter.name)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-800 flex items-center gap-2"
                role="menuitem"
              >
                {/* adapter.icon bazen data URL döner */}
                {w.adapter.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={w.adapter.icon}
                    alt=""
                    className="h-4 w-4 rounded"
                  />
                )}
                <span>{w.adapter.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {err && (
        <div className="mt-1 text-xs text-red-400 max-w-xs">{err}</div>
      )}
    </div>
  );
}
