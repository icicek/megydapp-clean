'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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
import getUsdValue from '@/app/api/utils/getUsdValue';
import ConfirmModal from '@/components/ConfirmModal';

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
  const [amountInput, setAmountInput] = useState<string>('');
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [resultData, setResultData] = useState<{
    tokenFrom: string;
    number: number;
    imageUrl: string;
  } | null>(null);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [usdValue, setUsdValue] = useState<number>(0);
  const [priceSources, setPriceSources] = useState<{ price: number; source: string }[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const refFromUrl = urlParams.get('ref');

      if (refFromUrl) {
        localStorage.setItem('referralCode', refFromUrl);
        setReferralCode(refFromUrl);
      } else {
        const storedCode = localStorage.getItem('referralCode');
        if (storedCode) {
          setReferralCode(storedCode);
        }
      }
    }
  }, []);

  const handlePrepareConfirm = async () => {
    if (!publicKey || !amountInput) return;
    const amountToSend = parseFloat(amountInput);
    if (isNaN(amountToSend) || amountToSend <= 0) return;
  
    try {
      setLoading(true);
      const { usdValue, sources } = await getUsdValue(token, amountToSend);
      console.log('🧮 USD Value:', usdValue, 'Sources:', sources);
  
      setUsdValue(usdValue);
      setPriceSources(sources); // artık komple obje array
      setConfirmModalOpen(true);
    } catch (err) {
      console.error('❌ Error preparing confirm modal:', err);
      alert('❌ Failed to prepare confirmation. Check console.');
    } finally {
      setLoading(false);
    }
  };
  const [tokenStatusData, setTokenStatusData] = useState<{
    status: 'whitelist' | 'blacklist' | 'redlist' | 'deadcoin' | 'unknown';
    redlistDate?: string;
  }>({
    status: 'unknown'
  });  

  const handleConfirmCoincarne = async () => {
    setConfirmModalOpen(false); // modalı kapat
    if (!publicKey || !amountInput) return;
    const amountToSend = parseFloat(amountInput);
    if (isNaN(amountToSend) || amountToSend <= 0) return;
  
    try {
      setLoading(true);
  
      // ✅ Eğer token status 'unknown' ise, deadcoin vote API çağrısı
      if (tokenStatusData.status === 'unknown') {
        await fetch('/api/token/deadcoin-vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mint: token.mint,
            wallet_address: publicKey.toBase58()
          })
        });
        console.log(`✅ Deadcoin vote recorded for ${token.mint}`);
      }
  
      // Sonrasında normal Coincarne işlemine geç
      await handleSend();
  
    } catch (err) {
      console.error('❌ Error during Coincarne confirmation:', err);
      alert('❌ Failed to complete Coincarnation. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  const handlePercentage = (percent: number) => {
    const calculated = (token.amount * percent) / 100;
    setAmountInput(calculated.toFixed(6));
  };  

  const handleSend = async () => {
    setConfirmModalOpen(false);
    if (!publicKey || !amountInput) return;
    const amountToSend = parseFloat(amountInput);
    if (isNaN(amountToSend) || amountToSend <= 0) return;

    try {
      setLoading(true);
      let signature: string;
      const { usdValue: finalUsdValue, sources } = await getUsdValue(token, amountToSend);
      console.log('✅ USD Value & Sources (Final):', finalUsdValue, sources);

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
          createTransferInstruction(fromATA, toATA, publicKey, Math.floor(amountToSend * 1e6))
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
          usd_value: finalUsdValue,
          referral_code: referralCode,
          transaction_signature: signature,
          user_agent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('❌ Backend error response:', errorText);
        alert('❌ Backend Error. Check console.');
        return;
      }

      const json = await res.json();
      const userNumber = json?.number ?? 0;
      const tokenSymbol = token.symbol || token.mint.slice(0, 4);
      const imageUrl = `/generated/coincarnator-${userNumber}-${tokenSymbol}.png`;

      setResultData({ tokenFrom: tokenSymbol, number: userNumber, imageUrl });
      if (refetchTokens) refetchTokens();
    } catch (err) {
      console.error('❌ TRANSACTION ERROR:', err);
      alert(`❌ Transaction failed. Check console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!publicKey) return;
    try {
      await fetch('/api/share/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: publicKey.toBase58() }),
      });
    } catch (err) {
      console.error('❌ Share tracking failed:', err);
    }
  };
  const handleDeadcoinVote = async (vote: 'yes' | 'no') => {
    if (!publicKey) return;
    try {
      await fetch('/api/deadcoin/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          tokenMint: token.mint,
          vote
        }),
      });
      console.log(`✅ Deadcoin vote submitted: ${vote}`);
      alert(`Thank you! Your vote "${vote}" has been recorded.`);
    } catch (err) {
      console.error('❌ Deadcoin vote failed:', err);
      alert('❌ Failed to record your vote. Please try again.');
    }
  };  

  return (
    <>
      <ConfirmModal
        tokenSymbol={token.symbol || token.mint.slice(0, 4)}
        usdValue={usdValue}
        sources={priceSources} // 👈 eklenen ve düzelen prop
        onConfirm={handleConfirmCoincarne}
        onCancel={() => setConfirmModalOpen(false)}
        onDeadcoinVote={handleDeadcoinVote} // 👈 yeni prop
      />

      <Dialog open onOpenChange={onClose}>
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" />
        <DialogContent
          className="z-50 bg-gradient-to-br from-black to-zinc-900 text-white rounded-2xl p-6 max-w-md w-full shadow-[0_0_30px_5px_rgba(255,0,255,0.3)] border border-pink-500/30"
          aria-describedby="coincarnation-description"
        >
          <DialogTitle className="sr-only">Coincarnation Modal</DialogTitle>

          {resultData ? (
            <CoincarnationResult
              tokenFrom={resultData.tokenFrom}
              number={resultData.number}
              imageUrl={resultData.imageUrl}
              onRecoincarnate={() => {
                setResultData(null);
                setAmountInput('');
              }}
              onGoToProfile={() => {
                onClose();
                if (onGoToProfileRequest) {
                  setTimeout(() => {
                    onGoToProfileRequest();
                  }, 100);
                }
              }}
            >
              <a
                href={`https://twitter.com/intent/tweet?text=I just coincarnated $${resultData.tokenFrom} into $MEGY ⚡️\nJoin the revival → https://coincarnation.com`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleShare}
                className="mt-4 inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Share on X
              </a>
            </CoincarnationResult>
          ) : (
            <>
              <p
                id="coincarnation-description"
                className="text-xs text-pink-400 text-center mb-2 tracking-wide uppercase"
              >
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
                onClick={handlePrepareConfirm}
                disabled={loading || !amountInput}
                className="w-full bg-gradient-to-r from-green-500 via-yellow-400 to-pink-500 hover:scale-105 text-black font-extrabold py-3 rounded-xl transition-all duration-200 shadow-xl border-2 border-white"
              >
                {loading ? '🔥 Coincarnating...' : `🚀 Coincarne ${token.symbol || 'Token'} Now`}
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
    </>
  );
}
