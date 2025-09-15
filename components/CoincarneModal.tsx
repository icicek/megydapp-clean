// components/CoincarneModal.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getMint,
} from '@solana/spl-token';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { connection } from '@/lib/solanaConnection';
import CoincarnationResult from '@/components/CoincarnationResult';
import ConfirmModal from '@/components/ConfirmModal';
import { fetchTokenMetadata } from '@/app/api/utils/fetchTokenMetadata';
import { TokenCategory } from '@/app/api/utils/classifyToken';
import { checkTokenLiquidityAndVolume } from '@/app/api/utils/checkTokenLiquidityAndVolume';
import { useInternalBalance, quantize } from '@/hooks/useInternalBalance';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const COINCARNATION_DEST = new PublicKey('HPBNVF9ATsnkDhGmQB4xoLC5tWBWQbTyBjsiQAN3dYXH');

interface TokenInfo {
  mint: string;
  amount: number;
  symbol?: string;
  logoURI?: string;
}

interface CoincarneModalProps {
  token: TokenInfo;
  onClose: () => void;
  refetchTokens?: () => void;
  onGoToProfileRequest?: () => void;
}

type PriceView = {
  fetchStatus: 'loading' | 'found' | 'not_found' | 'error';
  usdValue: number;
  priceSources: { price: number; source: string }[];
};

