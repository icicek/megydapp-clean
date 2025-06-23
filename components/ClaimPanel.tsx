'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';

export default function ClaimPanel() {
  const { publicKey } = useWallet();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [claimOpen, setClaimOpen] = useState(true);
  const [globalStats, setGlobalStats] = useState<{
    totalUsd: number;
    totalParticipants: number;
  }>({ totalUsd: 0, totalParticipants: 0 });

  useEffect(() => {
    const fetchData = async () => {
      if (!publicKey) return;
      setLoading(true);

      try {
        const [claimStatusRes, userRes, globalRes] = await Promise.all([
          fetch('/api/admin/config/claim_open'),
          fetch(`/api/claim/${publicKey.toBase58()}`),
          fetch('/api/coincarnation/stats'),
        ]);

        const claimStatus = await claimStatusRes.json();
        const userData = await userRes.json();
        const globalData = await globalRes.json();

        setClaimOpen(claimStatus.success && claimStatus.value === 'true');

        if (userData.success) {
          setData(userData.data);
          setClaimed(userData.data.claimed);
        } else {
          setData(null);
        }

        if (globalData.success) {
          setGlobalStats({
            totalUsd: globalData.totalUsd,
            totalParticipants: globalData.totalParticipants,
          });
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
        body: JSON.stringify({ wallet: publicKey.toBase58() }),
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
            sol_fee_paid,
          }),
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

  if (!publicKey) {
    return <p className="text-center text-yellow-400">🔌 Please connect your wallet to view your claim profile.</p>;
  }

  if (loading) {
    return <p className="text-center text-blue-400">⏳ Loading your claim data...</p>;
  }

  if (!data) {
    return <p className="text-center text-red-400">❌ No Coincarnation record found for this wallet.</p>;
  }

  const personalRatio = globalStats.totalUsd > 0
    ? (data.total_usd_contributed / globalStats.totalUsd) * 100
    : 0;

  return (
    <div className="bg-zinc-900 text-white p-6 rounded-2xl max-w-4xl w-full mx-auto border border-zinc-700 shadow-lg space-y-10">
      <h2 className="text-3xl font-extrabold text-center tracking-tight mb-2">🎁 Claim Panel</h2>

      {/* 👤 Kişisel Bilgiler */}
      <section>
        <h3 className="text-xl font-semibold mb-3">👤 Personal Info</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Info label="Wallet Address" value={shorten(data.wallet_address)} />
          <Info label="Coincarnator No" value={`#${data.id}`} />
          <Info label="Referral Code" value={data.referral_code || '-'} />
          <Info label="Referrals Brought" value={data.referral_count?.toString() || '0'} />
          <Info label="Total USD Contributed" value={`$${data.total_usd_contributed?.toFixed(2) || '0.00'}`} />
          <Info label="Coins Contributed" value={data.total_coins_contributed?.toString() || '0'} />
        </div>
      </section>

      {/* 🧾 Claim ve İstatistikler */}
      <section>
        <h3 className="text-xl font-semibold mb-3">📊 Claim & Stats</h3>
        <div className="bg-zinc-800 rounded-xl p-5 border border-zinc-600 space-y-3 text-sm">
          <p>🌐 Total Coincarnation Size: <span className="text-green-400 font-medium">${globalStats.totalUsd.toLocaleString()}</span></p>
          <p>🙋 Total Participants: <span className="text-blue-400 font-medium">{globalStats.totalParticipants}</span></p>
          <p>📈 Your Share: <span className="text-yellow-400 font-medium">{personalRatio.toFixed(2)}%</span> of total</p>
          <p className="mt-2">🎯 Claimable $MEGY: <span className="text-purple-400 font-bold text-lg">{data.claimable_amount}</span></p>
          <p className="text-gray-400 italic text-xs">
            ⏳ This amount is not final. Your claim will be locked in after Coincarnation ends.
          </p>

          {claimed ? (
            <p className="text-green-400 font-semibold mt-3">✅ Already claimed</p>
          ) : claimOpen ? (
            <button
              onClick={handleClaim}
              disabled={isClaiming || data.claimable_amount <= 0}
              className="mt-4 w-full bg-gradient-to-r from-purple-600 to-pink-500 hover:scale-105 transition-all text-white font-bold py-3 rounded-xl disabled:opacity-50"
            >
              {isClaiming ? '🚀 Claiming...' : '🎉 Claim Now'}
            </button>
          ) : (
            <p className="text-yellow-400 font-medium mt-3">
              ⚠️ Claiming is currently closed. You will be able to claim when the window opens.
            </p>
          )}

          {message && <p className="mt-4 text-center">{message}</p>}
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-800 p-4 rounded-lg border border-zinc-700">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-semibold text-white mt-1 break-all">{value}</p>
    </div>
  );
}

function shorten(addr: string) {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}
