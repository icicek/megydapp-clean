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

interface TokenInfo {
  mint: string;
  amount: number;
  symbol?: string;
  logoURI?: string;
}

interface CoincarneModalProps {
  token: TokenInfo;
  onClose: () => void;
}

const COINCARNATION_DEST = new PublicKey('HPBNVF9ATsnkDhGmQB4xoLC5tWBWQbTyBjsiQAN3dYXH');

export default function CoincarneModal({ token, onClose }: CoincarneModalProps) {
  const { publicKey, sendTransaction } = useWallet();
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
      let signature = '';

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
          walletAddress: publicKey.toBase58(),
          tokenSymbol: token.symbol || '',
          tokenContract: token.mint,
          network: 'solana',
          tokenAmount: amountToSend,
          usdValue: 0,
          transactionSignature: signature,
          userAgent: navigator.userAgent,
        }),
      });

      const { number } = await res.json();
      const tokenSymbol = token.symbol || token.mint.slice(0, 4);
      const imageUrl = `/generated/coincarnator-${number}-${tokenSymbol}.png`;

      setResultData({
        tokenFrom: tokenSymbol,
        number,
        imageUrl,
      });
    } catch (err) {
      console.error('❌ TRANSACTION ERROR:', err);
      if (err instanceof Error) {
        alert(`❌ Transaction failed:\n${err.message}`);
      } else {
        alert('❌ Transaction failed');
      }      
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-black text-white rounded-xl p-6 max-w-md w-full">
        {resultData ? (
          <CoincarnationResult
            tokenFrom={resultData.tokenFrom}
            number={resultData.number}
            imageUrl={resultData.imageUrl}
          />
        ) : (
          <>
            <h2 className="text-xl font-bold mb-4">🔥 Coincarnate Your Token</h2>
            <p className="text-sm text-gray-400 mb-1">
              Balance: {token.amount.toFixed(4)} {token.symbol || token.mint.slice(0, 4)}
            </p>

            <div className="flex space-x-3 my-3">
              {[25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  className="bg-purple-700 hover:bg-purple-800 px-3 py-2 rounded text-sm"
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
              className="w-full bg-gray-800 text-white p-3 rounded mb-4"
              disabled={loading}
            />

            <button
              onClick={handleSend}
              disabled={loading || !amountInput}
              className="bg-green-600 hover:bg-green-700 w-full py-3 rounded text-lg font-semibold"
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
