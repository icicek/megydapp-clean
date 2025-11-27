// components/ClaimPanel.tsx

'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import CorePointChart from './CorePointChart';
import Leaderboard from './Leaderboard';
import { APP_URL } from '@/app/lib/origin';
import type { SharePayload } from '@/components/share/intent';
import ShareCenter from '@/components/share/ShareCenter';
import { buildPayload } from '@/components/share/intent';

// 🔽 CorePoint geçmişini çeken küçük helper
async function fetchCorepointHistory(wallet: string | null): Promise<any[]> {
  if (!wallet) return [];
  try {
    const r = await fetch(`/api/corepoints/history?wallet=${wallet}`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!j?.success) return [];
    return Array.isArray(j.events) ? j.events : [];
  } catch (e) {
    console.warn('⚠️ corepoint history fetch failed:', e);
    return [];
  }
}

const asBool = (v: unknown): boolean => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === '1';
  }
  return false;
};

type CpConfig = {
  usdPer1: number;
  deadcoinFirst: number;
  shareTwitter: number;
  shareOther: number;
  refSignup: number;
  multShare: number;
  multUsd: number;
  multDeadcoin: number;
  multReferral: number;
};

export default function ClaimPanel() {
  const { publicKey } = useWallet();

  const [cpConfig, setCpConfig] = useState<CpConfig | null>(null);
  const [data, setData] = useState<any>(null);
  const [claimAmount, setClaimAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [claimOpen, setClaimOpen] = useState(true);
  const [useAltAddress, setUseAltAddress] = useState(false);
  const [altAddress, setAltAddress] = useState('');

  const [globalStats, setGlobalStats] = useState({ totalUsd: 0, totalParticipants: 0 });
  const [distributionPool, setDistributionPool] = useState(0);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [shareContext, setShareContext] = useState<'profile'|'contribution'|'leaderboard'|'success'>('profile');
  const [shareTxId, setShareTxId] = useState<string|undefined>(undefined);
  const [cpHistory, setCpHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);
  const [shareAnchor, setShareAnchor] = useState<string | undefined>(undefined);

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

        const [claimStatus, userData, globalData, poolData] = await Promise.all([
          claimStatusRes.json().catch(() => ({})),
          userRes.json().catch(() => ({})),
          globalRes.json().catch(() => ({})),
          poolRes.json().catch(() => ({})),
        ]);

        setClaimOpen(asBool(claimStatus?.value));

        // ✅ Boş profil desteği: success değilse de UI açık kalsın
        if (userData?.success) {
          setData(userData.data);
          setClaimed(Boolean(userData.data?.claimed));
        } else {
          setData({
            id: '-',
            wallet_address: publicKey.toBase58(),
            referral_code: null,
            claimed: false,
            referral_count: 0,
            referral_usd_contributions: 0,
            referral_deadcoin_count: 0,
            total_usd_contributed: 0,
            total_coins_contributed: 0,
            transactions: [],
            core_point: 0,
            total_core_point: 0,
            pvc_share: 0,
            core_point_breakdown: {
              coincarnations: 0,
              referrals: 0,
              deadcoins: 0,
              shares: 0,
            },
          });
          setClaimed(false);
        }

        if (globalData?.success) {
          setGlobalStats({
            totalUsd: Number(globalData.totalUsd ?? 0),
            totalParticipants: Number(globalData.totalParticipants ?? 0),
          });
        }

        if (poolData?.success) {
          setDistributionPool(Number(poolData.value ?? 0));
        }
      } catch (err) {
        console.error('Claim fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [publicKey]);

  // CorePoint config (server-side weights → UI descriptions)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/corepoints/config', { cache: 'no-store' });
        if (!r.ok) return;

        const j = await r.json().catch(() => null);
        const cfg = j?.config;
        if (!cfg) return;

        setCpConfig({
          usdPer1:       Number(cfg.usdPer1       ?? cfg.usd_per_1       ?? 100),
          deadcoinFirst: Number(cfg.deadFirst    ?? cfg.deadcoinFirst   ?? 100),
          shareTwitter:  Number(cfg.shareTw      ?? cfg.shareTwitter    ?? 30),
          shareOther:    Number(cfg.shareOther   ?? 10),
          refSignup:     Number(cfg.refSign      ?? cfg.refSignup       ?? 100),
          multShare:     Number(cfg.mShare       ?? cfg.multShare       ?? 1),
          multUsd:       Number(cfg.mUsd         ?? cfg.multUsd         ?? 1),
          multDeadcoin:  Number(cfg.mDead        ?? cfg.multDeadcoin    ?? 1),
          multReferral:  Number(cfg.mRef         ?? cfg.multReferral    ?? 1),
        });
      } catch (e) {
        console.warn('⚠️ cpConfig fetch failed:', e);
      }
    })();
  }, []);

  useEffect(() => {
    const w = publicKey?.toBase58() ?? null;
    if (!w) {
      setCpHistory([]);
      setLoadingHistory(false);
      return;
    }
    (async () => {
      setLoadingHistory(true);
      const events = await fetchCorepointHistory(w);
      setCpHistory(events);
      setLoadingHistory(false);
    })();
  }, [publicKey]);  

  // ⛑️ İlk kare guard’ları
  if (!publicKey) {
    return (
      <p className="text-center text-yellow-400">
        🔌 Please connect your wallet to view your claim profile.
      </p>
    );
  }
  if (loading || data === null) {
    return <p className="text-center text-blue-400">⏳ Loading your claim data...</p>;
  }

  // ✅ Crash fix: tx listesi yoksa dizi kullan
  const txs: any[] = Array.isArray(data.transactions) ? data.transactions : [];
  const deadcoinContracts = new Set(
    txs
      .filter((tx) => Number(tx.usd_value) === 0)
      .map((tx) => tx.token_contract)
      .filter(Boolean)
  );
  const deadcoinsRevived = deadcoinContracts.size;

  const shareRatio =
    globalStats.totalUsd > 0 ? Number(data.total_usd_contributed || 0) / globalStats.totalUsd : 0;
  const claimableMegy = Math.floor(shareRatio * distributionPool);

  const handleClaim = async () => {
    if (!publicKey || claimAmount <= 0) {
      setMessage('❌ Please enter a valid claim amount.');
      return;
    }
    setIsClaiming(true);
    setMessage(null);

    try {
      const destination = useAltAddress ? altAddress.trim() : publicKey.toBase58();
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: destination, amount: claimAmount }),
      });
      const json = await res.json();

      if (json.success) {
        const tx_signature = json.tx_signature || 'mock-tx-signature';
        const sol_fee_paid = true;

        await fetch('/api/claim/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_address: destination,
            claim_amount: claimAmount,
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

  return (
    <div className="bg-zinc-950 min-h-screen py-10 px-4 sm:px-6 md:px-12 lg:px-20 text-white">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="bg-zinc-900 text-white p-6 rounded-2xl max-w-6xl w-full mx-auto border border-zinc-700 shadow-lg space-y-10"
      >
        <h2 className="text-3xl font-extrabold text-center tracking-tight mb-2">🎁 Claim Panel</h2>

        {/* 👤 Personal Info */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-4 sm:px-6 sm:py-5 mb-5 shadow-md"
        >
          <h3 className="text-blue-400 text-sm font-semibold uppercase mb-4 tracking-wide">
            👤 Personal Info
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full">
            <Info label="Wallet Address" value={shorten(data.wallet_address)} />
            <Info label="Coincarnator No" value={`#${data.id}`} />

            <div
              className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 min-h-[100px] flex flex-col justify-between relative cursor-pointer hover:bg-zinc-700 transition"
              onClick={() => {
                if (!data?.referral_code) return;
                const url = `${APP_URL}?r=${encodeURIComponent(data.referral_code)}`;
                navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}              
            >
              <p className="text-gray-400 text-sm mb-1">Referral Code</p>
              <p className="text-white font-medium text-sm break-words">
                {data.referral_code || '-'}
              </p>
              {copied && (
                <p className="absolute top-20 right-3 text-green-400 text-xs font-semibold">
                  ✅ Code copied!
                </p>
              )}
            </div>

            <Info label="Referrals Brought" value={String(data.referral_count ?? 0)} />
            <Info
              label="Total USD Contributed"
              value={`$${Number(data.total_usd_contributed || 0).toFixed(2)}`}
            />
            <Info label="Deadcoins Revived" value={String(deadcoinsRevived)} />
          </div>
        </motion.section>

        {/* 📊 Claim & Statistics */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 sm:px-6 py-4 sm:py-5 mb-5 shadow-md"
        >
          <h3 className="text-blue-400 text-sm font-semibold uppercase mb-4 tracking-wide">
            📊 Claim & Statistics
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <StatBox
              label="Total Contribution Size"
              value={`$${globalStats.totalUsd.toLocaleString()}`}
              color="green"
            />
            <StatBox
              label="Total Participants"
              value={`${globalStats.totalParticipants}`}
              color="blue"
            />
            <StatBox label="Your Share" value={`${(shareRatio * 100).toFixed(2)}%`} color="yellow" />
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 mb-4 text-center">
            <p className="text-sm text-gray-400 mb-1">🎯 Claimable $MEGY</p>
            <p className="text-2xl font-extrabold text-purple-400">
              {claimableMegy.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-gray-400 italic mt-2">
              ⚠️ This amount is estimated. Final value depends on total participation and will be
              locked at the end of Coincarnation.
            </p>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-4 sm:px-4 sm:py-5 space-y-6">
            <p className="text-sm font-medium text-gray-300">Claim To Address</p>

            {!useAltAddress ? (
              <p className="text-green-400 text-sm font-mono break-all bg-zinc-900 p-2 rounded">
                {publicKey?.toBase58()}
              </p>
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

            {claimOpen && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs text-gray-300 font-medium">
                  <button
                    className="bg-zinc-700 px-2 py-1 rounded hover:bg-zinc-600 transition"
                    onClick={() => setClaimAmount(Math.floor(claimableMegy * 0.25))}
                  >
                    %25
                  </button>
                  <button
                    className="bg-zinc-700 px-2 py-1 rounded hover:bg-zinc-600 transition"
                    onClick={() => setClaimAmount(Math.floor(claimableMegy * 0.5))}
                  >
                    %50
                  </button>
                  <button
                    className="bg-zinc-700 px-2 py-1 rounded hover:bg-zinc-600 transition"
                    onClick={() => setClaimAmount(Math.floor(claimableMegy * 1.0))}
                  >
                    %100
                  </button>
                </div>

                <input
                  type="number"
                  value={claimAmount}
                  onChange={(e) => setClaimAmount(Number(e.target.value))}
                  placeholder="Enter amount to claim"
                  className="w-full bg-zinc-900 border border-zinc-600 p-2 rounded-md text-sm text-white"
                />
              </div>
            )}

            {claimed ? (
              <p className="text-green-400 font-semibold text-center mt-4">✅ Already claimed</p>
            ) : claimOpen ? (
              <button
                onClick={handleClaim}
                disabled={isClaiming || claimAmount <= 0 || claimAmount > claimableMegy}
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
              onClick={() => (window.location.href = '/')}
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
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-4 sm:px-6 sm:py-5 mb-5 shadow-md"
        >
          <h3 className="text-yellow-400 text-sm font-semibold uppercase mb-4 tracking-wide">
            📜 Contribution History
          </h3>

          {txs.length > 0 ? (
            <div className="w-full overflow-x-auto rounded-xl border border-zinc-700">
              <table className="min-w-[600px] w-full text-sm text-left bg-zinc-900">
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
                  {[...txs].reverse().map((tx: any, index: number) => (
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
                      <button
                        onClick={() => {
                          const url = data.referral_code
                            ? `${APP_URL}?r=${data.referral_code}`
                            : APP_URL;

                          const payload = buildPayload(
                            'contribution',
                            {
                              url,
                              token: tx.token_symbol,
                              amount: tx.token_amount,
                            },
                            {
                              ref: data.referral_code ?? undefined,
                              src: 'app', // ctx otomatik 'contribution'
                            },
                          );

                          setSharePayload(payload);
                          setShareContext('contribution');

                          // 🔹 txId'yi MÜMKÜN OLAN TÜM ALANLARDAN türet:
                          const rawTxId =
                            (tx.tx_id && String(tx.tx_id)) ||
                            (tx.txId && String(tx.txId)) ||
                            (tx.transaction_signature && String(tx.transaction_signature)) ||
                            (tx.tx_signature && String(tx.tx_signature)) ||
                            (tx.tx_hash && String(tx.tx_hash)) ||
                            undefined;

                          // 🔹 Anchor: her işlem için tekil bir anahtar
                          const wallet = data.wallet_address || publicKey?.toBase58() || 'unknown';
                          const anchor =
                            rawTxId
                              ? `contribution:${wallet}:${rawTxId}`
                              : `contribution:${wallet}:idx-${index}`;

                          console.log('[ClaimPanel] open share from history', { rawTxId, anchor, tx });

                          // ❗ CP hesaplamasını anchor üzerinden yapmak için txId'yi boş bırakıyoruz
                          setShareTxId(undefined);
                          setShareAnchor(anchor);

                          setShareOpen(true);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-xs transition-all"
                      >
                        Share
                      </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-sm mt-2">
              You haven’t Coincarnated anything yet.
            </p>
          )}
        </motion.section>

        {/* 📜 CorePoint History */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-4 sm:px-6 sm:py-5 mb-5 shadow-md"
        >
          <h3 className="text-emerald-400 text-sm font-semibold uppercase mb-4 tracking-wide">
            📜 CorePoint History
          </h3>

          {loadingHistory && (
            <p className="text-gray-400 text-sm">Loading…</p>
          )}

          {!loadingHistory && cpHistory.length === 0 && (
            <p className="text-gray-400 text-sm">No CorePoint activity yet.</p>
          )}

          {!loadingHistory && cpHistory.length > 0 && (
            <div className="w-full overflow-x-auto rounded-xl border border-zinc-700">
              <table className="min-w-[640px] w-full text-sm text-left bg-zinc-900">
                <thead className="bg-zinc-800 text-gray-300">
                  <tr>
                    <th className="px-4 py-2">Points</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Detail</th>
                    <th className="px-4 py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {cpHistory.map((ev, i) => {
                    const typeLabel =
                      ev.type === 'usd' ? 'Contribution'
                      : ev.type === 'deadcoin_first' ? 'Deadcoin (first)'
                      : ev.type === 'share' ? 'Share'
                      : ev.type === 'referral_signup' ? 'Referral (signup)'
                      : ev.type || 'Other';

                    let detail = '';
                    if (ev.type === 'usd') {
                      detail = `$${Number(ev.value || 0).toFixed(2)} Coincarnation`;
                    } else if (ev.type === 'share') {
                      detail = ev.channel ? String(ev.channel).toUpperCase() : 'Share';
                    } else if (ev.type === 'deadcoin_first') {
                      detail = ev.token_contract ? `Contract: ${ev.token_contract}` : '';
                    } else if (ev.type === 'referral_signup') {
                      detail = ev.ref_wallet ? `Referee: ${ev.ref_wallet}` : '';
                    }

                    const dateStr = ev.created_at || ev.day || null;

                    return (
                      <tr key={i} className="border-t border-zinc-700 hover:bg-zinc-800">
                        <td className="px-4 py-2 font-semibold text-emerald-400">
                          +{Number(ev.points || 0).toFixed(1)} CP
                        </td>
                        <td className="px-4 py-2">{typeLabel}</td>
                        <td className="px-4 py-2">{detail || '-'}</td>
                        <td className="px-4 py-2">
                          {dateStr ? formatDate(dateStr) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.section>

        {/* 💠 Personal Value Currency */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-4 sm:px-6 sm:py-5 mb-5 shadow-md"
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
                {(Number(data.pvc_share) * 100).toFixed(2)}%
              </p>
              <p className="text-xs text-gray-400 mt-1 italic">
                This is your relative CorePoint share across the ecosystem. It defines your influence
                and reward eligibility.
              </p>
            </div>
          )}

          {data.core_point_breakdown && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-6">
              <div className="bg-zinc-800 border border-zinc-700 p-4 rounded-lg">
                <p className="text-gray-400">🪙 Coincarnation Contributions</p>
                <p className="font-bold text-white mt-1">
                  {Number(data.core_point_breakdown.coincarnations || 0).toFixed(1)} pts
                </p>
              </div>
              <div className="bg-zinc-800 border border-zinc-700 p-4 rounded-lg relative">
                <p className="text-gray-400 text-sm">📣 Referrals</p>
                <p className="font-bold text-white mt-1">
                  {Number(data.core_point_breakdown.referrals || 0).toFixed(1)} pts
                </p>

                {data.referral_code && (
                  <div className="absolute top-3 right-3 flex flex-col sm:flex-row sm:space-x-2 space-y-2 sm:space-y-0">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `https://coincarnation.com?r=${data.referral_code}`
                        );
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="bg-zinc-700 hover:bg-zinc-600 text-xs text-white px-2 py-1 rounded"
                    >
                      Copy link
                    </button>
                    <button
                      onClick={() => {
                        if (!data.referral_code) return;
                        const url = `${APP_URL}?r=${data.referral_code}`;
                        const payload = buildPayload(
                          'profile',
                          { url },
                          {
                            ref: data.referral_code ?? undefined,
                            src: 'app',
                            // ctx otomatik 'profile'
                          },
                        );

                        setSharePayload(payload);
                        setShareContext('profile'); // profil / referral paylaşımı

                        // 🔹 Her wallet için 1 kez CP: profile:<wallet>
                        setShareTxId(undefined);
                        setShareAnchor(`profile:${data.wallet_address}`);

                        setShareOpen(true);
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-xs text-white px-2 py-1 rounded"
                    >
                      Share
                    </button>
                  </div>
                )}

                {copied && (
                  <p className="absolute top-14 right-3 text-green-400 text-xs font-semibold">
                    ✅ Copied!
                  </p>
                )}
              </div>
              <div className="bg-zinc-800 border border-zinc-700 p-4 rounded-lg">
                <p className="text-gray-400">🐦 Social Shares</p>
                <p className="font-bold text-white mt-1">
                  {Number(data.core_point_breakdown.shares || 0).toFixed(1)} pts
                </p>
              </div>
              <div className="bg-zinc-800 border border-zinc-700 p-4 rounded-lg">
                <p className="text-gray-400">💀 Deadcoins Bonus</p>
                <p className="font-bold text-white mt-1">
                  {Number(data.core_point_breakdown.deadcoins || 0).toFixed(1)} pts
                </p>
              </div>
            </div>
          )}

          {data.core_point_breakdown && (
            <>
              <div className="mt-10">
                <CorePointChart data={data.core_point_breakdown} />
              </div>
              <div className="mt-10 sm:mt-20">
                <h4 className="text-indigo-400 text-sm font-semibold uppercase mb-4 tracking-wide">
                  🔍 Contribution Breakdown
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <ContributionCard
                    icon="🪙"
                    title="Coincarnations"
                    points={data.core_point_breakdown.coincarnations}
                    description={
                      cpConfig
                        ? `Currently ~${Math.round(cpConfig.usdPer1 * cpConfig.multUsd)} CP per $1 revived.`
                        : 'CorePoints from your Coincarnation contributions.'
                    }
                  />

                  <ContributionCard
                    icon="📣"
                    title="Referrals"
                    points={data.core_point_breakdown.referrals}
                    description={
                      cpConfig
                        ? `Each new wallet you bring starts at ~${Math.round(
                            cpConfig.refSignup * cpConfig.multReferral
                          )} CP, plus extra from their contributions & deadcoins.`
                        : `${data.referral_count} person joined with your link; their activity boosts your CorePoint.`
                    }
                  />

                  <ContributionCard
                    icon="🐦"
                    title="Shares"
                    points={data.core_point_breakdown.shares}
                    description={
                      cpConfig
                        ? `First share on X: ~${Math.round(
                            cpConfig.shareTwitter * cpConfig.multShare
                          )} CP; other channels: ~${Math.round(
                            cpConfig.shareOther * cpConfig.multShare
                          )} CP (once per wallet).`
                        : 'CorePoints for sharing Coincarnation on X and other channels.'
                    }
                  />

                  <ContributionCard
                    icon="💀"
                    title="Deadcoins Bonus"
                    points={data.core_point_breakdown.deadcoins}
                    description={
                      cpConfig
                        ? `Each deadcoin contract you revive: ~${Math.round(
                            cpConfig.deadcoinFirst * cpConfig.multDeadcoin
                          )} bonus CP (once per contract).`
                        : 'Extra CorePoints for reviving true deadcoins (USD = 0).'
                    }
                  />
                </div>
              </div>
            </>
          )}

          <div className="text-gray-300 text-sm space-y-2 mt-10">
            <p>
              CorePoint defines your Personal Value Currency (PVC). It's built from your actions:
              Coincarnations, referrals, shares, and more.
            </p>
            <p className="italic text-gray-400">
              🚧 PVC utility features are coming soon. Your CorePoint will define your rank, perks,
              and influence in the Coincarnation ecosystem.
            </p>
          </div>
          <Leaderboard referralCode={data.referral_code ?? undefined} />
        </motion.section>
      </motion.div>
      {shareOpen && sharePayload && (
        <ShareCenter
          open={shareOpen}
          onOpenChange={setShareOpen}
          payload={sharePayload}
          context={shareContext}
          txId={shareTxId}
          walletBase58={publicKey?.toBase58() ?? null}
          anchor={shareAnchor}
        />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 min-h-[100px] flex flex-col justify-between">
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className="text-white font-medium text-sm break-words">{value}</p>
    </div>
  );
}

const colorMap = {
  green: 'text-green-300 border-green-500',
  blue: 'text-blue-300 border-blue-500',
  yellow: 'text-yellow-300 border-yellow-500',
};

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'green' | 'blue' | 'yellow';
}) {
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
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function ContributionCard({
  icon,
  title,
  points,
  description,
}: {
  icon: string;
  title: string;
  points: number;
  description: string;
}) {
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 flex flex-col justify-between hover:bg-zinc-700 transition">
      <div className="flex items-center space-x-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <h4 className="text-sm font-semibold text-white">{title}</h4>
      </div>
      <p className="text-white text-lg font-bold mb-1">{Number(points || 0).toFixed(1)} pts</p>
      <p className="text-xs text-gray-400">{description}</p>
    </div>
  );
}