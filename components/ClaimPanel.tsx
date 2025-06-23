'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';

export default function ClaimPanel() {
  const { publicKey } = useWallet();

  type ClaimData = {
    wallet_address: string;
    token_amount: number;
    token_symbol: string;
    id: number;
    claimable_amount: number;
    claimed: boolean;
    referral_count: number;
    total_usd_contributed: number;
    total_token_contributed: number;
    total_coins_contributed: number;
  };

  const [data, setData] = useState<ClaimData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [claimOpen, setClaimOpen] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!publicKey) return;
      setLoading(true);

      try {
        const claimStatus = await fetch('/api/admin/config/claim_open');
        const statusJson = await claimStatus.json();
        setClaimOpen(statusJson.success && statusJson.value === 'true');

        const res = await fetch(`/api/claim/${publicKey.toBase58()}`);
        const json = await res.json();

        if (json.success) {
          setData(json.data);
          setClaimed(json.data.claimed);
        } else {
          setData(null);
        }
      } catch (err) {
        console.error('Claim fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [publicKey]);

  const handleClaim = async () => {
    if (!publicKey || !data) return;
    setIsClaiming(true);
    setMessage(null);

    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey.toBase58() })
      });

      const json = await res.json();

      if (json.success) {
        const tx_signature = json.tx_signature || 'mock-tx-signature';
        const destination = publicKey.toBase58();
        const claim_amount = data.claimable_amount;
        const sol_fee_paid = true;

        await fetch('/api/claim/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_address: destination,
            claim_amount,
            destination,
            tx_signature,
            sol_fee_paid
          })
        });

        setClaimed(true);
        setMessage('✅ Claim successful!');
      } else {
        setMessage(`❌ ${json.error}`);
      }
    } catch (err) {
      console.error('Claim request failed:', err);
      setMessage('❌ Internal error');
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="bg-gray-900 text-white p-6 rounded-xl w-full max-w-md border border-gray-700 text-center">
      <h2 className="text-2xl font-bold mb-4">🎁 Your Claim</h2>

      {!publicKey ? (
        <p className="text-yellow-400">Please connect your wallet.</p>
      ) : loading ? (
        <p className="text-blue-400">Loading claim data...</p>
      ) : data ? (
        <>
          <p className="text-sm text-gray-400 mb-1">Wallet:</p>
          <p className="text-green-400 mb-3">{data.wallet_address}</p>

          <p className="text-sm text-gray-400 mb-1">Token:</p>
          <p className="text-cyan-400 mb-3">
            {data.token_amount} {data.token_symbol}
          </p>

          <p className="text-sm text-gray-400 mb-1">Coincarnator #:</p>
          <p className="text-yellow-400 mb-3">{data.id}</p>

          <p className="text-sm text-gray-400 mb-1">Referrals Brought:</p>
          <p className="text-pink-400 mb-3">{data.referral_count}</p>

          <p className="text-sm text-gray-400 mb-1">Total USD Contributed:</p>
          <p className="text-orange-400 mb-3">${data.total_usd_contributed.toFixed(2)}</p>

          <p className="text-sm text-gray-400 mb-1">Total Tokens Contributed:</p>
          <p className="text-lime-400 mb-3">{data.total_token_contributed.toFixed(4)}</p>

          <p className="text-sm text-gray-400 mb-1">Total Coins Contributed:</p>
          <p className="text-fuchsia-400 mb-3">{data.total_coins_contributed}</p>

          <p className="text-sm text-gray-400 mb-1">Claimable $MEGY:</p>
          <p className="text-purple-400 mb-6">{data.claimable_amount}</p>

          {claimed ? (
            <p className="text-green-400 font-bold">✅ Already claimed</p>
          ) : claimOpen ? (
            <button
              onClick={handleClaim}
              disabled={isClaiming || data.claimable_amount <= 0}
              className="mt-4 w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-xl font-bold disabled:opacity-50"
            >
              {isClaiming ? 'Claiming...' : 'Claim Now'}
            </button>
          ) : (
            <p className="mt-4 text-yellow-400 text-center text-sm">
              ⚠️ Claiming is currently disabled by the admin. You will be able to claim when the window opens.
            </p>
          )}

          {message && <p className="mt-4 text-sm">{message}</p>}
        </>
      ) : (
        <p className="text-red-400">No Coincarnation record found for this wallet.</p>
      )}
    </div>
  );
}
