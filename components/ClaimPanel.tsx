"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { motion } from "framer-motion";
import { buildTxItemText } from "@/utils/shareX";
import { APP_URL } from "@/app/lib/origin";
import type { JSX } from 'react';
import dynamic from "next/dynamic";

const CorePointChart = dynamic(
  () => import("./CorePointChart").then(m => m.default),
  { ssr: false, loading: () => null }
);

// ShareCenter'ı client-only ve güvenli yükle (SSR yok)
const SafeShareCenter = dynamic(
  () => import('@/components/share/ShareCenter').then(m => m.default),
  { ssr: false, loading: () => null }
);

/* ---------------- Types ---------------- */
export interface Tx {
  token_symbol: string;
  token_amount: number | string;
  usd_value: number | string;
  token_contract?: string;
  transaction_signature?: string;
  tx_hash?: string;
  timestamp?: string;
}

export interface CorePointBreakdown {
  coincarnations: number;
  referrals: number;
  deadcoins: number;
  shares: number;
  by_channel?: Record<string, number>;
}

export interface ClaimData {
  id: string | number;
  wallet_address: string;
  referral_code: string | null;
  claimed: boolean;
  referral_count: number;
  referral_usd_contributions: number;
  referral_deadcoin_count: number;
  total_usd_contributed: number;
  total_coins_contributed: number;
  transactions: Tx[];
  core_point: number;
  total_core_point: number;
  pvc_share: number;
  core_point_breakdown: CorePointBreakdown;
}

type ShareContext = "profile" | "contribution" | "leaderboard" | "success";

/** Web/paste-safe truthy parse */
const asBool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1";
  }
  return false;
};

const SafeLeaderboard = dynamic(
  () => import('@/components/Leaderboard').then(m => m.default ?? (m as any).Leaderboard),
  { ssr: false, loading: () => null }
);

