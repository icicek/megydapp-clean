'use client';

import React, { useMemo, useState } from 'react';
import type { Address } from 'viem';
import useChainWalletEvm from '@/hooks/useChainWalletEvm';
import useChainTokensEvm, { TokenBalance } from '@/hooks/useChainTokensEvm';
import ConfirmModalAdapterEvm from '@/components/evm/ConfirmModalAdapterEvm';
import { fetchErc20UnitPrice, fetchNativeUnitPrice } from '@/lib/pricing/client';

export default function EvmCoincarnationPanel() {
  const evm = useChainWalletEvm();
  const [selected, setSelected] = useState<TokenBalance | null>(null);
  const [amount, setAmount] = useState<string>('');

  // ⚠️ getUsdValue burada tanımlanır ve hook'a parametre olarak verilir
  const { loading, error, balances, reload } = useChainTokensEvm(
    evm.chain,
    (evm.account as Address) ?? null,
    { publicClient: evm.publicClient },
    {
      covalent: process.env.NEXT_PUBLIC_COVALENT_KEY
        ? { apiKey: process.env.NEXT_PUBLIC_COVALENT_KEY }
        : undefined,

      // getUsdValue → her token için TOPLAM USD döndürmeli
      getUsdValue: async (t) => {
        const amt = Number(t.amount || 0);
        if (!Number.isFinite(amt) || amt <= 0) return 0;

        if (t.isNative) {
          const { unitPrice } = await fetchNativeUnitPrice(t.chainId);
          return unitPrice > 0 ? unitPrice * amt : 0;
        }
        if (!t.contract) return 0;

        const { unitPrice } = await fetchErc20UnitPrice(t.chainId, t.contract);
        return unitPrice > 0 ? unitPrice * amt : 0;
      },
      minAmount: 0,
    }
  );

  const [open, setOpen] = useState(false);
  const canSend = useMemo(() =>
    evm.isConnected &&
    selected &&
    Number(amount) > 0
  , [evm.isConnected, selected, amount]);

  return (
    <div className="space-y-4">
      {/* Cüzdan */}
      <div className="flex items-center gap-2">
        {!evm.isConnected ? (
          <button onClick={evm.connect} className="bg-indigo-600 hover:bg-indigo-700 rounded px-3 py-2 text-sm font-semibold text-white">
            Connect EVM Wallet
          </button>
        ) : (
          <>
            <span className="text-sm">
              {evm.chain.name} — {(evm.account ?? '').slice(0,6)}…{(evm.account ?? '').slice(-4)}
            </span>
            <button onClick={evm.disconnect} className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded px-3 py-2 text-xs text-white">
              Disconnect
            </button>
          </>
        )}
      </div>

      {/* Token seçimi */}
      <div className="space-y-2">
        <label className="text-sm">Token</label>
        <select
          className="border rounded px-2 py-1 w-full bg-black/20"
          value={selected ? balances.findIndex(b => b === selected) : ''}
          onChange={(e) => {
            const idx = Number(e.target.value);
            setSelected(Number.isFinite(idx) ? balances[idx] : null);
          }}
        >
          <option value="">Select a token</option>
          {balances.map((t, i) => (
            <option key={`${t.contract ?? 'native'}-${i}`} value={i}>
              {t.symbol} {t.contract ? `(${t.contract.slice(0,6)}…${t.contract.slice(-4)})` : '(native)'}
              {typeof t.usdValue === 'number' ? ` — ~$${Number(t.usdValue).toFixed(2)}` : ''}
            </option>
          ))}
        </select>
        {loading && <div className="text-xs opacity-70">Loading balances…</div>}
        {!!error && (
          <div className="text-xs text-red-400">
            Error: {error instanceof Error ? error.message : String(error)}
          </div>
        )}
        <button onClick={reload} className="text-xs underline opacity-80">reload</button>
      </div>

      {/* Miktar */}
      <div className="space-y-2">
        <label className="text-sm">Amount</label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          className="border rounded px-2 py-1 w-full bg-black/20"
          inputMode="decimal"
        />
      </div>

      {/* Confirm */}
      <button
        disabled={!canSend}
        onClick={() => setOpen(true)}
        className="w-full rounded px-4 py-2 bg-blue-600 text-white disabled:opacity-50"
      >
        Open Confirm
      </button>

      {/* Modal adapter */}
      {open && selected && evm.isConnected && (
        <ConfirmModalAdapterEvm
          isOpen={open}
          onClose={() => setOpen(false)}
          chain={evm.chain}
          account={evm.account as Address}
          walletClient={evm.walletClient}
          publicClient={evm.publicClient}
          token={{
            isNative: selected.isNative,
            symbol: selected.symbol,
            decimals: selected.decimals,
            contract: selected.contract,
            name: selected.name,
          }}
          amount={amount}
          onSuccess={(hash) => {
            console.log('tx hash', hash);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
