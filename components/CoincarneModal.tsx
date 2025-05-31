'use client';

import React, { useState } from 'react';
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
          usd_value: 0,
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
      <DialogContent className="bg-gradient-to-br from-zinc-900 to-black text-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
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
              className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-lg transition-all duration-150 shadow-lg"
            >
              {loading ? 'Processing...' : `Coincarnate ${token.symbol || 'Token'}`}
            </button>

            <button
              onClick={onClose}
              className="mt-3 w-full text-sm text-gray-400 hover:text-white"
              disabled={loading}
            >
              Cancel
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}