/* --------------- Component --------------- */
export default function ClaimPanel(): JSX.Element {
  const { publicKey } = useWallet();
  
  const __SMOKE__ = false; // test bittiğinde false yap veya satırı sil
  if (__SMOKE__) {
    return (
      <div style={{ padding: 24, color: '#fff', background: '#0b0b0b', minHeight: '60vh' }}>
        ✅ ClaimPanel SMOKE — wallet: {publicKey?.toBase58() ?? '-'}
      </div>
    );
  }

  const [data, setData] = useState<ClaimData | null>(null);
  const [claimAmount, setClaimAmount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [claimed, setClaimed] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [claimOpen, setClaimOpen] = useState<boolean>(true);
  const [useAltAddress, setUseAltAddress] = useState<boolean>(false);
  const [altAddress, setAltAddress] = useState<string>("");

  const [globalStats, setGlobalStats] = useState<{ totalUsd: number; totalParticipants: number }>({
    totalUsd: 0,
    totalParticipants: 0,
  });
  const [distributionPool, setDistributionPool] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);

  // Share modal state
  const [shareOpen, setShareOpen] = useState<boolean>(false);
  const [shareTx, setShareTx] = useState<Tx | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!publicKey) return;
      setLoading(true);
      try {
        const [claimStatusRes, userRes, globalRes, poolRes] = await Promise.all([
          fetch("/api/admin/config/claim_open"),
          fetch(`/api/claim/${publicKey.toBase58()}`),
          fetch("/api/coincarnation/stats"),
          fetch("/api/admin/config/distribution_pool"),
        ]);

        const [claimStatus, userData, globalData, poolData] = await Promise.all([
          claimStatusRes.json().catch(() => ({} as any)),
          userRes.json().catch(() => ({} as any)),
          globalRes.json().catch(() => ({} as any)),
          poolRes.json().catch(() => ({} as any)),
        ]);

        setClaimOpen(asBool((claimStatus as any)?.value));

        // Build safe ClaimData
        if ((userData as any)?.success && (userData as any).data) {
          const d = (userData as any).data;
          const safe: ClaimData = {
            id: d.id ?? "-",
            wallet_address: d.wallet_address ?? publicKey.toBase58(),
            referral_code: d.referral_code ?? null,
            claimed: Boolean(d.claimed),
            referral_count: Number(d.referral_count ?? 0),
            referral_usd_contributions: Number(d.referral_usd_contributions ?? 0),
            referral_deadcoin_count: Number(d.referral_deadcoin_count ?? 0),
            total_usd_contributed: Number(d.total_usd_contributed ?? 0),
            total_coins_contributed: Number(d.total_coins_contributed ?? 0),
            transactions: Array.isArray(d.transactions) ? (d.transactions as Tx[]) : [],
            core_point: Number(d.core_point ?? 0),
            total_core_point: Number(d.total_core_point ?? 0),
            pvc_share: Number(d.pvc_share ?? 0),
            core_point_breakdown: {
              coincarnations: Number(d.core_point_breakdown?.coincarnations ?? 0),
              referrals: Number(d.core_point_breakdown?.referrals ?? 0),
              deadcoins: Number(d.core_point_breakdown?.deadcoins ?? 0),
              shares: Number(d.core_point_breakdown?.shares ?? 0),
              by_channel: (d.core_point_breakdown?.by_channel ?? {}) as Record<string, number>,
            },
          };
          setData(safe);
          setClaimed(Boolean(safe.claimed));
        } else {
          const empty: ClaimData = {
            id: "-",
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
            core_point_breakdown: { coincarnations: 0, referrals: 0, deadcoins: 0, shares: 0 },
          };
          setData(empty);
          setClaimed(false);
        }

        if ((globalData as any)?.success) {
          setGlobalStats({
            totalUsd: Number((globalData as any).totalUsd ?? 0),
            totalParticipants: Number((globalData as any).totalParticipants ?? 0),
          });
        }

        if ((poolData as any)?.success) {
          setDistributionPool(Number((poolData as any).value ?? 0));
        }
      } catch (err) {
        console.error("Claim fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [publicKey]);

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

  const txs: Tx[] = useMemo(
    () => (Array.isArray(data.transactions) ? data.transactions : []),
    [data.transactions]
  );
  const deadcoinContracts = useMemo(
    () =>
      new Set(
        txs
          .filter((tx) => Number(tx.usd_value) === 0)
          .map((tx) => tx.token_contract)
          .filter((v): v is string => Boolean(v))
      ),
    [txs]
  );
  const deadcoinsRevived = deadcoinContracts.size;

  const shareRatio =
    globalStats.totalUsd > 0
      ? Number(data.total_usd_contributed || 0) / globalStats.totalUsd
      : 0;
  const claimableMegy = Math.floor(shareRatio * distributionPool);

  const handleClaim = async () => {
    if (!publicKey || claimAmount <= 0) {
      setMessage("❌ Please enter a valid claim amount.");
      return;
    }
    setIsClaiming(true);
    setMessage(null);

    try {
      const destination = useAltAddress ? altAddress.trim() : publicKey.toBase58();
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: destination, amount: claimAmount }),
      });
      const json = await res.json();

      if (json.success) {
        const tx_signature = json.tx_signature || "mock-tx-signature";
        const sol_fee_paid = true;

        await fetch("/api/claim/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet_address: destination,
            claim_amount: claimAmount,
            destination,
            tx_signature,
            sol_fee_paid,
          }),
        });

        setClaimed(true);
        setMessage("✅ Claim successful!");
      } else {
        setMessage(`❌ ${asText(json.error || "Unknown error")}`);
      }
    } catch (err) {
      console.error("Claim request failed:", err);
      setMessage("❌ Internal error");
    } finally {
      setIsClaiming(false);
    }
  };

  /* -------- Share payloads (tip güvenli / dış tiplerden bağımsız) -------- */
  const shareUrl = data?.referral_code ? `${APP_URL}?r=${data.referral_code}` : APP_URL;

  // Baz metin
  const basePayload = {
    url: shareUrl,
    text: "I'm reviving the Fair Future Fund with #MEGY via Coincarnation ⚡",
    hashtags: ["MEGY", "Coincarnation", "Solana"],
    via: "Coincarnation",
    utm: "utm_source=share&utm_medium=claimpanel&utm_campaign=profile",
  } as const;

  // İşlem satırına özel metin
  const sigShort =
    (shareTx?.transaction_signature ?? shareTx?.tx_hash ?? "")
      ? String(shareTx?.transaction_signature ?? shareTx?.tx_hash)
          .slice(0, 4)
          .concat("…", String(shareTx?.transaction_signature ?? shareTx?.tx_hash).slice(-4))
      : undefined;

  const txText = shareTx
    ? buildTxItemText({
        symbol: String(shareTx.token_symbol),
        amount: shareTx.token_amount,
        sigShort,
      })
    : basePayload.text;

  // ShareCenter tiplerinden bağımsız güvenli geçiş (gerekirse any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sharePayload: any = {
    ...basePayload,
    text: txText,
    utm: shareTx
      ? "utm_source=share&utm_medium=claimpanel&utm_campaign=tx"
      : basePayload.utm,
  };

  const shareContext: ShareContext = shareTx ? "contribution" : "profile";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shareContextAny: any = shareContext;
  const shareTxId = shareTx
    ? String(shareTx.transaction_signature ?? shareTx.tx_hash ?? "")
    : undefined;

  return (
    <div className="bg-zinc-950 min-h-screen py-10 px-4 sm:px-6 md:px-12 lg:px-20 text-white">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="bg-zinc-900 text-white p-6 rounded-2xl max-w-6xl w-full mx-auto border border-zinc-700 shadow-lg space-y-10"
      >
        <h2 className="text-3xl font-extrabold text-center tracking-tight mb-2">🎁 Claim Panel</h2>

        {/* Personal Info */}
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
            <Info label="Coincarnator No" value={`#${String(data.id)}`} />

            <div
              className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 min-h-[100px] flex flex-col justify-between relative cursor-pointer hover:bg-zinc-700 transition"
              onClick={() => {
                if (!data.referral_code) return;
                navigator.clipboard.writeText(String(data.referral_code));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <p className="text-gray-400 text-sm mb-1">Referral Code</p>
              <p className="text-white font-medium text-sm break-words">
                {data.referral_code || "-"}
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

        {/* Claim & Statistics */}
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
            <StatBox
              label="Your Share"
              value={`${(shareRatio * 100).toFixed(2)}%`}
              color="yellow"
            />
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
                  value={Number.isFinite(claimAmount) ? claimAmount : 0}
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
                {isClaiming ? "🚀 Claiming..." : "🎉 Claim Now"}
              </button>
            ) : (
              <p className="text-yellow-400 text-center font-medium mt-4">
                ⚠️ Claiming is currently closed. You will be able to claim when the window opens.
              </p>
            )}

            {message && <p className="text-center mt-3 text-sm">{asText(message)}</p>}

          </div>

          <motion.div
            className="mt-6 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            <button
              onClick={() => (window.location.href = "/")}
              className="bg-gradient-to-r from-pink-500 to-yellow-500 hover:scale-105 transition-all text-white font-bold py-3 px-6 rounded-xl text-sm shadow-lg mb-3"
            >
              🔁 Recoincarnate
            </button>
            <p className="text-xs text-gray-400 italic">
              Want to contribute more? Return to the homepage and coincarne again.
            </p>
          </motion.div>
        </motion.section>

        {/* Contribution History */}
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
                  {[...txs].reverse().map((tx, index) => (
                    <tr
                      key={`${tx.transaction_signature ?? tx.tx_hash ?? index}`}
                      className="border-t border-zinc-700 hover:bg-zinc-800"
                    >
                      <td className="px-4 py-2 font-medium">{tx.token_symbol}</td>
                      <td className="px-4 py-2">{tx.token_amount}</td>
                      <td className="px-4 py-2">
                        {typeof tx.usd_value === "number"
                          ? `$${tx.usd_value.toFixed(2)}`
                          : `$${Number(tx.usd_value || 0).toFixed(2)}`}
                      </td>
                      <td className="px-4 py-2">
                        {tx.timestamp ? formatDate(tx.timestamp) : "N/A"}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-xs transition-all"
                          onClick={() => {
                            setShareTx(tx);
                            setShareOpen(true);
                          }}
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

        {/* Personal Value Currency */}
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

          {typeof data.pvc_share === "number" && (
            <div className="bg-zinc-800 border border-zinc-700 p-4 rounded-lg text-center mb-6">
              <p className="text-gray-400 text-sm mb-1">
                🌐 Your Share in the PVC Ecosystem
              </p>
              <p className="text-xl font-bold text-green-300">
                {(Number(data.pvc_share) * 100).toFixed(2)}%
              </p>
              <p className="text-xs text-gray-400 mt-1 italic">
                This is your relative CorePoint share across the ecosystem. It defines your
                influence and reward eligibility.
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
                    <a
                      href={`https://twitter.com/intent/tweet?text=Join%20the%20Coincarnation%20rebirth%20with%20my%20referral%20code!%20🔥%0Ahttps://coincarnation.com?r=${data.referral_code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-blue-600 hover:bg-blue-700 text-xs text-white px-2 py-1 rounded"
                    >
                      Share
                    </a>
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
                    description="100 pts per $1 value contributed via deadcoins"
                  />
                  <ContributionCard
                    icon="📣"
                    title="Referrals"
                    points={data.core_point_breakdown.referrals}
                    description={`${data.referral_count} person x 100 + $${Number(
                      data.referral_usd_contributions || 0
                    ).toFixed(2)} x 50 + ${data.referral_deadcoin_count} deadcoins x 100`}
                  />
                  <ContributionCard
                    icon="🐦"
                    title="Shares"
                    points={data.core_point_breakdown.shares}
                    description="Each unique share gives +30 CorePoints (only once per channel/context)"
                  />
                  <ContributionCard
                    icon="💀"
                    title="Deadcoins Bonus"
                    points={data.core_point_breakdown.deadcoins}
                    description="Extra 100 pts for each deadcoin revived (USD = 0)"
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
          <SafeLeaderboard />
        </motion.section>
      </motion.div>

      {/* Share Center Modal (dynamic/ssr:false) */}
      {shareOpen && (
        <SafeShareCenter
          open={shareOpen}
          onOpenChange={setShareOpen}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload={sharePayload as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          context={shareContextAny}
          txId={shareTxId}
          onAfterShare={async ({ channel, context, txId }: { channel: string; context: string; txId?: string }) => {
            if (!publicKey) return;
            try {
              await fetch('/api/share/record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  wallet_address: publicKey.toBase58(),
                  channel,
                  context,
                  txId: txId || null,
                }),
              });
            } catch (e) {
              console.error('share record error', e);
            }
          }}
        />
      )}
    </div>
  );
}

/* ---------------- Small UI helpers ---------------- */
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 min-h-[100px] flex flex-col justify-between">
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className="text-white font-medium text-sm break-words">{value}</p>
    </div>
  );
}

// components/ClaimPanel.tsx (en üstlere yakın, yardımcıların yanına)
function asText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  try { return JSON.stringify(v); } catch { return String(v); }
}

const colorMap = {
  green: "text-green-300 border-green-500",
  blue: "text-blue-300 border-blue-500",
  yellow: "text-yellow-300 border-yellow-500",
} as const;

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: keyof typeof colorMap;
}) {
  const classNames = colorMap[color] || "text-white border-white";
  return (
    <div className={`bg-zinc-800 border-l-4 ${classNames} p-4 rounded-lg`}>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="font-semibold text-sm mt-1">{value}</p>
    </div>
  );
}

function shorten(addr: string) {
  const s = String(addr || "");
  return s ? s.slice(0, 6) + "..." + s.slice(-4) : "-";
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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
      <p className="text-white text-lg font-bold mb-1">
        {Number(points || 0).toFixed(1)} pts
      </p>
      <p className="text-xs text-gray-400">{description}</p>
    </div>
  );
}
