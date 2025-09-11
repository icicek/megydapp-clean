// örn. components/CoincarnateFlow.tsx (ConfirmModal'ı açan parent)
import { useEffect, useState } from 'react';
import ConfirmModal from '@/components/ConfirmModal';

type PriceView = {
  fetchStatus: 'loading' | 'found' | 'not_found' | 'error';
  usdValue: number; // toplam (amount * unit)
  priceSources: { price: number; source: string }[];
};

export default function CoincarnateFlow({ mint, symbol }: { mint: string; symbol?: string }) {
  const [isOpen, setOpen] = useState(false);
  const [amount, setAmount] = useState(0); // kullanıcı girişi
  const [price, setPrice] = useState<PriceView>({ fetchStatus: 'loading', usdValue: 0, priceSources: [] });

  // Modal açıldığında ve/veya amount/mint değiştiğinde fiyatı çek
  useEffect(() => {
    let abort = false;
    async function run() {
      if (!isOpen || !mint || !(amount > 0)) return;
      setPrice({ fetchStatus: 'loading', usdValue: 0, priceSources: [] });

      const qs = new URLSearchParams({ mint, amount: String(amount) });
      if (symbol) qs.set('symbol', symbol);

      const res = await fetch(`/api/proxy/price?${qs}`, { cache: 'no-store' });
      const json = await res.json();

      if (abort) return;

      const ok = !!json?.ok || !!json?.success;
      if (!ok) {
        setPrice({ fetchStatus: json?.status === 'not_found' ? 'not_found' : 'error', usdValue: 0, priceSources: [] });
        return;
      }

      // unit → total
      const unit = Number(json?.priceUsd ?? 0);
      const summed = Number(json?.usdValue ?? 0);
      const total = summed > 0 ? summed : unit * amount;

      // sources (yoksa tekil kaynaktan inşa et)
      const sources =
        Array.isArray(json?.sources) && json.sources.length
          ? json.sources
          : unit > 0 && json?.source
          ? [{ source: String(json.source), price: unit }]
          : [];

      setPrice({
        fetchStatus: 'found',
        usdValue: Number.isFinite(total) ? total : 0,
        priceSources: sources,
      });
    }
    run();
    return () => {
      abort = true;
    };
  }, [isOpen, mint, symbol, amount]);

  return (
    <>
      {/* … form …  setOpen(true) ile modalı açıyorsun */}
      <ConfirmModal
        tokenSymbol={symbol || '—'}
        amount={amount}
        usdValue={price.usdValue}
        priceSources={price.priceSources}
        fetchStatus={price.fetchStatus}
        tokenMint={mint}
        tokenCategory={null}
        isOpen={isOpen}
        onConfirm={() => {/* … */}}
        onCancel={() => setOpen(false)}
        onDeadcoinVote={() => {}}
      />
    </>
  );
}
