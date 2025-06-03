'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
} from '@solana/spl-token';
import {
  PublicKey,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';
import { connection } from '@/lib/solanaConnection';
import CoincarnationResult from '@/components/CoincarnationResult';
import { useRouter } from 'next/navigation';

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
}

const COINCARNATION_DEST = new PublicKey('HPBNVF9ATsnkDhGmQB4xoLC5tWBWQbTyBjsiQAN3dYXH');

export default function CoincarneModal({ token, onClose, refetchTokens }: CoincarneModalProps) {
  const { publicKey, sendTransaction } = useWallet();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [amountInput, setAmountInput] = useState<string>('');
  const [resultData, setResultData] = useState<{
    tokenFrom: string;
    number: number;
    imageUrl: string;
  } | null>(null);

  const handlePercentage = (percent: number) => {
    const calculated = (token.amount * percent) / 100;
    setAmountInput(calculated.toFixed(6));
  };

  const handleSend = async () => {
    if (!publicKey || !amountInput) return;

    const amountToSend = parseFloat(amountInput);
    if (isNaN(amountToSend) || amountToSend <= 0) return;

    try {
      setLoading(true);
      let signature: string;
      let usdValue = 0;

      // 🔹 Fiyatı Jupiter + CoinGecko üzerinden hibrit şekilde çek
      try {
        // 1️⃣ Jupiter üzerinden USD fiyatını almaya çalış
        const jupRes = await fetch(`https://price.jup.ag/v4/price?ids=${token.mint}`);
        const jupJson = await jupRes.json();
        const jupPrice = jupJson.data?.[token.mint]?.price;

        if (jupPrice) {
          usdValue = amountToSend * jupPrice;
        } else {
          // 2️⃣ Jupiter başarısızsa CoinGecko üzerinden dene
          if (token.symbol?.toUpperCase() === 'SOL') {
            const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd`);
            const priceJson = await priceRes.json();
            const price = priceJson.solana?.usd;
            if (price) usdValue = amountToSend * price;
            else console.warn('💸 SOL price not found (CoinGecko fallback)');
          } else {
            const priceRes = await fetch(
              `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${token.mint}&vs_currencies=usd`
            );
            const priceJson = await priceRes.json();
            const priceData = Object.values(priceJson)[0] as { usd?: number };
            const price = priceData?.usd;
            if (price) usdValue = amountToSend * price;
            else console.warn('💸 Price data not found on CoinGecko for token:', token.mint);
          }
        }
      } catch (error) {
        console.warn('💸 Failed to fetch price from both Jupiter and CoinGecko:', error);
      }

      // 🔹 Referans kodu URL'den alınır
      let referralCode = null;
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        referralCode = params.get('ref');
      }

      if (token.mint === 'SOL') {
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

        const tx = new Transaction().add(
          createTransferInstruction(
            fromATA,
            toATA,
            publicKey,
            Math.floor(amountToSend * 1e6)
          )
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
          referral_code: referralCode,
          transaction_signature: signature,
          user_agent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        let errorMessage = `Unknown API error ${res.status}`;
        try {
          const errorJson = await res.json();
          errorMessage = errorJson.error || errorMessage;
        } catch (e) {
          const errorText = await res.text();
          errorMessage = errorText || errorMessage;
        }

        console.error('❌ API responded with error:', res.status, errorMessage);
        alert(`❌ API error ${res.status}: ${errorMessage}`);
        return;
      }

      let json;
      try {
        json = await res.json();
        console.log('✅ Parsed JSON:', json);
      } catch {
        console.error('❌ Failed to parse JSON.');
        alert('⚠️ API did not return valid JSON. Please try again later.');
        return;
      }

      const userNumber = json?.number ?? 0;
      const tokenSymbol = token.symbol || token.mint.slice(0, 4);
      const imageUrl = `/generated/coincarnator-${userNumber}-${tokenSymbol}.png`;

      setResultData({
        tokenFrom: tokenSymbol,
        number: userNumber,
        imageUrl,
      });

      if (refetchTokens) refetchTokens();
    } catch (err: unknown) {
      console.error('❌ TRANSACTION ERROR:', err);
      if (err instanceof Error) {
        alert(`❌ Transaction failed:\n${err.message}`);
      } else {
        alert('❌ Transaction failed: Unknown error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" />
      <DialogContent className="z-50 bg-gradient-to-br from-black to-zinc-900 text-white rounded-2xl p-6 max-w-md w-full shadow-[0_0_30px_5px_rgba(255,0,255,0.3)] border border-pink-500/30">
        {resultData ? (
          <CoincarnationResult
            tokenFrom={resultData.tokenFrom}
            number={resultData.number}
            imageUrl={resultData.imageUrl}
            onRecoincarnate={() => {
              setResultData(null);
              setAmountInput('');
            }}
            onGoToProfile={() => router.push('/profile')}
          />
        ) : (
          <>
            <p className="text-xs text-pink-400 text-center mb-2 tracking-wide uppercase">
              🚨 Exclusive Coincarnation Portal
            </p>
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
              className="w-full bg-zinc-800 text-white p-3 rounded-lg border border-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4"
              disabled={loading}
            />

            <button
              onClick={handleSend}
              disabled={loading || !amountInput}
              className="w-full bg-gradient-to-r from-green-500 via-yellow-400 to-pink-500 hover:scale-105 text-black font-extrabold py-3 rounded-xl transition-all duration-200 shadow-xl border-2 border-white"
            >
              {loading ? '🔥 Coincarnating...' : `🚀 Coincarnate ${token.symbol || 'Token'} Now`}
            </button>

            <button
              onClick={onClose}
              className="mt-3 w-full text-sm text-red-500 hover:text-white transition-all duration-150"
              disabled={loading}
            >
              ❌ Not Interested in Global Synergy
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
