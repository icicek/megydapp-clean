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

type VoteResponse = {
  success: boolean;
  votesYes?: number;
  threshold?: number;
  applied?: boolean;
  blocked?: boolean;
  blockedBy?: string;
  error?: string;
  status?: string;
  decision?: {
    zone?: string;
    highLiq?: boolean;
    voteEligible?: boolean;
  };
};

export default function DeadcoinVoteButton({
  mint,
  onVoted,
  label = 'Mark as deadcoin (vote)',
  className = '',
}: {
  mint: string;
  onVoted?: (res: VoteResponse) => void;
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
          voteYes: true, // bu buton "YES" oy verir
          ts,
          message,
          signature,
        }),
      });

      const j: VoteResponse = await res.json();

      if (!res.ok || !j.success) {
        // vote_not_eligible gibi durumlar için daha anlaşılır mesaj
        if (j.error === 'vote_not_eligible') {
          alert('This token is not in the deadcoin-vote zone right now.');
        } else if (j.error === 'vote_eligibility_unavailable') {
          alert('Vote eligibility could not be checked. Please try again later.');
        } else {
          throw new Error(j.error || 'Vote failed');
        }
        return;
      }

      onVoted?.(j);

      if (j.blocked) {
        alert(
          `👍 Vote recorded, but this token is locked as ${j.blockedBy ?? 'list'}. Status will not change.`,
        );
        return;
      }

      if (j.applied) {
        alert('✅ Threshold reached! Token marked as deadcoin.');
      } else {
        const v = j.votesYes ?? 0;
        const th = j.threshold ?? '?';
        alert(`👍 Vote recorded (${v}/${th})`);
      }
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
