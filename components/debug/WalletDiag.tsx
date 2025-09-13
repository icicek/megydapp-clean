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
  const { wallets, wallet, select, connect, disconnect, connected, connecting, publicKey } = useWallet();
  const [log, setLog] = useState<string[]>([]);

  const append = (m: string) => setLog((p) => [...p, `[${new Date().toLocaleTimeString()}] ${m}`]);

  const summary = useMemo(
    () => wallets.map((w) => `${w.adapter.name}(${w.readyState})`).join(', '),
    [wallets]
  );
  useEffect(() => { append(`adapters: ${summary}`); }, [summary]);

  const waitUntilSelected = async (name: WalletName, tries = 20) => {
    for (let i = 0; i < tries; i++) {
      // state commit edilene kadar 10–25ms aralıklarla bekle
      if (wallet?.adapter?.name === name) return true;
      await sleep(25);
    }
    return wallet?.adapter?.name === name;
  };

  const connectBy = async (name: WalletName) => {
    try {
      const found = wallets.find((w) => (w.adapter.name as WalletName) === name);
      append(`select(${name}) rs=${found?.readyState}`);
      if (!found || !['Installed', 'Loadable'].includes(String(found.readyState))) {
        append(`SKIP ${name} — not ready`);
        return;
      }
      select(name);

      // 🔸 kritik: seçimin gerçekten state'e yazılmasını bekle
      const ok = await waitUntilSelected(name);
      append(ok ? `selected=${name}` : `WARN: not selected yet (${wallet?.adapter?.name || '-'})`);

      append('connect()…');
      await connect();
      append(`CONNECTED: ${publicKey?.toBase58() || '(no pk yet)'}`);
    } catch (e: any) {
      append(`ERROR(${name}): ${e?.message || String(e)}`);
      // eslint-disable-next-line no-console
      console.error('[Diag connect error]', name, e);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <WalletMultiButton />
      <div style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 12 }}>
        <button onClick={() => connectBy(PhantomWalletName)} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20">
          Connect Phantom
        </button>
        <button onClick={() => connectBy(SolflareWalletName)} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20">
          Connect Solflare
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
