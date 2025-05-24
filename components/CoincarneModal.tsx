'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
} from '@solana/spl-token';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
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
  const { connection } = useConnection();
  const [loading, setLoading] = useState(false);
  const [resultData, setResultData] = useState<{
    tokenFrom: string;
    number: number;
    imageUrl: string;
  } | null>(null);

  const handleSend = async (percent: number) => {
    if (!publicKey) return;

    const amountToSend = token.amount * (percent / 100);

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

      // Backend kayıt
      const res = await fetch('/api/coincarnation/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          tokenSymbol: token.symbol || '',
          tokenContract: token.mint,
          network: 'solana',
          tokenAmount: amountToSend,
          usdValue: 0, // TODO: Optional fiyat verisi eklenebilir
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
      console.error(err);
      alert('❌ Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-black text-white rounded-xl p-6">
        {/* ✅ Başarı ekranı göster */}
        {resultData ? (
          <CoincarnationResult
            tokenFrom={resultData.tokenFrom}
            number={resultData.number}
            imageUrl={resultData.imageUrl}
          />
        ) : (
          <>
            <h2 className="text-xl font-bold mb-4">🔥 Coincarnate Your Token</h2>
            <p className="text-sm text-gray-400 mb-6">
              Choose how much to Coincarnate:
            </p>

            <div className="flex space-x-4 mb-4">
              {[25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-md text-white"
                  onClick={() => handleSend(p)}
                  disabled={loading}
                >
                  {p}%
                </button>
              ))}
            </div>

            <button
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-md text-white"
              onClick={onClose}
              disabled={loading}
            >
              Close
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
