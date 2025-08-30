// components/community/DeadcoinVoteButton.tsx
'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

/**
 * Server tarafındaki /api/vote ile bire bir aynı mesaj formatı:
 *   "coincarnation:vote:deadcoin\nmint:<MINT>\nwallet:<WALLET>\nts:<UNIX>"
 */
function buildMessage(mint: string, wallet: string, ts: number) {
  return `coincarnation:vote:deadcoin\nmint:${mint}\nwallet:${wallet}\nts:${ts}`;
}

export default function DeadcoinVoteButton({
  mint,
  onVoted,
  label = 'Mark as deadcoin (vote)',
  className = '',
}: {
  mint: string;
  onVoted?: (res: any) => void;
  label?: string;
  className?: string;
}) {
  const { publicKey, signMessage } = useWallet();
  const [loading, setLoading] = useState(false);

  async function handleVote() {
    if (!publicKey) {
      alert('Please connect your wallet first.');
      return;
    }
    if (!signMessage) {
      alert('Your wallet does not support message signing.');
      return;
    }

    const wallet = publicKey.toBase58();
    const ts = Math.floor(Date.now() / 1000);
    const message = buildMessage(mint, wallet, ts);

    try {
      setLoading(true);

      // Wallet imzası
      const sigBytes = await signMessage(new TextEncoder().encode(message));
      const bs58 = (await import('bs58')).default;
      const signature = bs58.encode(sigBytes);

      // API çağrısı
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint,
          voterWallet: wallet,
          voteYes: true,   // bu buton "YES" oy verir
          ts,
          message,
          signature,
        }),
      });

      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Vote failed');

      onVoted?.(j);
      alert(j.applied ? '✅ Threshold reached! Marked as deadcoin.' : `👍 Vote recorded (${j.votesYes}/3)`);
    } catch (e: any) {
      alert(e?.message || 'Vote error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleVote}
      disabled={loading}
      className={[
        'bg-rose-600 hover:bg-rose-700 text-white rounded px-3 py-2 text-sm disabled:opacity-60',
        className,
      ].join(' ')}
      title="Vote as deadcoin"
    >
      {loading ? 'Voting…' : label}
    </button>
  );
}
