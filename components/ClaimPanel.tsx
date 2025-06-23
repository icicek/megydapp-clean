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
    total_usd_contributed: number | null;
    total_token_contributed: number | null;
    total_coins_contributed: number | null;
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
    <div className="bg-zinc-900 text-white p-6 rounded-2xl max-w-xl w-full mx-auto border border-zinc-700 shadow-lg">
      <h2 className="text-3xl font-extrabold text-center mb-6 tracking-tight">🎁 Claim Your $MEGY</h2>

      {!publicKey ? (
        <p className="text-yellow-400 text-center">🔌 Please connect your wallet to view your profile.</p>
      ) : loading ? (
        <p className="text-blue-400 text-center">⏳ Loading your claim data...</p>
      ) : data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <InfoCard label="Wallet" value={shortenAddress(data.wallet_address)} color="green" />
            <InfoCard label="Token" value={`${data.token_amount} ${data.token_symbol}`} color="cyan" />
            <InfoCard label="Coincarnator #" value={`#${data.id}`} color="yellow" />
            <InfoCard label="Referrals" value={data.referral_count.toString()} color="pink" />
            <InfoCard label="USD Value" value={`$${data.total_usd_contributed?.toFixed(2) || '0.00'}`} color="orange" />
            <InfoCard label="Tokens Sent" value={data.total_token_contributed?.toFixed(4) || '0.0000'} color="lime" />
            <InfoCard label="Coins Contributed" value={data.total_coins_contributed?.toString() || '0'} color="fuchsia" />
            <InfoCard label="Claimable" value={`${data.claimable_amount} $MEGY`} color="purple" />
          </div>

          {claimed ? (
            <p className="text-green-400 font-bold text-center">✅ Already Claimed</p>
          ) : claimOpen ? (
            <button
              onClick={handleClaim}
              disabled={isClaiming || data.claimable_amount <= 0}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-500 hover:scale-105 transition-all text-white font-bold py-3 rounded-xl disabled:opacity-50"
            >
              {isClaiming ? '🚀 Claiming...' : '🎉 Claim Now'}
            </button>
          ) : (
            <p className="text-yellow-400 text-center font-medium">
              ⚠️ Claiming is currently closed. Please check back later.
            </p>
          )}

          {message && <p className="text-center mt-4 text-sm">{message}</p>}
        </div>
      ) : (
        <p className="text-red-400 text-center">❌ No Coincarnation record found for this wallet.</p>
      )}
    </div>
  );
}

function InfoCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className={`bg-zinc-800 border-l-4 border-${color}-500 p-4 rounded-lg`}>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className={`text-${color}-300 font-semibold text-sm mt-1 break-all`}>{value}</p>
    </div>
  );
}

function shortenAddress(address: string) {
  return address.slice(0, 6) + '...' + address.slice(-4);
}
