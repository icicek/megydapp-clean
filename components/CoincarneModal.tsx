"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
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
import getUsdValueFast from '@/app/api/utils/getUsdValueFast'; // 🚀 Hızlı fiyat
import { checkTokenLiquidityAndVolume } from '@/app/api/utils/checkTokenLiquidityAndVolume'; // ⬅️ Arka plan kontrol

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

export default function CoincarneModal({ token, onClose, refetchTokens, onGoToProfileRequest }: CoincarneModalProps) {
  const { publicKey, sendTransaction } = useWallet();
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

  // Token adı yedeği
  useEffect(() => {
    if (!token.symbol) {
      fetchTokenMetadata(token.mint).then((meta) => {
        if (meta?.symbol) token.symbol = meta.symbol;
      });
    }
  }, [token]);

  // 🚀 Hızlı fiyat ile ConfirmModal açma
  const handlePrepareConfirm = async () => {
    if (!publicKey || !amountInput) return;
    const amountToSend = parseFloat(amountInput);
    if (isNaN(amountToSend) || amountToSend <= 0) return;

    try {
      setLoading(true);

      // 1️⃣ Önce hızlı fiyat al
      const fastPrice = await getUsdValueFast(token, amountToSend);

      if (fastPrice.status === 'found') {
        setUsdValue(fastPrice.usdValue);
        setPriceSources(fastPrice.sources);
        setIsValuable(isValuableAsset(fastPrice.usdValue / amountToSend) || isStablecoin(fastPrice.usdValue / amountToSend));
        setFetchStatus('found');
        setPriceStatus('ready');
        setConfirmModalOpen(true); // 🚀 Hemen modal aç
      } else {
        setFetchStatus('not_found');
        setPriceStatus('error');
        alert('❌ Token price could not be fetched.');
        return;
      }

      // 2️⃣ Arka planda hacim & likidite kontrolü (kullanıcıyı bekletmeden)
      checkTokenLiquidityAndVolume(token).then(({ volume, liquidity, category }) => {
        console.log(`📊 Liquidity check for ${token.symbol}:`, { volume, liquidity, category });
        setTokenCategory(category);
      });

    } catch (err) {
      console.error('❌ Error preparing confirmation:', err);
      alert('❌ Failed to prepare confirmation.');
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

      if (token.mint === 'SOL' || token.symbol?.toUpperCase() === 'SOL') {
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
        const decimals = (await getMint(connection, mint)).decimals;
        const adjustedAmount = Math.floor(amountToSend * Math.pow(10, decimals));

        const tx = new Transaction().add(
          createTransferInstruction(fromATA, toATA, publicKey, adjustedAmount)
        );
        signature = await sendTransaction(tx, connection);
      }

      const res = await fetch('/api/coincarnation/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: publicKey.toBase58(),
          token_symbol: token.symbol || '',
          token_contract: token.mint,
          network: 'solana',
          token_amount: amountToSend,
          usd_value: usdValue,
          transaction_signature: signature,
          user_agent: navigator.userAgent,
        }),
      });

      const json = await res.json();
      const userNumber = json?.number ?? 0;
      const tokenSymbol = token.symbol || token.mint.slice(0, 4);
      const imageUrl = `/generated/coincarnator-${userNumber}-${tokenSymbol}.png`;

      setResultData({ tokenFrom: tokenSymbol, number: userNumber, imageUrl });
      setConfirmModalOpen(false);
      if (refetchTokens) refetchTokens();
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
          tokenSymbol={token.symbol || token.mint}
          amount={parseFloat(amountInput)}
          tokenCategory={tokenCategory}
          priceSources={priceSources}
          fetchStatus={fetchStatus}
          onDeadcoinVote={(vote) => {
            console.log('🗳️ Deadcoin vote:', vote);
          }}
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
                🔥 Coincarnate {token.symbol || token.mint.slice(0, 4)}
              </h2>
              <p className="text-sm text-gray-400 text-center mb-2">
                Balance: {token.amount.toFixed(4)} {token.symbol || token.mint.slice(0, 4)}
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
                {loading ? '🔥 Coincarnating...' : `🚀 Coincarnate ${token.symbol || 'Token'} Now`}
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