export default function CoincarneModal({
  token,
  onClose,
  refetchTokens,
  onGoToProfileRequest,
}: CoincarneModalProps) {
  const { publicKey, sendTransaction } = useWallet();

  const [loading, setLoading] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [resultData, setResultData] = useState<{ tokenFrom: string; number: number; imageUrl: string } | null>(null);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [priceView, setPriceView] = useState<PriceView>({ fetchStatus: 'loading', usdValue: 0, priceSources: [] });
  const [tokenCategory, setTokenCategory] = useState<TokenCategory | null>(null);
  const [priceStatus, setPriceStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const [symbol, setSymbol] = useState<string | undefined>(token.symbol);
  useEffect(() => {
    setSymbol(token.symbol);
  }, [token.mint, token.symbol]);

  useEffect(() => {
    let abort = false;
    if (!symbol) {
      fetchTokenMetadata(token.mint)
        .then((meta) => {
          if (!abort && meta?.symbol) setSymbol(meta.symbol);
        })
        .catch(() => {});
    }
    return () => {
      abort = true;
    };
  }, [token.mint, symbol]);

  const displaySymbol = symbol ?? token.mint.slice(0, 4);
  const isSOLToken = token.mint === 'SOL' || symbol?.toUpperCase() === 'SOL';

  const {
    balance: internalBalance,
    loading: balLoading,
    error: balError,
    isSOL: isSolFromHook,
  } = useInternalBalance(token.mint, { isSOL: isSOLToken });

  const handlePrepareConfirm = async () => {
    if (!publicKey || !amountInput) return;
    const amountToSend = parseFloat(amountInput);
    if (isNaN(amountToSend) || amountToSend <= 0) return;

    try {
      setLoading(true);
      setPriceStatus('loading');
      setPriceView({ fetchStatus: 'loading', usdValue: 0, priceSources: [] });

      const mint = isSOLToken ? WSOL_MINT : token.mint;

      const qs = new URLSearchParams({ mint, amount: String(amountToSend) });
      const res = await fetch(`/api/proxy/price?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();

      const ok = !!json?.ok || !!json?.success;
      if (!ok) {
        setPriceView({
          fetchStatus: json?.status === 'not_found' ? 'not_found' : 'error',
          usdValue: 0,
          priceSources: [],
        });
        setTokenCategory('deadcoin');
        setConfirmModalOpen(true);
        setPriceStatus('ready');
        return;
      }

      const unit = Number(json?.priceUsd ?? 0);
      const summed = Number(json?.usdValue ?? 0);
      const total = summed > 0 ? summed : unit * amountToSend;

      const sources: { price: number; source: string }[] =
        Array.isArray(json?.sources) && json.sources.length
          ? json.sources
          : unit > 0 && json?.source
          ? [{ source: String(json.source), price: unit }]
          : [];

      setPriceView({
        fetchStatus: 'found',
        usdValue: Number.isFinite(total) ? total : 0,
        priceSources: sources,
      });
      setTokenCategory((prev) => prev ?? 'healthy');
      setConfirmModalOpen(true);
      setPriceStatus('ready');
    } catch (err) {
      console.error('❌ Error preparing confirmation:', err);
      setPriceView({ fetchStatus: 'error', usdValue: 0, priceSources: [] });
      setPriceStatus('error');
      setConfirmModalOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!publicKey || !amountInput) return;
    const amountToSend = parseFloat(amountInput);
    if (isNaN(amountToSend) || amountToSend <= 0) return;

    try {
      setLoading(true);
      let signature: string;

      if (isSOLToken) {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: COINCARNATION_DEST,
            lamports: Math.floor(amountToSend * 1e9),
          })
        );
        signature = await sendTransaction(tx, connection);
      } else {
        const mint = new PublicKey(token.mint);
        const fromATA = await getAssociatedTokenAddress(mint, publicKey);
        const toATA = await getAssociatedTokenAddress(mint, COINCARNATION_DEST);
        const mintInfo = await getMint(connection, mint);
        const decimals = mintInfo.decimals;
        const adjustedAmount = Math.floor(amountToSend * Math.pow(10, decimals));

        const ixs: any[] = [];
        const toAtaInfo = await connection.getAccountInfo(toATA);
        if (!toAtaInfo) {
          ixs.push(createAssociatedTokenAccountInstruction(publicKey, toATA, COINCARNATION_DEST, mint));
        }
        ixs.push(createTransferInstruction(fromATA, toATA, publicKey, adjustedAmount));
        const tx = new Transaction().add(...ixs);
        signature = await sendTransaction(tx, connection);
      }

      const res = await fetch('/api/coincarnation/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: publicKey.toBase58(),
          token_symbol: symbol || '',
          token_contract: token.mint,
          network: 'solana',
          token_amount: amountToSend,
          usd_value: priceView.usdValue,
          transaction_signature: signature,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          token_category: tokenCategory ?? 'unknown',
        }),
      });

      const json = await res.json();
      const userNumber = json?.number ?? 0;
      const tokenSymbolForImage = displaySymbol;
      const imageUrl = `/generated/coincarnator-${userNumber}-${tokenSymbolForImage}.png`;

      setResultData({ tokenFrom: tokenSymbolForImage, number: userNumber, imageUrl });
      setConfirmModalOpen(false);
      if (refetchTokens) refetchTokens();

      try {
        checkTokenLiquidityAndVolume(token)
          .then(({ volume, liquidity, category }) => {
            fetch('/api/lv/apply', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mint: token.mint, category }),
            }).catch((err) => console.warn('⚠️ lv/apply error:', err));
          })
          .catch((e) => console.warn('⚠️ Post-tx L/V error:', e));
      } catch {}
    } catch (err) {
      console.error('❌ Transaction error:', err);
      alert('❌ Transaction failed.');
    } finally {
      setLoading(false);
    }
  };

  const handlePercentage = (percent: number) => {
    if (!internalBalance) return;
    let calculated = (internalBalance.amount * percent) / 100;

    if (isSolFromHook && percent === 100 && calculated > 0.001) {
      calculated -= 0.001;
    }

    calculated = quantize(calculated, internalBalance.decimals);
    setAmountInput(String(calculated));
  };

  useEffect(() => {
    if (resultData) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [resultData]);

  return (
    <>
      {priceStatus === 'ready' && confirmModalOpen && (
        <ConfirmModal
          isOpen={confirmModalOpen}
          onCancel={() => setConfirmModalOpen(false)}
          onConfirm={handleSend}
          usdValue={priceView.usdValue}
          tokenSymbol={displaySymbol}
          amount={parseFloat(amountInput)}
          tokenCategory={tokenCategory}
          priceSources={priceView.priceSources}
          fetchStatus={priceView.fetchStatus}
          tokenMint={isSOLToken ? WSOL_MINT : token.mint}
          currentWallet={publicKey?.toBase58() ?? null}
          onDeadcoinVote={() => {}}
        />
      )}

      <Dialog open onOpenChange={onClose}>
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" />

        <DialogContent
          className="z-50 bg-gradient-to-br from-black to-zinc-900 text-white rounded-2xl p-6 max-w-md w-full h-[90vh] overflow-y-auto flex flex-col justify-center"
          aria-describedby="coincarne-desc"
        >
          {/* a11y: ekranda görünmez başlık + açıklama */}
          <DialogTitle className="sr-only">Coincarnate {displaySymbol}</DialogTitle>
          <p id="coincarne-desc" className="sr-only">
            Choose an amount and confirm to convert your token into $MEGY.
          </p>

          {resultData ? (
            <CoincarnationResult
              tokenFrom={resultData.tokenFrom}
              number={resultData.number}
              imageUrl={resultData.imageUrl}
              onRecoincarnate={() => setResultData(null)}
              onGoToProfile={() => {
                onClose();
                onGoToProfileRequest?.();
              }}
            />
          ) : (
            <>
              <h2 className="text-2xl font-bold text-center mb-3">
                🔥 Coincarnate {displaySymbol}
              </h2>

              <p className="text-sm text-gray-400 text-center mb-2">
                {balLoading
                  ? 'Fetching balance…'
                  : balError
                  ? `Balance error: ${balError}`
                  : internalBalance
                  ? `Balance: ${internalBalance.amount.toFixed(4)} ${displaySymbol}`
                  : `Balance: ${token.amount.toFixed(4)} ${displaySymbol}`}
              </p>

              <div className="grid grid-cols-4 gap-2 mb-4">
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    className="bg-gradient-to-br from-purple-600 to-pink-500 hover:opacity-90 text-white font-semibold py-2 rounded-lg shadow"
                    onClick={() => handlePercentage(p)}
                    disabled={loading || balLoading || !internalBalance}
                  >
                    {p}%
                  </button>
                ))}
              </div>

              <input
                type="number"
                step="0.000001"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="Enter amount"
                className="w-full bg-zinc-800 text-white p-3 rounded-lg border border-zinc-600 mb-4"
                disabled={loading}
              />

              <button
                onClick={handlePrepareConfirm}
                disabled={loading || !amountInput}
                className="w-full bg-gradient-to-r from-green-500 via-yellow-400 to-pink-500 text-black font-extrabold py-3 rounded-xl"
              >
                {loading ? '🔥 Coincarnating...' : `🚀 Coincarnate ${displaySymbol} Now`}
              </button>

              <button
                onClick={onClose}
                className="mt-3 w-full text-sm text-red-500 hover:text-white"
                disabled={loading}
              >
                ❌ Not Interested in Global Synergy
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
