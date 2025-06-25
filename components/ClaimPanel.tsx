'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function ClaimPanel() {
  const { publicKey } = useWallet();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [claimOpen, setClaimOpen] = useState(true);
  const [useAltAddress, setUseAltAddress] = useState(false);
  const [altAddress, setAltAddress] = useState('');
  const [globalStats, setGlobalStats] = useState({
    totalUsd: 0,
    totalParticipants: 0,
  });
  const [distributionPool, setDistributionPool] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!publicKey) return;
      setLoading(true);

      try {
        const [claimStatusRes, userRes, globalRes, poolRes] = await Promise.all([
          fetch('/api/admin/config/claim_open'),
          fetch(`/api/claim/${publicKey.toBase58()}`),
          fetch('/api/coincarnation/stats'),
          fetch('/api/admin/config/distribution_pool'),
        ]);

        const claimStatus = await claimStatusRes.json();
        const userData = await userRes.json();
        const globalData = await globalRes.json();
        const poolData = await poolRes.json();

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

        if (poolData.success) {
          setDistributionPool(poolData.value);
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
      const destination = useAltAddress ? altAddress.trim() : publicKey.toBase58();
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: destination }),
      });

      const json = await res.json();

      if (json.success) {
        const tx_signature = json.tx_signature || 'mock-tx-signature';
        const claim_amount = claimableMegy;
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

  const shareRatio = globalStats.totalUsd > 0 ? (data.total_usd_contributed / globalStats.totalUsd) : 0;
  const claimableMegy = Math.floor(shareRatio * distributionPool);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="bg-zinc-900 text-white p-6 rounded-2xl max-w-4xl w-full mx-auto border border-zinc-700 shadow-lg space-y-10"
    >
      <h2 className="text-3xl font-extrabold text-center tracking-tight mb-2">🎁 Claim Panel</h2>

      {/* 👤 Personal Info */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 mb-8"
      >
        <h3 className="text-blue-400 text-sm font-semibold uppercase mb-4 tracking-wide">
          👤 Personal Info
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Info label="Wallet Address" value={shorten(data.wallet_address)} />
          <Info label="Coincarnator No" value={`#${data.id}`} />
          <Info label="Referral Code" value={data.referral_code || '-'} />
          <Info label="Referrals Brought" value={data.referral_count?.toString() || '0'} />
          <Info
            label="Total USD Contributed"
            value={`$${data.total_usd_contributed?.toFixed(2) || '0.00'}`}
          />
          <Info
            label="Coins Contributed"
            value={data.total_coins_contributed?.toString() || '0'}
          />
        </div>
      </motion.section>

      {/* 📊 Claim & Stats */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 mb-8"
      >
        <h3 className="text-blue-400 text-sm font-semibold uppercase mb-4 tracking-wide">
          📊 Claim & Statistics
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatBox label="Total Contribution Size" value={`$${globalStats.totalUsd.toLocaleString()}`} color="green" />
          <StatBox label="Total Participants" value={`${globalStats.totalParticipants}`} color="blue" />
          <StatBox label="Your Share" value={`${(shareRatio * 100).toFixed(2)}%`} color="yellow" />
        </div>

        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 mb-4 text-center">
          <p className="text-sm text-gray-400 mb-1">🎯 Claimable $MEGY</p>
          <p className="text-2xl font-extrabold text-purple-400">
            {claimableMegy.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-gray-400 italic mt-2">
            ⚠️ This amount is estimated. Final value depends on total participation and will be locked at the end of Coincarnation.
          </p>
        </div>

        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 space-y-4">
          <p className="text-sm font-medium text-gray-300">Claim To Address</p>

          {!useAltAddress ? (
            <p className="text-green-400 text-sm font-mono">{publicKey?.toBase58()}</p>
          ) : (
            <input
              type="text"
              value={altAddress}
              onChange={(e) => setAltAddress(e.target.value)}
              placeholder="Enter custom wallet address"
              className="w-full bg-zinc-900 border border-zinc-600 p-2 rounded-md text-sm text-white font-mono"
            />
          )}

          <label className="flex items-center space-x-2 text-sm text-gray-300 mt-1">
            <input
              type="checkbox"
              checked={useAltAddress}
              onChange={(e) => setUseAltAddress(e.target.checked)}
              className="accent-pink-500"
            />
            <span>I want to claim to a different address</span>
          </label>

          {claimed ? (
            <p className="text-green-400 font-semibold text-center mt-4">✅ Already claimed</p>
          ) : claimOpen ? (
            <button
              onClick={handleClaim}
              disabled={isClaiming || claimableMegy <= 0}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-500 hover:scale-105 transition-all text-white font-bold py-3 rounded-xl disabled:opacity-50"
            >
              {isClaiming ? '🚀 Claiming...' : '🎉 Claim Now'}
            </button>
          ) : (
            <p className="text-yellow-400 text-center font-medium mt-4">
              ⚠️ Claiming is currently closed. You will be able to claim when the window opens.
            </p>
          )}

          {message && <p className="text-center mt-3 text-sm">{message}</p>}
        </div>

        <motion.div
          className="mt-6 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          <button
            onClick={() => window.location.href = '/'}
            className="bg-gradient-to-r from-pink-500 to-yellow-500 hover:scale-105 transition-all text-white font-bold py-3 px-6 rounded-xl text-sm shadow-lg mb-3"
          >
            🔁 Recoincarnate
          </button>
          <p className="text-xs text-gray-400 italic">
            Want to contribute more? Return to the homepage and coincarne again.
          </p>
        </motion.div>
      </motion.section>

      {/* 📜 Contribution History */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 mb-8"
      >
        <h3 className="text-yellow-400 text-sm font-semibold uppercase mb-4 tracking-wide">
          📜 Contribution History
        </h3>

        {data.transactions?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left border border-zinc-700 rounded-xl overflow-hidden">
              <thead className="bg-zinc-800 text-gray-300">
                <tr>
                  <th className="px-4 py-2">Asset</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">USD Value</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {[...data.transactions].reverse().map((tx: any, index: number) => (
                  <tr key={index} className="border-t border-zinc-700 hover:bg-zinc-800">
                    <td className="px-4 py-2 font-medium">{tx.token_symbol}</td>
                    <td className="px-4 py-2">{tx.token_amount}</td>
                    <td className="px-4 py-2">
                      {typeof tx.usd_value === 'number'
                        ? `$${tx.usd_value.toFixed(2)}`
                        : `$${Number(tx.usd_value || 0).toFixed(2)}`}
                    </td>
                    <td className="px-4 py-2">
                      {tx.timestamp ? formatDate(tx.timestamp) : 'N/A'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {(() => {
                        const referral = data.referral_code;
                        const referralLink = referral
                          ? `https://coincarnation.com?r=${referral}`
                          : 'https://coincarnation.com';

                        const tweetText = encodeURIComponent(
                          `I just coincarnated $${tx.token_symbol} into $MEGY ⚡️\n` +
                          `The crypto resurrection has begun.\n` +
                          `Join the revival → ${referralLink}`
                        );

                        return (
                          <a
                            href={`https://twitter.com/intent/tweet?text=${tweetText}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-xs transition-all"
                          >
                            Share on X
                          </a>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-sm mt-2">You haven’t Coincarnated anything yet.</p>
        )}
      </motion.section>

      {/* 💠 Personal Value Currency */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 mb-10"
      >
        <h3 className="text-pink-400 text-sm font-semibold uppercase mb-4 tracking-wide">
          💠 Personal Value Currency
        </h3>

        <div className="text-center mb-6">
          <p className="text-gray-400 text-xs mb-1">Your current CorePoint</p>
          <p className="text-4xl font-bold text-white">
            {Number(data.core_point || 0).toFixed(1)}
          </p>
        </div>

        {typeof data.pvc_share === 'number' && (
          <div className="bg-zinc-800 border border-zinc-700 p-4 rounded-lg text-center mb-6">
            <p className="text-gray-400 text-sm mb-1">🌐 Your Share in the PVC Ecosystem</p>
            <p className="text-xl font-bold text-green-300">
              {(data.pvc_share * 100).toFixed(2)}%
            </p>
            <p className="text-xs text-gray-400 mt-1 italic">
              This is your relative CorePoint share across the ecosystem. It defines your influence and reward eligibility.
            </p>
          </div>
        )}

        {data.core_point_breakdown && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-6">
            <div className="bg-zinc-800 border border-zinc-700 p-4 rounded-lg">
              <p className="text-gray-400">🪙 Coincarnation Contributions</p>
              <p className="font-bold text-white mt-1">{data.core_point_breakdown.coincarnations?.toFixed(1) || '0.0'}</p>
            </div>
            <div className="bg-zinc-800 border border-zinc-700 p-4 rounded-lg relative">
              <p className="text-gray-400">📣 Referrals</p>
              <p className="font-bold text-white mt-1">{data.core_point_breakdown.referrals?.toFixed(1) || '0.0'}</p>

              {data.referral_code && (
                <div className="absolute top-3 right-3 flex space-x-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(data.referral_code);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="bg-zinc-700 hover:bg-zinc-600 text-xs text-white px-2 py-1 rounded"
                  >
                    Copy ref.
                  </button>

                  <a
                    href={`https://twitter.com/intent/tweet?text=Join%20the%20Coincarnation%20rebirth%20with%20my%20referral%20code:%20${data.referral_code}%20🔥%0Ahttps://coincarnation.com?r=${data.referral_code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-blue-600 hover:bg-blue-700 text-xs text-white px-2 py-1 rounded"
                  >
                    Share
                  </a>
                </div>
              )}

              {copied && (
                <p className="absolute top-14 right-3 text-green-400 text-xs font-semibold">✅ Copied!</p>
              )}
            </div>
            <div className="bg-zinc-800 border border-zinc-700 p-4 rounded-lg">
              <p className="text-gray-400">🐦 Social Shares</p>
              <p className="font-bold text-white mt-1">{data.core_point_breakdown.shares?.toFixed(1) || '0.0'}</p>
            </div>
            <div className="bg-zinc-800 border border-zinc-700 p-4 rounded-lg">
              <p className="text-gray-400">💀 Deadcoins Bonus</p>
              <p className="font-bold text-white mt-1">{data.core_point_breakdown.deadcoins?.toFixed(1) || '0.0'}</p>
            </div>
          </div>
        )}

        <div className="text-gray-300 text-sm space-y-2">
          <p>
            Your Personal Value Currency (PVC) reflects your unique contribution to the Coincarnation movement.
            Referrals, shares, and Coincarnations grow your CorePoint score.
          </p>
          <p className="italic text-gray-400">
            🚧 PVC utility features are coming soon. Your CorePoint will define your rank, perks, and influence.
          </p>
        </div>
      </motion.section>
    </motion.div>
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

const colorMap = {
  green: 'text-green-300 border-green-500',
  blue: 'text-blue-300 border-blue-500',
  yellow: 'text-yellow-300 border-yellow-500',
};

function StatBox({ label, value, color }: { label: string; value: string; color: 'green' | 'blue' | 'yellow' }) {
  const classNames = colorMap[color] || 'text-white border-white';

  return (
    <div className={`bg-zinc-800 border-l-4 ${classNames} p-4 rounded-lg`}>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="font-semibold text-sm mt-1">{value}</p>
    </div>
  );
}

function shorten(addr: string) {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
