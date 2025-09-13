// components/debug/WalletDiag.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import type { WalletName } from '@solana/wallet-adapter-base';
import { PhantomWalletName } from '@solana/wallet-adapter-phantom';
import { SolflareWalletName } from '@solana/wallet-adapter-solflare';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function WalletDiag() {
  const { wallets, wallet, select, disconnect, connected, connecting, publicKey } = useWallet();
  const [log, setLog] = useState<string[]>([]);

  const append = (m: string) => setLog((p) => [...p, `[${new Date().toLocaleTimeString()}] ${m}`]);

  const summary = useMemo(
    () => wallets.map((w) => `${w.adapter.name}(${w.readyState})`).join(', '),
    [wallets]
  );
  useEffect(() => { append(`adapters: ${summary}`); }, [summary]);

  async function connectViaAdapter(name: WalletName) {
    const entry = wallets.find((w) => (w.adapter.name as WalletName) === name);
    if (!entry) return append(`SKIP ${name} — not found`);

    const { adapter, readyState } = entry;
    append(`target=${adapter.name} rs=${readyState}`);

    if (!['Installed', 'Loadable'].includes(String(readyState))) {
      return append(`SKIP ${name} — not ready (${readyState})`);
    }

    try {
      // 1) UI tutarlılığı için seç, fakat bağlanmayı adapter üzerinden yap
      select(name);
      await Promise.resolve(); // microtask

      // 2) Event dinle
      const onConnect = () => append(`EVENT connect: ${adapter.publicKey?.toBase58() || '-'}`);
      const onDisconnect = () => append('EVENT disconnect');
      const onError = (e: any) => append(`EVENT error: ${e?.message || String(e)}`);
      adapter.on('connect', onConnect);
      adapter.on('disconnect', onDisconnect);
      adapter.on('error', onError);

      // 3) Bağlan
      append('adapter.connect()…');
      await adapter.connect();

      // 4) Kısa bekleme: publicKey’in propagate olması için
      for (let i = 0; i < 40; i++) {
        if (adapter.publicKey) break;
        await sleep(25);
      }

      append(
        `ADAPTER STATE: connected=${String((adapter as any).connected)} key=${adapter.publicKey?.toBase58() || '-'}`
      );
    } catch (e: any) {
      append(`ERROR(${name}): ${e?.message || String(e)}`);
      // eslint-disable-next-line no-console
      console.error('[Diag] adapter.connect error', name, e);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <WalletMultiButton />

      <div style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 12 }}>
        <button
          onClick={() => connectViaAdapter(PhantomWalletName)}
          className="px-3 py-2 rounded bg-white/10 hover:bg-white/20"
        >
          Connect Phantom (via adapter)
        </button>

        <button
          onClick={() => connectViaAdapter(SolflareWalletName)}
          className="px-3 py-2 rounded bg-white/10 hover:bg-white/20"
        >
          Connect Solflare (via adapter)
        </button>

        <button
          onClick={async () => { await disconnect(); append('DISCONNECTED'); }}
          className="px-3 py-2 rounded bg-white/10 hover:bg-white/20"
        >
          Disconnect
        </button>
      </div>

      <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', opacity: 0.9 }}>
        connected={String(connected)} connecting={String(connecting)} current={wallet?.adapter?.name || '-'}
        {'\n'}pk={publicKey?.toBase58() || '-'}
        {'\n'}logs:
        {'\n'}{log.join('\n')}
      </pre>
    </div>
  );
}
