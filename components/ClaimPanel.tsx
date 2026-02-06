// components/ClaimPanel.tsx

'use client';

import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import CorePointChart from './CorePointChart';
import Leaderboard from './Leaderboard';
import { buildReferralUrl } from '@/app/lib/origin';
import type { SharePayload } from '@/components/share/intent';
import ShareCenter from '@/components/share/ShareCenter';
import { buildPayload } from '@/components/share/intent';
import {
  PublicKey,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';

const TREASURY_PUBKEY = new PublicKey(
  process.env.NEXT_PUBLIC_CLAIM_FEE_TREASURY ??
    'D7iqkQmY3ryNFtc9qseUv6kPeVjxsSD98hKN5q3rkYTd'
);

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
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [cpConfig, setCpConfig] = useState<CpConfig | null>(null);
  const [data, setData] = useState<any>(null);
  const [claimAmount, setClaimAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [useAltAddress, setUseAltAddress] = useState(false);
  const [altAddress, setAltAddress] = useState('');
  const [phaseId, setPhaseId] = useState<number | null>(null);
  const [phaseLoading, setPhaseLoading] = useState<boolean>(true);
  const [sessionId, setSessionId] = useState<string | null>(null);

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
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null);
  const [currentPhase, setCurrentPhase] = useState<any | null>(null);
  const [phasesLoading, setPhasesLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
  
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
  
        if (!alive) return;
  
        setClaimOpen(asBool(claimStatus?.value));
  
        if (userData?.success) {
          setData(userData.data);
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
            deadcoins_revived: 0,
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
            claim: {
              finalized_megy_total: 0,
              claimed_megy_total: 0,
              claimable_megy_total: 0,
              finalized_by_phase: [],
            },
          });
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
        if (!alive) return;
        console.error('Claim fetch error:', err);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };
  
    fetchData();
  
    return () => {
      alive = false;
    };
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
    (async () => {
      try {
        setPhasesLoading(true);
        const r = await fetch('/api/phases/list', { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        const list = Array.isArray(j?.phases) ? j.phases : [];
  
        const norm = (s: any) => String(s ?? '').toLowerCase().trim();
  
        const active =
          list.find((p: any) => norm(p.status) === 'active') ||
          list.find((p: any) => norm(p.status) === 'open') ||
          list.slice().sort((a: any, b: any) => Number(b.phase_no ?? 0) - Number(a.phase_no ?? 0))[0] ||
          null;
  
        setCurrentPhase(active);
      } catch (e) {
        console.warn('phases list fetch failed:', e);
        setCurrentPhase(null);
      } finally {
        setPhasesLoading(false);
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

  useEffect(() => {
    setSessionId(null);
  }, [publicKey]);  

  useEffect(() => {
  (async () => {
    try {
      setPhaseLoading(true);
      const r = await fetch('/api/phases/finalized/latest', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));

      const pid = Number(j?.phase_id);
      if (r.ok && j?.success && Number.isFinite(pid) && pid > 0) {
        setPhaseId(pid);
        setSelectedPhaseId(pid); // default: latest finalized
      } else {
        setPhaseId(null);
        setSelectedPhaseId(null);
      }
    } catch (e) {
      console.warn('phase fetch failed:', e);
      setPhaseId(null);
      setSelectedPhaseId(null);
    } finally {
      setPhaseLoading(false);
    }
  })();
}, []);

  // ⛑️ İlk kare guard’ları (render içinde setState YOK!)
  if (!publicKey) {
    return (
      <div className="bg-zinc-950 min-h-screen py-10 px-4 text-white">
        <p className="text-center text-yellow-300 font-medium">❌ Please connect your wallet.</p>
      </div>
    );
  }
  
  if (loading || data === null) {
    return <p className="text-center text-blue-400">⏳ Loading your claim data...</p>;
  }

  // ✅ Crash fix: tx listesi yoksa dizi kullan
  const txs: any[] = Array.isArray(data.transactions) ? data.transactions : [];

  const finalizedClaim = data?.claim ?? null;
  const claimableFromFinalized = (() => {
    const n = Number(finalizedClaim?.claimable_megy_total ?? NaN);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  })();  

  // 🔹 Deadcoins Revived sayısını artık backend'den alıyoruz
  const deadcoinsRevived = Number(data.deadcoins_revived ?? 0);

  const shareRatio =
    globalStats.totalUsd > 0 ? Number(data.total_usd_contributed || 0) / globalStats.totalUsd : 0;

  const claimableMegyEstimate = Math.floor(shareRatio * distributionPool);

  const claimableMegy =
    claimableFromFinalized != null
      ? Math.floor(claimableFromFinalized)
      : claimableMegyEstimate;

  const finalizedTotal = Number(finalizedClaim?.finalized_megy_total ?? 0);
  const claimedTotal = Number(finalizedClaim?.claimed_megy_total ?? 0);

  // Phase selection (Option A: phase-based claim)
  const latestFinalizedPhaseId = phaseId;

  const effectivePhaseId =
    (selectedPhaseId != null && Number.isFinite(selectedPhaseId) && selectedPhaseId > 0)
      ? selectedPhaseId
      : latestFinalizedPhaseId;

  const selectedPhaseRow =
    (effectivePhaseId && Array.isArray(finalizedClaim?.finalized_by_phase))
      ? finalizedClaim.finalized_by_phase.find((p: any) => Number(p.phase_id) === Number(effectivePhaseId))
      : null;

  const selectedClaimable = selectedPhaseRow
    ? Math.max(0, Number(selectedPhaseRow.claimable_megy ?? 0))
    : 0;

  async function ensureOpenSession(wallet: string, destination: string): Promise<string> {
    const FEE_SOL = 0.002;
    const FEE_LAMPORTS = Math.round(FEE_SOL * 1_000_000_000); // 2,000,000

    // 1) First try WITHOUT fee: reuse open session if exists
    let r = await fetch('/api/claim/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ wallet_address: wallet, destination }),
    });

    let j: any = await r.json().catch(() => ({}));

    if (r.ok && j?.success && j?.session_id) {
      const sid = String(j.session_id);
      setSessionId(sid);
      return sid;
    }

    // 2) No open session → backend asks for fee
    const err = String(j?.error || '');
    if (err !== 'MISSING_FEE_SIGNATURE') {
      throw new Error(err || `SESSION_START_FAILED (${r.status})`);
    }

    // 3) Production UX: pay fee automatically via wallet
    if (!publicKey) throw new Error('WALLET_NOT_CONNECTED');
    if (!connection) throw new Error('RPC_CONNECTION_MISSING');
    if (!sendTransaction) throw new Error('WALLET_SEND_TX_UNAVAILABLE');

    {claimOpen && (
      <div className="bg-zinc-900/60 ...">
        setMessage('💸 Paying the 0.002 SOL session fee… Please confirm in your wallet.');
      </div>
    )}

    // Build fee transfer transaction: payer (user) -> treasury
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: TREASURY_PUBKEY,
        lamports: FEE_LAMPORTS,
      })
    );
    tx.feePayer = publicKey;

    const latest = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = latest.blockhash;

    // ✅ Send (reliable-ish)
    const feeSig = String(
      await sendTransaction(
        tx,
        connection,
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        } as any
      )
    );

    setMessage('⏳ Confirming fee payment on-chain…');

    let confirmedByConfirmTx = false;

    try {
      await connection.confirmTransaction(
        {
          signature: feeSig,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        'confirmed'
      );
      confirmedByConfirmTx = true;
    } catch (e) {
      console.warn('[ClaimPanel] confirmTransaction failed; falling back to polling', e);
    }

    if (!confirmedByConfirmTx) {
      const start = Date.now();
      const TIMEOUT_MS = 60_000;

      while (true) {
        const st = await connection.getSignatureStatus(feeSig, {
          searchTransactionHistory: true,
        });

        const cs = st?.value?.confirmationStatus;

        if (st?.value?.err) {
          console.error('Fee tx status err:', st.value.err, { feeSig });
          throw new Error('FEE_TX_FAILED');
        }

        if (cs === 'confirmed' || cs === 'finalized') {
          break;
        }

        if (Date.now() - start > TIMEOUT_MS) {
          const txInfo = await connection.getTransaction(feeSig, {
            maxSupportedTransactionVersion: 0,
          });

          if (txInfo?.meta?.err) throw new Error('FEE_TX_FAILED');
          if (txInfo) break;

          throw new Error('FEE_TX_CONFIRM_TIMEOUT');
        }

        await new Promise((res) => setTimeout(res, 1200));
      }
    }

    // 4) Now open the session with fee tx signature
    r = await fetch('/api/claim/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        wallet_address: wallet,
        destination,
        fee_tx_signature: feeSig,
        fee_amount_lamports: FEE_LAMPORTS,
        fee_amount_sol: FEE_SOL,
      }),
    });

    j = await r.json().catch(() => ({}));

    if (!r.ok || !j?.success || !j?.session_id) {
      throw new Error(j?.error || `SESSION_START_FAILED (${r.status})`);
    }

    const sid = String(j.session_id);
    setSessionId(sid);
    return sid;
  }
  
  const handleClaim = async () => {
    if (phaseLoading) {
      setMessage('⏳ Phase is still loading. Please try again in a second.');
      return;
    }
  
    if (!effectivePhaseId) {
      setMessage('❌ No finalized phase found. Claims are not ready yet.');
      return;
    }
  
    if (!publicKey) {
      setMessage('❌ Please connect your wallet.');
      return;
    }
  
    const amt = Number(claimAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setMessage('❌ Please enter a valid claim amount.');
      return;
    }
  
    if (amt > selectedClaimable) {
      setMessage('❌ Claim amount exceeds selected phase balance.');
      return;
    }
  
    const destination = useAltAddress ? altAddress.trim() : publicKey.toBase58();
    if (!destination) {
      setMessage('❌ Please provide a destination address.');
      return;
    }
  
    try {
      // validate destination pubkey
      // eslint-disable-next-line no-new
      new PublicKey(destination);
    } catch {
      setMessage('❌ Destination address is not a valid Solana wallet.');
      return;
    }
  
    setIsClaiming(true);
    setMessage(null);
  
    try {
      const walletBase58 = publicKey.toBase58();
  
      // 1) Ensure session (auto fee if needed)
      const sid = await ensureOpenSession(walletBase58, destination);

      const idemKey =
        (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
          ? crypto.randomUUID()
          : `claim_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
      // 2) Execute claim (server-side MEGY transfer + DB record)
      const execRes = await fetch('/api/claim/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          session_id: sid,
          wallet_address: walletBase58,
          destination,
          phase_id: effectivePhaseId,
          claim_amount: claimAmount,
          idempotency_key: idemKey,
        }),
      });
  
      const execJson: any = await execRes.json().catch(() => ({}));
  
      if (!execRes.ok || !execJson?.success) {
        setMessage(`❌ ${execJson?.error || `CLAIM_EXECUTE_FAILED (${execRes.status})`}`);
        return;
      }
  
      setMessage(`✅ Claim sent! Tx: ${execJson.tx_signature}`);
  
      // ✅ Optional: if backend closes session (only if execute returns it)
      if (execJson?.session_closed === true) {
        setSessionId(null);
      }
  
      // 3) Refresh profile
      const refreshed = await fetch(`/api/claim/${walletBase58}`, { cache: 'no-store' });
      const refreshedJson: any = await refreshed.json().catch(() => ({}));
      if (refreshed.ok && refreshedJson?.success) {
        setData(refreshedJson.data);
      }
    } catch (err: any) {
      console.error('Claim request failed:', err);
      setMessage(`❌ ${String(err?.message ?? 'Internal error')}`);
    } finally {
      setIsClaiming(false);
    }
  };  

  if (process.env.NODE_ENV !== 'production') {
    console.log('[ClaimPanel] phase', {
      phaseId,
      selectedPhaseId,
      effectivePhaseId,
      selectedClaimable,
      finalizedByPhaseLen: Array.isArray(finalizedClaim?.finalized_by_phase)
        ? finalizedClaim.finalized_by_phase.length
        : 0,
    });
  }  

  const isClaimAmountEmpty = claimAmount.trim() === '';

  const claimDisabled =
    !effectivePhaseId ||
    phaseLoading ||
    isClaiming ||
    !claimOpen ||
    selectedClaimable <= 0 ||
    isClaimAmountEmpty ||
    Number(claimAmount) > selectedClaimable;

  const claimButtonLabel = phaseLoading
    ? '⏳ Loading phase...'
    : !effectivePhaseId
      ? '❌ No finalized phase'
      : isClaiming
        ? '🚀 Claiming...'
        : selectedClaimable <= 0
          ? '✅ Nothing to claim'
          : `🎉 Claim from Phase #${effectivePhaseId}`;

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
                const url = buildReferralUrl(data.referral_code ?? '');
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

          {/* 🌍 Current Phase Progress */}
          <div className="mb-6">
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wide">Current Phase</p>
                  <p className="text-white font-semibold">
                    {phasesLoading ? 'Loading…' : currentPhase ? `Phase #${currentPhase.phase_no} — ${currentPhase.name || ''}` : 'No phase'}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    {currentPhase?.finalized_at ? (
                      <span className="px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-200">
                        ✅ finalized
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300">
                        live
                      </span>
                    )}
                    {currentPhase?.snapshot_taken_at && (
                      <span className="px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-200">
                        snapshot taken
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-gray-400 text-xs">Fill</p>
                  <p className="text-white font-semibold">
                    {(() => {
                      const fill = Number(currentPhase?.fill_pct ?? 0);
                      if (!Number.isFinite(fill)) return '0%';
                      return `${(fill * 100).toFixed(fill >= 1 ? 0 : 1)}%`;
                    })()}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3">
                {(() => {
                  const fill = Number(currentPhase?.fill_pct ?? 0);
                  const pct = Number.isFinite(fill) ? Math.max(0, Math.min(fill, 1)) : 0;
                  return (
                    <div className="w-full h-3 bg-zinc-900 border border-zinc-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-lime-400"
                        style={{ width: `${pct * 100}%` }}
                      />
                    </div>
                  );
                })()}
                <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                  <span>
                    Used: ${Number(currentPhase?.used_usd ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                  <span>
                    Cap: ${Number(currentPhase?.target_usd ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Overfill note */}
                {Number(currentPhase?.fill_pct ?? 0) > 1 && (
                  <div className="mt-2 text-xs text-yellow-300">
                    ⚠️ Phase is overfilled (Used exceeded Cap). This can happen when the last contribution crosses the target.
                  </div>
                )}
              </div>
            </div>
          </div>

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

          {finalizedClaim && (Number(finalizedClaim.finalized_megy_total ?? 0) > 0 ||
            (Array.isArray(finalizedClaim.finalized_by_phase) && finalizedClaim.finalized_by_phase.length > 0)) && (

            <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-sm">
              <p className="text-gray-400 mb-2">📌 Finalized Snapshot</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <p className="text-gray-400 text-xs">Finalized</p>
                  <p className="font-semibold">{Number(finalizedClaim.finalized_megy_total || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Claimed</p>
                  <p className="font-semibold">{Number(finalizedClaim.claimed_megy_total || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Claimable</p>
                  <p className="font-semibold text-purple-300">{Number(finalizedClaim.claimable_megy_total || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}

          {Array.isArray(finalizedClaim?.finalized_by_phase) && finalizedClaim.finalized_by_phase.length > 0 && (() => {
            const phases = finalizedClaim.finalized_by_phase
              .slice()
              .map((p: any) => ({
                pid: Number(p?.phase_id ?? p?.phaseId ?? 0),
                created: p?.created_at ?? p?.snapshot_taken_at ?? p?.createdAt ?? null,
                claimable: Number(p?.claimable_megy ?? p?.claimable ?? p?.claimableMegy ?? 0),
              }))
              .filter((x: any) => Number.isFinite(x.pid) && x.pid > 0)
              .sort((a: any, b: any) => b.pid - a.pid);

              const options: number[] = Array.from(new Set(phases.map((x: any) => x.pid)));

            const activePid =
              (selectedPhaseId != null && options.includes(selectedPhaseId))
                ? selectedPhaseId
                : (options[0] ?? null);

            const active = phases.find((x: any) => x.pid === activePid) ?? null;
            const ordered =
              activePid
                ? [
                    ...phases.filter((x: any) => x.pid === activePid),
                    ...phases.filter((x: any) => x.pid !== activePid),
                  ]
                : phases;

            return (
              <div className="mt-4 bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-gray-400">🗂 Snapshot History</p>

                  <div className="w-full sm:w-auto flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="text-xs text-gray-400 shrink-0">Select phase</span>

                    <select
                      value={activePid ? String(activePid) : ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const v = Number(raw);
                        setSelectedPhaseId(raw === '' ? null : (Number.isFinite(v) ? v : null));
                      }}
                      disabled={options.length === 0}
                      className="w-full sm:w-44 bg-zinc-900 border border-zinc-600 text-white text-xs rounded-md px-2 py-2 sm:py-1 disabled:opacity-50"
                    >
                      <option value="">Latest</option>
                      {options.map((pid) => (
                        <option key={pid} value={String(pid)}>
                          Phase #{pid}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Full list */}
                <div className="space-y-2">
                  {ordered.map((p: any) => {
                    const isSelected = activePid != null && p.pid === activePid;

                    return (
                      <div
                        key={p.pid}
                        className={[
                          "rounded-lg border px-3 py-2 flex items-center justify-between gap-3 transition",
                          isSelected
                            ? "border-emerald-400/40 bg-emerald-400/10 shadow-[0_0_0_1px_rgba(52,211,153,0.25)]"
                            : "border-zinc-700 bg-zinc-900/20 hover:bg-zinc-800/40",
                        ].join(" ")}
                      >
                        <div className="text-gray-300">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-semibold">Phase #{p.pid}</span>

                            {isSelected && (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                                🟢 Selected
                              </span>
                            )}
                          </div>

                          {p.created ? (
                            <div className="text-xs text-gray-500">{formatDate(String(p.created))}</div>
                          ) : null}
                        </div>

                        <div className="text-right">
                          <div className="text-xs text-gray-400 flex items-center justify-end gap-1">
                            Claimable
                            {isSelected && (
                              <span
                                className="ml-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-gray-300 border border-white/10"
                                title="This claimable value belongs to the selected finalized snapshot phase."
                              >
                                info
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-purple-300">
                            {Math.floor(p.claimable).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div className="flex items-center justify-center gap-2 text-xs mb-3">
            <span className="text-gray-400">Finalized phase</span>
            {phaseLoading ? (
              <span className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-gray-300">Loading…</span>
            ) : phaseId ? (
              <span className="px-2 py-1 rounded bg-emerald-900/30 border border-emerald-700 text-emerald-200 font-semibold">
                #{phaseId}
              </span>
            ) : (
              <span className="px-2 py-1 rounded bg-red-900/30 border border-red-700 text-red-200 font-semibold">
                None
              </span>
            )}
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 mb-4">
            <p className="text-sm text-gray-400 mb-3 text-center">🎯 Claimable $MEGY</p>

            {/* Big number stays: total claimable (all phases) */}
            <p className="text-2xl font-extrabold text-purple-400 text-center">
              {claimableMegy.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>

            {/* Breakdown */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-zinc-900/40 border border-zinc-700 rounded-lg p-3">
                <p className="text-xs text-gray-400">Total claimable (all phases)</p>
                <p className="font-semibold text-white">
                  {Math.floor(Number(finalizedClaim?.claimable_megy_total ?? 0)).toLocaleString()}
                </p>
              </div>

              <div className="bg-zinc-900/40 border border-zinc-700 rounded-lg p-3">
                <p className="text-xs text-gray-400">
                  Selected phase claimable{effectivePhaseId ? ` (Phase #${effectivePhaseId})` : ''}
                </p>
                <p className="font-semibold text-white">
                  {Math.floor(Number(selectedClaimable ?? 0)).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Footnote */}
            <p className="text-xs text-gray-400 italic mt-3 text-center">
              {claimableFromFinalized != null
                ? ((Array.isArray(finalizedClaim?.finalized_by_phase) && finalizedClaim.finalized_by_phase.length > 1)
                    ? '✅ This amount is finalized from snapshots (all finalized phases).'
                    : '✅ This amount is finalized from the latest snapshot.')
                : '⚠️ This amount is estimated. Final value will be locked at the end of Coincarnation.'}
            </p>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-4 sm:px-4 sm:py-5 space-y-4">
            <p className="text-sm font-medium text-gray-300">Claim To Address</p>

            {/* 💸 Claim fee info */}
            <div className="bg-zinc-900/60 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-gray-400 leading-relaxed">
              <p>
                💸 <span className="text-white font-medium">First claim in a session</span> requires a
                <span className="text-purple-300 font-semibold"> ~0.002 SOL fee</span> (paid in SOL).
              </p>
              <p className="mt-1">
                ✅ Next claims in the <span className="text-white font-medium">same session</span> are free.
              </p>
            </div>

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
                <div className="text-xs text-gray-400 text-center -mt-1">
                  Claiming is <span className="text-white/80 font-semibold">per-phase</span>.{' '}
                  Selected:{' '}
                  <span className="text-purple-300 font-semibold">
                    {Math.floor(selectedClaimable).toLocaleString()}
                  </span>{' '}
                  — Total:{' '}
                  <span className="text-purple-300 font-semibold">
                    {Math.floor(Number(finalizedClaim?.claimable_megy_total ?? 0)).toLocaleString()}
                  </span>
                </div>

                {selectedClaimable > 0 && (
                  <div className="space-y-2">
                    {/* Quick buttons */}
                    <div className="flex items-center justify-between gap-2 text-xs text-gray-300 font-medium">
                      <button
                        type="button"
                        className="bg-zinc-700 px-2 py-1 rounded hover:bg-zinc-600 transition"
                        onClick={() => setClaimAmount(String(Math.floor(selectedClaimable * 0.25)))}
                      >
                        %25
                      </button>

                      <button
                        type="button"
                        className="bg-zinc-700 px-2 py-1 rounded hover:bg-zinc-600 transition"
                        onClick={() => setClaimAmount(String(Math.floor(selectedClaimable * 0.5)))}
                      >
                        %50
                      </button>

                      <button
                        type="button"
                        className="bg-zinc-700 px-2 py-1 rounded hover:bg-zinc-600 transition"
                        onClick={() => setClaimAmount(String(Math.floor(selectedClaimable)))}
                      >
                        %100
                      </button>
                    </div>

                    {/* Amount input */}
                    <input
                      type="text"
                      inputMode="numeric"
                      value={claimAmount}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d]/g, '');
                        setClaimAmount(v);
                      }}
                      placeholder="Enter amount to claim"
                      className="w-full bg-zinc-900 border border-zinc-600 p-2 rounded-md text-sm text-white"
                    />

                    {/* Helper text */}
                    {isClaimAmountEmpty && (
                      <p className="text-xs text-yellow-400 text-center">
                        ⚠️ Enter an amount to claim
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {(() => {
              const finalizedTotal = Number(finalizedClaim?.finalized_megy_total ?? 0);
              const claimedTotal = Number(finalizedClaim?.claimed_megy_total ?? 0);

              const fullyClaimed = finalizedTotal > 0 && claimedTotal >= finalizedTotal;
              const partiallyClaimed = claimedTotal > 0 && !fullyClaimed;

              if (fullyClaimed) {
                return <p className="text-green-400 font-semibold text-center mt-4">✅ Fully claimed</p>;
              }
              if (partiallyClaimed) {
                return (
                  <p className="text-yellow-300 font-semibold text-center mt-4">
                    🟡 Partially claimed ({Math.floor(claimedTotal).toLocaleString()} claimed)
                  </p>
                );
              }
              return null;
            })()}

            {claimOpen ? (
              <>
                {effectivePhaseId && selectedClaimable <= 0 && (
                  <p className="text-center text-xs text-yellow-300 mb-2">
                    ⚠️ No claimable balance found for the selected phase. Please select another finalized phase.
                  </p>
                )}

                <div className="relative group">
                  <button
                    onClick={handleClaim}
                    disabled={claimDisabled}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-500 hover:scale-105 transition-all text-white font-bold py-3 rounded-xl disabled:opacity-50"
                  >
                    {claimButtonLabel}
                  </button>

                  {/* Tooltip */}
                  {claimOpen && effectivePhaseId && selectedClaimable > 0 && (
                    <div
                      className={[
                        "pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full",
                        "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
                        "px-3 py-2 rounded-lg text-xs",
                        "bg-zinc-900 border border-zinc-700 text-gray-200 shadow-lg",
                        "whitespace-nowrap",
                      ].join(" ")}
                    >
                      You can claim up to{" "}
                      <span className="text-purple-300 font-semibold">
                        {Math.floor(selectedClaimable).toLocaleString()}
                      </span>{" "}
                      MEGY in this phase.
                    </div>
                  )}
                </div>
              </>
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
                        {formatUsdValue(tx.usd_value)}
                      </td>
                      <td className="px-4 py-2">
                        {tx.timestamp ? formatDate(tx.timestamp) : 'N/A'}
                      </td>
                      <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => {
                          const url = buildReferralUrl(data.referral_code ?? '');

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

                          // 🔹 Anchor: her işlem + cüzdan için tekil bir anahtar
                          const wallet = data.wallet_address || publicKey?.toBase58() || 'unknown';
                          const anchor =
                            rawTxId
                              ? `contribution:${wallet}:${rawTxId}`
                              : `contribution:${wallet}:idx-${index}`;

                          // ✅ CP kuralı:
                          //    - Aynı tx için X (twitter) ve Copy (copy) ayrı ayrı 1 kez CP alabilir.
                          //    - İlk paylaşım CoincarnationResult ekranından yapılmış olsa bile,
                          //      Contribution History'den Copy share için hala 1 kez CP hakkı vardır.
                          setShareTxId(rawTxId);
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
                        if (!data.referral_code) return;
                        const url = buildReferralUrl(data.referral_code ?? '');
                        navigator.clipboard.writeText(url);
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

                        const url = buildReferralUrl(data.referral_code ?? '');

                        const payload = buildPayload(
                          'profile',
                          { url },
                          {
                            ref: data.referral_code ?? undefined, // share/record için anchor bilgisi
                            src: 'app',                           // kanal: app
                            // ctx otomatik 'profile'
                          },
                        );

                        setSharePayload(payload);
                        setShareContext('profile');

                        // 🔹 Referral share CP kuralı:
                        //    - Her wallet için 1 kez: profile:<wallet>
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
                      ? `Each new wallet you bring currently grants ~${Math.round(
                          cpConfig.refSignup * cpConfig.multReferral
                        )} signup CorePoints.`
                      : `${data.referral_count} wallet joined with your link; each signup adds fixed CorePoints.`
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

function formatUsdValue(raw: any): string {
  const n = typeof raw === 'number' ? raw : Number(raw ?? 0);
  if (!Number.isFinite(n)) return '$0.00';

  const abs = Math.abs(n);

  // Çok küçük ama sıfır olmayan değerler için daha detaylı gösterim
  if (abs > 0 && abs < 0.01) {
    // 6 hane, sondaki gereksiz sıfırları temizle
    const precise = abs.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    const sign = n < 0 ? '-' : '';
    return `${sign}$${precise}`;
  }

  // Normal durum: 2 ondalık
  return `$${n.toFixed(2)}`;
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