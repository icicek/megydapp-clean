// components/CoincarneModal.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getMint,
} from '@solana/spl-token';
import {
  PublicKey,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';
import { connection } from '@/lib/solanaConnection';
import CoincarnationResult from '@/components/CoincarnationResult';
import ConfirmModal from '@/components/ConfirmModal';
import { fetchTokenMetadata } from '@/app/api/utils/fetchTokenMetadata';
import { TokenCategory } from '@/app/api/utils/classifyToken';
import { isValuableAsset, isStablecoin } from '@/app/api/utils/isValuableAsset';
import getUsdValueFast from '@/app/api/utils/getUsdValueFast';
import { checkTokenLiquidityAndVolume } from '@/app/api/utils/checkTokenLiquidityAndVolume';

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

const COINCARNATION_DEST = new PublicKey('HPBNVF9ATsnkDhGmQB4xoLC5tWBWQbTyBjsiQAN3dYXH');

export default function CoincarneModal({
  token,
  onClose,
  refetchTokens,
  onGoToProfileRequest,
}: CoincarneModalProps) {
  const { publicKey, sendTransaction } = useWallet();

  // ---------- Local UI state ----------
  const [loading, setLoading] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [resultData, setResultData] = useState<{ tokenFrom: string; number: number; imageUrl: string } | null>(null);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [usdValue, setUsdValue] = useState(0);
  const [priceSources, setPriceSources] = useState<{ price: number; source: string }[]>([]);
  const [isValuable, setIsValuable] = useState(false);
  const [tokenCategory, setTokenCategory] = useState<TokenCategory | null>(null);
  const [priceStatus, setPriceStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fetchStatus, setFetchStatus] = useState<'loading' | 'found' | 'not_found' | 'error'>('loading');

  // ---------- Symbol handling (props mutate ETME) ----------
  const [symbol, setSymbol] = useState<string | undefined>(token.symbol);
  useEffect(() => {
    // token değiştiğinde sembol state'ini senkronla
    setSymbol(token.symbol);
  }, [token.mint, token.symbol]);

  useEffect(() => {
    // sembol yoksa metadata'dan çek
    let abort = false;
    if (!symbol) {
      fetchTokenMetadata(token.mint)
        .then(meta => {
          if (!abort && meta?.symbol) setSymbol(meta.symbol);
        })
        .catch(() => { /* sessiz geç */ });
    }
    return () => { abort = true; };
  }, [token.mint, symbol]);

  const displaySymbol = symbol ?? token.mint.slice(0, 4);
  const isSOLToken = token.mint === 'SOL' || symbol?.toUpperCase() === 'SOL';

  // ---------- Prepare confirm (fast price → open modal) ----------
  const handlePrepareConfirm = async () => {
    if (!publicKey || !amountInput) return;
    const amountToSend = parseFloat(amountInput);
    if (isNaN(amountToSend) || amountToSend <= 0) return;

    try {
      setLoading(true);

      // 1) Hızlı fiyat
      const fastPrice = await getUsdValueFast(token, amountToSend);

      if (fastPrice.status === 'found' && fastPrice.usdValue > 0) {
        setUsdValue(fastPrice.usdValue);
        setPriceSources(fastPrice.sources || []);
        const unitPrice = fastPrice.usdValue / amountToSend;
        setIsValuable(isValuableAsset(unitPrice) || isStablecoin(unitPrice));
        setFetchStatus('found');
        setPriceStatus('ready');
        setTokenCategory((prev) => prev ?? 'healthy'); // UI bilgilendirme için
        setConfirmModalOpen(true);
      } else {
        // fiyat yok/0 → deadcoin akışı (oylama açık)
        setUsdValue(0);
        setPriceSources(fastPrice.sources ?? []);
        setFetchStatus('found');   // modal açılabilsin
        setPriceStatus('ready');
        setTokenCategory('deadcoin');
        setConfirmModalOpen(true);
      }

      // Not: LV çağrısı burada YOK; post-tx'e taşıdık.

    } catch (err) {
      console.error('❌ Error preparing confirmation:', err);
      setFetchStatus('error');
      setPriceStatus('error');
    } finally {
      setLoading(false);
    }
  };

  // ---------- Send transaction + record + background LV apply ----------
  const handleSend = async () => {
    if (!publicKey || !amountInput) return;
    const amountToSend = parseFloat(amountInput);
    if (isNaN(amountToSend) || amountToSend <= 0) return;

    try {
      setLoading(true);
      let signature: string;

      if (isSOLToken) {
        // SOL transfer
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: COINCARNATION_DEST,
            lamports: Math.floor(amountToSend * 1e9),
          })
        );
        signature = await sendTransaction(tx, connection);
      } else {
        // SPL token transfer
        const mint = new PublicKey(token.mint);
        const fromATA = await getAssociatedTokenAddress(mint, publicKey);
        const toATA   = await getAssociatedTokenAddress(mint, COINCARNATION_DEST);
        const mintInfo = await getMint(connection, mint);
        const decimals = mintInfo.decimals;
        const adjustedAmount = Math.floor(amountToSend * Math.pow(10, decimals));

        const ixs: any[] = [];
        // Hedef ATA mevcut değilse, aynı tx içinde oluştur
        const toAtaInfo = await connection.getAccountInfo(toATA);
        if (!toAtaInfo) {
          ixs.push(
            createAssociatedTokenAccountInstruction(
              publicKey,           // payer
              toATA,               // ata address
              COINCARNATION_DEST,  // owner of ATA
              mint
            )
          );
        }
        ixs.push(createTransferInstruction(fromATA, toATA, publicKey, adjustedAmount));

        const tx = new Transaction().add(...ixs);
        signature = await sendTransaction(tx, connection);
      }

      // ✅ Backend'e kayıt
      const res = await fetch('/api/coincarnation/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: publicKey.toBase58(),
          token_symbol: symbol || '',
          token_contract: token.mint,
          network: 'solana',
          token_amount: amountToSend,
          usd_value: usdValue,
          transaction_signature: signature,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          token_category: tokenCategory ?? 'unknown',
        }),
      });

      const json = await res.json();
      const userNumber = json?.number ?? 0;
      const tokenSymbolForImage = displaySymbol;
      const imageUrl = `/generated/coincarnator-${userNumber}-${tokenSymbolForImage}.png`;

      // 🎉 Başarı ekranı
      setResultData({ tokenFrom: tokenSymbolForImage, number: userNumber, imageUrl });
      setConfirmModalOpen(false);
      if (refetchTokens) refetchTokens();

      // 🔁 Kayıttan hemen sonra L/V kontrolünü arkaya at (kullanıcıyı bekletme)
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
      } catch {
        // sessiz geç
      }

    } catch (err) {
      console.error('❌ Transaction error:', err);
      alert('❌ Transaction failed.');
    } finally {
      setLoading(false);
    }
  };

  const handlePercentage = (percent: number) => {
    const calculated = (token.amount * percent) / 100;
    setAmountInput(calculated.toFixed(6));
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
          usdValue={usdValue}
          tokenSymbol={displaySymbol}
          amount={parseFloat(amountInput)}
          tokenCategory={tokenCategory}
          priceSources={priceSources}
          fetchStatus={fetchStatus}
          tokenMint={token.mint}               // ✅ deadcoin oylaması için mint gönder
          currentWallet={publicKey?.toBase58() ?? null}
          // Oy çağrısını ConfirmModal'a bırakıyoruz (çift gönderim olmasın diye no-op)
          onDeadcoinVote={() => {}}
        />
      )}

      <Dialog open onOpenChange={onClose}>
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" />
        <DialogContent className="z-50 bg-gradient-to-br from-black to-zinc-900 text-white rounded-2xl p-6 max-w-md w-full h-[90vh] overflow-y-auto flex flex-col justify-center">

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
                Balance: {token.amount.toFixed(4)} {displaySymbol}
              </p>

              <div className="grid grid-cols-4 gap-2 mb-4">
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    className="bg-gradient-to-br from-purple-600 to-pink-500 hover:opacity-90 text-white font-semibold py-2 rounded-lg shadow"
                    onClick={() => handlePercentage(p)}
                    disabled={loading}
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
