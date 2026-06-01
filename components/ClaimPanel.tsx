// components/ClaimPanel.tsx

'use client';

import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useEffect, useRef, useState } from 'react';
import AppWalletBar from '@/components/AppWalletBar';
import { motion } from 'framer-motion';
import CorePointChart from './CorePointChart';
import Leaderboard from './Leaderboard';
import { buildReferralUrl } from '@/app/lib/origin';
import type { SharePayload } from '@/components/share/intent';
import ShareCenter from '@/components/share/ShareCenter';
import { buildPayload } from '@/components/share/intent';
import { toNum, toPct01 } from '@/app/lib/num';
import {
  ArrowUpRight,
  Copy,
  Coins,
  Megaphone,
  Share2,
  Skull,
} from 'lucide-react';
import {
  PublicKey,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';
import {
  createIdentityLinkCode,
  getUserIdentityStatus,
  linkWalletToCurrentIdentity,
  linkWalletWithIdentityCode,
  signInWithWalletIdentity,
  type UserIdentityStatus,
} from '@/lib/identity/userIdentityAuth';
import { recordIdentityFingerprint } from '@/lib/identity/fingerprint';

type LinkedIdentityWallet = {
  walletAddress: string;
  chain: string;
  isPrimary: boolean;
  verifiedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string | null;
};

type ProtectedActionIssue = {
  tone: 'yellow' | 'red' | 'cyan';
  title: string;
  description: string;
  action?: 'signIn' | 'verifyNew' | 'verifyBrowser' | 'linkWallet';
};

const TREASURY_PUBKEY = new PublicKey(
  process.env.NEXT_PUBLIC_CLAIM_FEE_TREASURY ??
    'D7iqkQmY3ryNFtc9qseUv6kPeVjxsSD98hKN5q3rkYTd'
);

const ESTIMATE_POLL_MS = 30_000;
const PHASE_POLL_MS = 60_000;

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

const MEGY_DECIMALS = 9;

function formatMegyAmount(value: unknown, decimals = 3): string {
  const n = Number(value ?? 0);

  if (!Number.isFinite(n) || n <= 0) return '0';

  const minVisible = 1 / 10 ** decimals;

  if (n > 0 && n < minVisible) {
    return `<${minVisible.toLocaleString('en-US', {
      maximumFractionDigits: decimals,
    })}`;
  }

  return n.toLocaleString('en-US', {
    maximumFractionDigits: decimals,
  });
}

function normalizeClaimInput(rawValue: string, max: number): string {
  const cleaned = rawValue
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1');

  const [whole = '', decimal = ''] = cleaned.split('.');
  const normalized =
    cleaned.includes('.')
      ? `${whole}.${decimal.slice(0, MEGY_DECIMALS)}`
      : whole;

  const numeric = Number(normalized || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';

  const capped = Math.min(numeric, Math.max(0, max));

  return capped > 0
    ? String(Number(capped.toFixed(MEGY_DECIMALS)))
    : '';
}

function getRefundUiState(tx: any): {
  badge: string | null;
  showRefundButton: boolean;
  buttonLabel: string;
} {
  if (!tx?.blacklisted) {
    return {
      badge: null,
      showRefundButton: false,
      buttonLabel: 'Request Refund',
    };
  }

  if (tx.refund_status === 'refunded') {
    return {
      badge: 'Refunded',
      showRefundButton: false,
      buttonLabel: 'Refunded',
    };
  }

  if (tx.refund_status === 'requested' && tx.refund_fee_paid) {
    return {
      badge: 'Refund Requested',
      showRefundButton: false,
      buttonLabel: 'Refund Requested',
    };
  }

  if (tx.refund_status === 'requested' && !tx.refund_fee_paid) {
    return {
      badge: 'Complete Refund Request',
      showRefundButton: true,
      buttonLabel: 'Complete Refund Request',
    };
  }

  return {
    badge: 'Refund Available',
    showRefundButton: true,
    buttonLabel: 'Request Refund',
  };
}

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
  const { publicKey, sendTransaction, signMessage, wallet } = useWallet();
  const { connection } = useConnection();

  const [cpConfig, setCpConfig] = useState<CpConfig | null>(null);
  const [data, setData] = useState<any>(null);
  const [claimScope, setClaimScope] = useState<'wallet' | 'identity'>('wallet');
  const [claimScopeMeta, setClaimScopeMeta] = useState<{
    scope: 'wallet' | 'identity';
    claimWalletsCount: number;
    isIdentityClaimScope: boolean;
  }>({
    scope: 'wallet',
    claimWalletsCount: 1,
    isIdentityClaimScope: false,
  });
  const [claimAmount, setClaimAmount] = useState<string>('');
  const [selectedClaimPercent, setSelectedClaimPercent] = useState<25 | 50 | 100 | null>(null);
  const [loading, setLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [useAltAddress, setUseAltAddress] = useState(false);
  const [altAddress, setAltAddress] = useState('');
  const [phaseId, setPhaseId] = useState<number | null>(null);
  const [phaseLoading, setPhaseLoading] = useState<boolean>(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [claimFeeSigForSupport, setClaimFeeSigForSupport] = useState<string | null>(null);
  const [refundFeeSigForSupport, setRefundFeeSigForSupport] = useState<string | null>(null);
  const [identityStatus, setIdentityStatus] = useState<UserIdentityStatus>({
    authenticated: false,
    identity: null,
  });
  const [linkedWallets, setLinkedWallets] = useState<LinkedIdentityWallet[]>([]);
  const [verifyingIdentity, setVerifyingIdentity] = useState(false);
  const [identityLinkCode, setIdentityLinkCode] = useState<string | null>(null);
  const [identityLinkCodeExpiresAt, setIdentityLinkCodeExpiresAt] = useState<string | null>(null);
  const [identityLinkCodeInput, setIdentityLinkCodeInput] = useState('');
  const [identityLinkingByCode, setIdentityLinkingByCode] = useState(false);
  const [identityCodeCreating, setIdentityCodeCreating] = useState(false);
  const [walletHasNoLinkedIdentity, setWalletHasNoLinkedIdentity] = useState(false);
  const [identityLinkMessage, setIdentityLinkMessage] = useState<string | null>(null);
  const [identityCodeCopied, setIdentityCodeCopied] = useState(false);
  const [showIdentityTools, setShowIdentityTools] = useState(false);
  const [showAllLinkedWallets, setShowAllLinkedWallets] = useState(false);
  const [copiedLinkedWallet, setCopiedLinkedWallet] = useState<string | null>(null);

  const [globalStats, setGlobalStats] = useState({ totalUsd: 0, totalParticipants: 0 });
  const [copiedTarget, setCopiedTarget] = useState<'wallet' | 'referral' | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [shareContext, setShareContext] = useState<'profile'|'contribution'|'leaderboard'|'success'>('profile');
  const [shareTxId, setShareTxId] = useState<string|undefined>(undefined);
  const [cpHistory, setCpHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);
  const [ledgerFilter, setLedgerFilter] = useState<
    'all' | 'contributions' | 'referrals' | 'shares' | 'deadcoins'
  >('all');
  const [shareAnchor, setShareAnchor] = useState<string | undefined>(undefined);
  const [refundingContributionId, setRefundingContributionId] = useState<number | null>(null);
  const [refundErrors, setRefundErrors] = useState<Record<number, string>>({});
  const [refundFeeStep, setRefundFeeStep] = useState<
    'idle' | 'paying' | 'confirming' | 'paid' | 'signing' | 'submitting' | 'submitted'
  >('idle');
  const [refundFeeConfirmOpen, setRefundFeeConfirmOpen] = useState(false);
  const [pendingRefund, setPendingRefund] = useState<{
    invalidationId?: number;
    contributionId: number;
    mint: string;
    tokenSymbol?: string;
    refundFeeLamports: number;
    refundFeeSol: number;
    treasuryWallet: string;
  } | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null);
  const [currentPhase, setCurrentPhase] = useState<any | null>(null);
  const [phasesLoading, setPhasesLoading] = useState<boolean>(true);
  const attemptIdemKeyRef = useRef<string | null>(null);
  const [activeEstimate, setActiveEstimate] = useState<any>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [feeConfirmOpen, setFeeConfirmOpen] = useState(false);
  const [pendingClaim, setPendingClaim] = useState<{
    wallet: string;
    destination: string;
    phaseId: number;
    claimAmountRaw: string;
    idemKey: string;
  } | null>(null);

  const FEE_SOL = 0.003;
  const FEE_LAMPORTS = Math.round(FEE_SOL * 1_000_000_000);
  const walletBase58 = publicKey?.toBase58() ?? null;
  const activeWalletLinked = Boolean(
    walletBase58 &&
      linkedWallets.some(
        (item) =>
          item.chain === 'solana' &&
          item.walletAddress.toLowerCase() === walletBase58.toLowerCase()
      )
  );
  const [refundDebug, setRefundDebug] = useState<any>(null);

  async function fetchLinkedIdentityWallets() {
    try {
      const res = await fetch('/api/auth/wallets', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
  
      const json = await res.json().catch(() => ({}));
  
      if (!res.ok || !json?.ok || !Array.isArray(json.wallets)) {
        setLinkedWallets([]);
        return;
      }
  
      setLinkedWallets(json.wallets);
    } catch {
      setLinkedWallets([]);
    }
  }
  
  useEffect(() => {
    let alive = true;
  
    const fetchData = async () => {
      if (!publicKey) return;
      setLoading(true);
      try {
        const [claimStatusRes, userRes, globalRes] = await Promise.all([
          fetch('/api/admin/config/claim_open'),
          fetch(
            `/api/claim/${publicKey.toBase58()}${
              claimScope === 'identity' ? '?scope=identity' : ''
            }`
          ),
          fetch('/api/coincarnation/stats'),
        ]);
  
        const [claimStatus, userData, globalData] = await Promise.all([
          claimStatusRes.json().catch(() => ({})),
          userRes.json().catch(() => ({})),
          globalRes.json().catch(() => ({})),
        ]);
  
        if (!alive) return;
  
        setClaimOpen(asBool(claimStatus?.value));
  
        if (userData?.success) {
          setData(userData.data);
        
          setClaimScopeMeta({
            scope: userData.scope === 'identity' ? 'identity' : 'wallet',
            claimWalletsCount: Number(userData.claim_wallets_count ?? 1),
            isIdentityClaimScope: Boolean(userData.is_identity_claim_scope),
          });
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
            totalUsd: toNum(globalData.totalUsd, 0),
            totalParticipants: toNum(globalData.totalParticipants, 0),
          });
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
  }, [publicKey, claimScope]);

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
    if (!walletBase58) {
      setActiveEstimate(null);
      return;
    }
  
    let alive = true;
  
    const fetchEstimate = async () => {
      if (document.visibilityState !== 'visible') return;
  
      try {
        setEstimateLoading(true);
  
        const r = await fetch(
          `/api/phases/active/estimate?wallet=${encodeURIComponent(walletBase58)}`,
          { cache: 'no-store' }
        );
  
        const j = await r.json().catch(() => ({}));
  
        if (!alive) return;
  
        if (j?.success && j?.active) setActiveEstimate(j);
        else setActiveEstimate(null);
      } catch {
        if (!alive) return;
        setActiveEstimate(null);
      } finally {
        if (!alive) return;
        setEstimateLoading(false);
      }
    };
  
    fetchEstimate();
  
    const onFocus = () => fetchEstimate();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchEstimate();
      }
    };
  
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
  
    const interval = window.setInterval(fetchEstimate, ESTIMATE_POLL_MS);
  
    return () => {
      alive = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(interval);
    };
  }, [walletBase58]);

  useEffect(() => {
    let alive = true;
  
    const fetchCurrentPhase = async () => {
      if (document.visibilityState !== 'visible') return;
  
      try {
        setPhasesLoading(true);
  
        const r = await fetch('/api/phases/list', { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
  
        if (!alive) return;
  
        const list = Array.isArray(j?.phases) ? j.phases : [];
        const activeId = Number(j?.current_active_phase_id ?? 0);
        const activeNo = Number(j?.current_active_phase_no ?? 0);
  
        const norm = (s: any) => String(s ?? '').toLowerCase().trim();
  
        const byId =
          Number.isFinite(activeId) && activeId > 0
            ? list.find((p: any) => Number(p.phase_id) === activeId || Number(p.id) === activeId)
            : null;
  
        if (byId) {
          setCurrentPhase(byId);
          return;
        }
  
        const byNo =
          Number.isFinite(activeNo) && activeNo > 0
            ? list.find((p: any) => Number(p.phase_no) === activeNo)
            : null;
  
        if (byNo) {
          setCurrentPhase(byNo);
          return;
        }
  
        const active = list.find((p: any) => norm(p.status) === 'active' && !p.snapshot_taken_at);
        if (active) {
          setCurrentPhase(active);
          return;
        }
  
        setCurrentPhase(null);
      } catch (e) {
        if (!alive) return;
        console.warn('phases list fetch failed:', e);
        setCurrentPhase(null);
      } finally {
        if (!alive) return;
        setPhasesLoading(false);
      }
    };
  
    fetchCurrentPhase();
  
    const onFocus = () => fetchCurrentPhase();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchCurrentPhase();
      }
    };
  
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
  
    const interval = window.setInterval(fetchCurrentPhase, PHASE_POLL_MS);
  
    return () => {
      alive = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(interval);
    };
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
  }, [publicKey, claimScope]);

  useEffect(() => {
    setWalletHasNoLinkedIdentity(false);
  }, [walletBase58]);

  useEffect(() => {
    let alive = true;

    async function fetchIdentityStatus() {
      try {
        if (!walletBase58) {
          await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
          }).catch(() => null);

          if (!alive) return;

          setIdentityStatus({
            authenticated: false,
            identity: null,
          });

          setLinkedWallets([]);
          return;
        }

        const recoverRes = await fetch('/api/auth/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          cache: 'no-store',
          body: JSON.stringify({
            walletAddress: walletBase58,
          }),
        });

        const recoveredStatus = await recoverRes.json().catch(() => null);

        if (!alive) return;

        if (recoverRes.ok && recoveredStatus?.authenticated && recoveredStatus?.identity) {
          setIdentityStatus({
            authenticated: true,
            identity: recoveredStatus.identity,
          });

          await fetchLinkedIdentityWallets();
          return;
        }

        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
        }).catch(() => null);

        if (!alive) return;

        setIdentityStatus({
          authenticated: false,
          identity: null,
        });

        setLinkedWallets([]);
      } catch {
        if (!alive) return;

        setIdentityStatus({
          authenticated: false,
          identity: null,
        });

        setLinkedWallets([]);
      }
    }

    void fetchIdentityStatus();

    return () => {
      alive = false;
    };
  }, [walletBase58]);

  useEffect(() => {
    attemptIdemKeyRef.current = null;
  }, [claimAmount, altAddress, useAltAddress, selectedPhaseId, claimScope]);

  useEffect(() => {
    setClaimAmount('');
    setSelectedClaimPercent(null);
  }, [selectedPhaseId, phaseId, claimScope]);
  
  useEffect(() => {
    (async () => {
      try {
        setPhaseLoading(true);
  
        const r = await fetch('/api/phases/finalized/latest', {
          cache: 'no-store',
        });
  
        const j = await r.json().catch(() => ({}));
        const pid = Number(j?.phase_id);
  
        if (r.ok && j?.success && Number.isFinite(pid) && pid > 0) {
          setPhaseId(pid);
          setSelectedPhaseId(pid);
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
      <div className="bg-zinc-950 min-h-screen py-10 px-4 sm:px-6 md:px-12 lg:px-20 text-white">
        <div className="max-w-6xl w-full mx-auto space-y-6">
          <AppWalletBar />
  
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 shadow-lg">
            <p className="text-center text-yellow-300 font-medium">
              ❌ Please connect your wallet.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  if (loading || data === null) {
    return (
      <div className="bg-zinc-950 min-h-screen py-10 px-4 sm:px-6 md:px-12 lg:px-20 text-white">
        <div className="max-w-6xl w-full mx-auto space-y-6">
          <AppWalletBar />
  
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 shadow-lg">
            <p className="text-center text-blue-400 font-medium">
              ⏳ Loading your claim data...
            </p>
          </div>
        </div>
      </div>
    );
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

  const claimableMegy =
    claimableFromFinalized != null
      ? claimableFromFinalized
      : 0;

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

  const selectedClaimable =
    claimScope === 'identity'
      ? Math.max(
          0,
          Number(finalizedClaim?.claimable_megy_total ?? 0)
        )
      : selectedPhaseRow
        ? Math.max(
            0,
            Number(selectedPhaseRow.claimable_megy ?? 0)
          )
        : 0;

  const effectivePhaseLabel =
  selectedPhaseRow?.phase_name ||
  selectedPhaseRow?.phaseName ||
  (effectivePhaseId ? 'Selected snapshot' : 'No snapshot');

  const selectedScopeLabel =
  selectedPhaseRow?.phase_name ||
  selectedPhaseRow?.phaseName ||
  'Selected snapshot';

  const selectedPhaseSnapshot = Array.isArray(finalizedClaim?.finalized_by_phase)
    ? finalizedClaim.finalized_by_phase.find((p: any) => {
        const pid = Number(p?.phase_id ?? p?.phaseId ?? 0);
        return effectivePhaseId ? pid === Number(effectivePhaseId) : false;
      })
    : null;

  const selectedPhaseTotal =
    Number(selectedPhaseSnapshot?.finalized_megy ?? 0) ||
    Number(selectedPhaseSnapshot?.finalizedMegy ?? 0) ||
    (
      Number(selectedPhaseSnapshot?.claimed_megy ?? selectedPhaseSnapshot?.claimed ?? 0) +
      Number(selectedPhaseSnapshot?.claimable_megy ?? selectedPhaseSnapshot?.claimable ?? selectedClaimable ?? 0)
    );

  const claimExecutionPhaseId =
    claimScope === 'identity' ? 0 : Number(effectivePhaseId ?? 0);

  async function tryStartSessionWithoutFee(wallet: string, destination: string) {
    const r = await fetch('/api/claim/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        wallet_address: wallet,
        destination,
        phase_id: claimExecutionPhaseId,
        claim_scope: claimScope,
      }),
    });

    const j: any = await r.json().catch(() => ({}));
    return { r, j };
  }

  async function handleIdentityLogout() {
    try {
      setMessage('⏳ Signing out identity on this browser...');

      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('IDENTITY_LOGOUT_FAILED');
      }

      setIdentityStatus({
        authenticated: false,
        identity: null,
      });

      setLinkedWallets([]);
      setMessage('✅ Identity signed out on this browser. Your linked wallets remain safe.');
    } catch {
      setMessage('❌ Failed to sign out identity. Please try again.');
    }
  }

  async function handleSignInWithWalletIdentity() {
    try {
      if (!walletBase58) {
        setMessage('❌ Please connect your wallet.');
        return;
      }

      setMessage('⏳ Signing in with your connected wallet...');

      const res = await fetch('/api/auth/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({
          walletAddress: walletBase58,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.authenticated || !json?.identity) {
        setWalletHasNoLinkedIdentity(true);
        setMessage('❌ No linked identity found for this wallet. You can verify it as a new identity or link it with a code.');
        return;
      }

      setIdentityStatus({
        authenticated: true,
        identity: json.identity,
      });
      setWalletHasNoLinkedIdentity(false);

      await fetchLinkedIdentityWallets();

      setMessage('✅ Signed in with your linked wallet.');
    } catch {
      setMessage('❌ Failed to sign in with wallet. Please try again.');
    }
  }

  async function handleVerifyIdentityInline() {
    try {
      if (!publicKey) {
        setMessage('❌ Please connect your wallet.');
        return;
      }
  
      setVerifyingIdentity(true);
      setMessage('⏳ Verifying your Coincarnation Identity...');
  
      await signInWithWalletIdentity({
        publicKey,
        signMessage,
        walletName: wallet?.adapter?.name,
      });
  
      await recordIdentityFingerprint(publicKey.toBase58());
  
      const nextStatus = await getUserIdentityStatus();
      setIdentityStatus(nextStatus);
  
      await fetchLinkedIdentityWallets();
  
      setMessage('✅ Identity verified. You can now perform protected actions.');
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Identity verification failed.';
  
      setMessage(`❌ ${msg}`);
    } finally {
      setVerifyingIdentity(false);
    }
  }

  async function handleCreateIdentityLinkCode() {
    try {
      if (!identityStatus.authenticated || !identityStatus.identity) {
        setIdentityLinkMessage('❌ Please verify your Coincarnation Identity first.');
        return;
      }
  
      setIdentityCodeCreating(true);
      setIdentityLinkMessage('⏳ Creating identity link code...');
  
      const result = await createIdentityLinkCode();
  
      setIdentityLinkCode(result.code);
      setIdentityLinkCodeExpiresAt(result.expiresAt);
      setIdentityLinkMessage('✅ Identity link code created.');
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to create identity link code.';
  
      setIdentityLinkMessage(`❌ ${msg}`);
    } finally {
      setIdentityCodeCreating(false);
    }
  }
  
  async function handleLinkWalletWithCode() {
    try {
      if (!publicKey) {
        setMessage('❌ Please connect your wallet.');
        return;
      }
  
      const code = identityLinkCodeInput.trim();
  
      if (!code) {
        setMessage('❌ Please enter an identity link code.');
        return;
      }
  
      setIdentityLinkingByCode(true);
      setMessage('⏳ Linking wallet with identity code...');
  
      await linkWalletWithIdentityCode({
        publicKey,
        signMessage,
        walletName: wallet?.adapter?.name,
        code,
      });
  
      const nextStatus = await getUserIdentityStatus();
      setIdentityStatus(nextStatus);
  
      await fetchLinkedIdentityWallets();
  
      setIdentityLinkCodeInput('');
      setMessage('✅ Wallet linked with identity code.');
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to link wallet with identity code.';
  
      setMessage(`❌ ${msg}`);
    } finally {
      setIdentityLinkingByCode(false);
    }
  }

  async function handleLinkActiveWalletToIdentity() {
    try {
      if (!publicKey) {
        setMessage('❌ Please connect your wallet.');
        return;
      }
  
      if (!identityStatus.authenticated || !identityStatus.identity) {
        setMessage('❌ Please verify your Coincarnation Identity first.');
        return;
      }
  
      setLoading(true);
      setMessage('⏳ Linking active wallet to your Coincarnation Identity...');
  
      await linkWalletToCurrentIdentity({
        publicKey,
        signMessage,
        walletName: wallet?.adapter?.name,
      });
  
      const nextStatus = await getUserIdentityStatus();
      setIdentityStatus(nextStatus);
  
      await fetchLinkedIdentityWallets();
  
      setMessage('✅ Active wallet linked to your Coincarnation Identity.');
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to link active wallet.';
  
      setMessage(`❌ ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  function setRefundError(contributionId: number, error: string) {
    setRefundErrors((prev) => ({
      ...prev,
      [contributionId]: error,
    }));
  }
  
  function clearRefundError(contributionId: number) {
    setRefundErrors((prev) => {
      const next = { ...prev };
      delete next[contributionId];
      return next;
    });
  }

  function SectionIcon({ children }: { children: React.ReactNode }) {
    return (
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm font-black text-cyan-200 shadow-sm">
        {children}
      </span>
    );
  }

  function getClaimStatusLabel(identity: any, protectedIssue: any) {
    if (!identity) return 'Verification Required';
  
    if (identity.claimReady) return 'Claim Ready';
  
    if (Number(identity.riskScore ?? 0) >= 50) return 'Risk Review';
  
    if (!identity.walletVerified) return 'Wallet Linking Required';
  
    if (!identity.fingerprintRecorded) return 'Verification Required';
  
    if (protectedIssue?.action === 'signIn') return 'Session Expired';
  
    return 'Verification Required';
  }

  async function copyLinkedWallet(walletAddress: string) {
    try {
      await navigator.clipboard.writeText(walletAddress);
  
      setCopiedLinkedWallet(walletAddress);
  
      window.setTimeout(() => {
        setCopiedLinkedWallet(null);
      }, 1600);
    } catch {
      setMessage('❌ Failed to copy wallet address.');
    }
  }

  function getProtectedActionIssue(): ProtectedActionIssue | null {
    if (!walletBase58) return null;
  
    if (!identityStatus.authenticated || !identityStatus.identity) {
      return {
        tone: 'yellow',
        title: 'Identity Session Required',
        description: walletHasNoLinkedIdentity
          ? 'No linked identity was found for this wallet. Verify it as a new Coincarnation Identity, or link it to an existing identity with a code below.'
          : 'This wallet may already be linked to an identity. Sign in with your wallet to recover your Coincarnation Identity session.',
        action: walletHasNoLinkedIdentity ? 'verifyNew' : 'signIn',
      };
    }
  
    if (!activeWalletLinked) {
      return {
        tone: 'yellow',
        title: 'Wallet Not Linked',
        description: 'This wallet is not linked to your active Coincarnation Identity. Link it before using protected actions.',
        action: 'linkWallet',
      };
    }
  
    if (identityStatus.identity.claimReady) return null;
  
    const riskScore = Number(identityStatus.identity.riskScore ?? 0);
    const fingerprintRecorded = Boolean((identityStatus.identity as any).fingerprintRecorded);
  
    if (riskScore >= 50) {
      return {
        tone: 'red',
        title: 'Identity Under Risk Review',
        description:
          'Your identity is active, but protected actions are locked because the current risk score is too high. This can happen after repeated identity tests from the same browser or shared fingerprint signals. Do not create another identity; this identity needs review or risk normalization.',
      };
    }
  
    if (!fingerprintRecorded) {
      return {
        tone: 'yellow',
        title: 'Browser Verification Required',
        description:
          'Your identity exists, but this browser still needs to record its identity fingerprint before protected actions can be unlocked.',
        action: 'verifyBrowser',
      };
    }
  
    return {
      tone: 'yellow',
      title: 'Identity Not Ready Yet',
      description:
        'Your identity is active, but one or more readiness checks are still incomplete. Please refresh the identity status or verify this browser again.',
      action: 'verifyBrowser',
    };
  }

  function ensureProtectedActionReady(
    actionLabel: string,
    messageSetter: (value: string) => void = setMessage
  ) {
    if (!walletBase58) {
      messageSetter('❌ Please connect your wallet.');
      return false;
    }
  
    if (!identityStatus.authenticated || !identityStatus.identity) {
      messageSetter(`❌ Please sign in with your Coincarnation Identity before ${actionLabel}.`);
      return false;
    }
  
    if (!activeWalletLinked) {
      messageSetter('❌ This wallet is not linked to your active Coincarnation Identity.');
      return false;
    }
  
    if (!identityStatus.identity.claimReady) {
      const issue = getProtectedActionIssue();
    
      messageSetter(
        issue?.tone === 'red'
          ? `❌ ${issue.title}: ${issue.description}`
          : `❌ ${issue?.description ?? 'Your Coincarnation Identity is not ready for protected actions.'}`
      );
    
      return false;
    }
  
    return true;
  }
  
  const handleClaim = async () => {
    if (!publicKey) {
      setMessage('❌ Please connect your wallet.');
      return;
    }

    if (!ensureProtectedActionReady('claiming')) {
      return;
    }
    
    if (!claimOpen) {
      setMessage('⚠️ Claiming is currently closed. You will be able to claim when the window opens.');
      return;
    }
    if (phaseLoading) {
      setMessage('⏳ Phase is still loading. Please try again in a second.');
      return;
    }
  
    if (claimScope !== 'identity' && !effectivePhaseId) {
      setMessage('❌ No finalized phase found. Claims are not ready yet.');
      return;
    }
  
    const raw = claimAmount.trim();
    if (!raw) {
      setMessage('❌ Please enter a claim amount.');
      return;
    }

    const amt = Number(raw);
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
    
      // 1) Ensure idempotency key (once per attempt)
      if (!attemptIdemKeyRef.current) {
        attemptIdemKeyRef.current =
          (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
            ? crypto.randomUUID()
            : `claim_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      }
      const idemKey = attemptIdemKeyRef.current;
    
      // 2) Try to start session WITHOUT fee (preflight)
      const { r: preR, j: preJ } = await tryStartSessionWithoutFee(walletBase58, destination);
    
      // ✅ Case A: session exists (no fee needed)
      if (preR.ok && preJ?.success && preJ?.session_id) {
        const sid = String(preJ.session_id);
        setSessionId(sid);
    
        // Execute claim
        const execRes = await fetch('/api/claim/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            session_id: sid,
            wallet_address: walletBase58,
            destination,
            phase_id: claimExecutionPhaseId,
            claim_amount: raw,
            idempotency_key: idemKey,
          }),
        });
    
        const execJson: any = await execRes.json().catch(() => ({}));
    
        if (!execRes.ok || !execJson?.success) {
          const rawErr = String(execJson?.error || `CLAIM_EXECUTE_FAILED (${execRes.status})`);

          if (rawErr === 'SESSION_NOT_FOUND') {
            setSessionId(null);
            setPendingClaim(null);
            attemptIdemKeyRef.current = null;
          }

          setMessage(`❌ ${userFriendlyError(rawErr)}`);
          return;
        }
    
        setClaimFeeSigForSupport(null);

        const isDryRun =
          execJson?.dry_run === true ||
          execJson?.dryRun === true ||
          String(execJson?.dry_run ?? '').trim().toLowerCase() === 'true';

        if (execJson?.deduped && execJson?.status !== 'succeeded') {
          setSessionId(null);
          setPendingClaim(null);
          attemptIdemKeyRef.current = null;
          setMessage('⚠️ Duplicate claim attempt detected. Please try again.');
          return;
        }

        if (isDryRun) {
          setMessage(
            `✅ Dry-run successful. No MEGY transfer was sent. Splits: ${
              Array.isArray(execJson.splits)
                ? execJson.splits
                    .map(
                      (s: any) =>
                        `${s.phase_label || s.phase_name || `Phase ${s.phase_no || s.phase_id}`}: ${s.amount}`
                    )
                    .join(' · ')
                : 'simulation complete'
            }`
          );
        } else if (execJson?.tx_signature) {
          setMessage(`✅ Claim sent! View tx: https://solscan.io/tx/${execJson.tx_signature}`);
        } else if (execJson?.deduped) {
          setMessage('⚠️ Duplicate claim attempt detected. Please try again.');
        } else {
          setMessage('❌ Claim execution failed.');
        }

        setClaimAmount('');
        setSelectedClaimPercent(null);
        setUseAltAddress(false);
        setAltAddress('');
        setPendingClaim(null);
        attemptIdemKeyRef.current = null;

        if (execJson?.session_closed === true) setSessionId(null);
    
        // Refresh profile
        const refreshed = await fetch(
          `/api/claim/${walletBase58}${claimScope === 'identity' ? '?scope=identity' : ''}`,
          { cache: 'no-store' }
        );
        const refreshedJson: any = await refreshed.json().catch(() => ({}));
        if (refreshed.ok && refreshedJson?.success) setData(refreshedJson.data);
    
        return;
      }
    
      // ✅ Case B: backend says fee is required -> open confirm UI
      const err = String(preJ?.error || '');
    
      if (err === 'MISSING_FEE_SIGNATURE') {
        setPendingClaim({
          wallet: walletBase58,
          destination,
          phaseId: claimExecutionPhaseId, // can be 0 when "all phases" enabled
          claimAmountRaw: raw,
          idemKey,
        });
    
        setFeeConfirmOpen(true);
        setMessage(null);
        return;
      }
    
      // ✅ Other error
      throw new Error(err || `SESSION_START_FAILED (${preR.status})`);
    } catch (err: any) {
      console.error('Claim request failed:', err);
      setMessage(`❌ ${userFriendlyError(String(err?.message ?? ''))}`);
    } finally {
      setIsClaiming(false);
    }    
  };

  const handleRequestRefund = async (tx: any) => {
    const contributionId = Number(
      tx?.contribution_id ??
        tx?.contributionId ??
        tx?.id ??
        0
    );
  
    if (Number.isFinite(contributionId) && contributionId > 0) {
      clearRefundError(contributionId);
    }
  
    if (!publicKey) {
      if (Number.isFinite(contributionId) && contributionId > 0) {
        setRefundError(contributionId, '❌ Please connect your wallet.');
      }
  
      setMessage('❌ Please connect your wallet.');
      return;
    }
  
    if (!ensureProtectedActionReady('requesting a refund')) {
      if (Number.isFinite(contributionId) && contributionId > 0) {
        setRefundError(
          contributionId,
          '❌ Please sign in with your Coincarnation Identity before requesting a refund.'
        );
      }
      return;
    }
  
    if (!signMessage) {
      if (Number.isFinite(contributionId) && contributionId > 0) {
        setRefundError(contributionId, '❌ Your wallet does not support message signing.');
      }
  
      setMessage('❌ Your wallet does not support message signing.');
      return;
    }
  
    if (process.env.NODE_ENV !== 'production') {
      console.log('[REFUND] clicked tx:', tx);
    }
  
    const mint = String(
      tx?.token_contract ??
      tx?.mint ??
      tx?.token_mint ??
      ''
    ).trim();
  
    const tokenSymbol = String(
      tx?.token_symbol ??
      tx?.symbol ??
      ''
    ).trim();
  
    const invalidationId =
      Number(
        tx?.invalidation_id ??
        tx?.invalidationId ??
        tx?.refund_id ??
        tx?.refundId ??
        tx?.refund_invalidation_id ??
        0
      ) || undefined;
  
    if (!Number.isFinite(contributionId) || contributionId <= 0 || !mint) {
      console.error('[REFUND] incomplete tx data', {
        contributionId,
        mint,
        tx,
      });
      setMessage('❌ Refund request data is incomplete.');
      return;
    }
  
    try {
      setRefundingContributionId(contributionId);
      setMessage(`⏳ Preparing refund fee request for contribution #${contributionId}...`);
  
      // 1) Prepare refund fee info
      const feePrepRes = await fetch('/api/refunds/fee/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          invalidation_id: invalidationId,
          wallet_address: publicKey.toBase58(),
          contribution_id: contributionId,
          mint,
        }),
      });
  
      const feePrepJson: any = await feePrepRes.json().catch(() => ({}));
  
      if (process.env.NODE_ENV !== 'production') {
        console.log('[REFUND] fee prepare response:', {
          status: feePrepRes.status,
          body: feePrepJson,
        });
      }
  
      if (!feePrepRes.ok || !feePrepJson?.success) {
        throw new Error(String(feePrepJson?.error || `REFUND_FEE_PREPARE_FAILED (${feePrepRes.status})`));
      }
  
      // If fee already paid, proceed directly to signature flow
      if (feePrepJson?.refund_fee_paid === true) {
        setMessage('⏳ Refund fee already paid. Preparing signature challenge...');
  
        const prepRes = await fetch('/api/refunds/request/prepare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            invalidation_id:
              Number(
                feePrepJson?.invalidation_id ??
                invalidationId ??
                0
              ) || undefined,
            wallet_address: publicKey.toBase58(),
            contribution_id: contributionId,
            mint,
          }),
        });
  
        const prepJson: any = await prepRes.json().catch(() => ({}));
  
        if (process.env.NODE_ENV !== 'production') {
          console.log('[REFUND] request prepare response:', {
            status: prepRes.status,
            body: prepJson,
          });
        }
  
        if (!prepRes.ok || !prepJson?.success || !prepJson?.message || !prepJson?.nonce) {
          throw new Error(String(prepJson?.error || `REFUND_PREPARE_FAILED (${prepRes.status})`));
        }
  
        const messageBytes = new TextEncoder().encode(String(prepJson.message));
        const signatureBytes = await signMessage(messageBytes);
        const signatureBase64 = uint8ToBase64(signatureBytes);
  
        const r = await fetch('/api/refunds/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            invalidation_id:
              Number(
                feePrepJson?.invalidation_id ??
                invalidationId ??
                0
              ) || undefined,
            wallet_address: publicKey.toBase58(),
            contribution_id: contributionId,
            mint,
            nonce: prepJson.nonce,
            signature_base64: signatureBase64,
          }),
        });
  
        const j = await r.json().catch(() => ({}));
  
        if (process.env.NODE_ENV !== 'production') {
          console.log('[REFUND] request submit response:', {
            status: r.status,
            body: j,
          });
        }
  
        if (!r.ok || !j?.success) {
          throw new Error(String(j?.error || `REFUND_REQUEST_FAILED (${r.status})`));
        }
  
        setMessage('✅ Refund request signed and recorded successfully.');
  
        const refreshed = await fetch(`/api/claim/${publicKey.toBase58()}`, {
          cache: 'no-store',
          credentials: 'include',
        });
        const refreshedJson: any = await refreshed.json().catch(() => ({}));
        if (refreshed.ok && refreshedJson?.success) {
          setData(refreshedJson.data);
        }
  
        return;
      }
  
      // 2) Open refund fee confirmation modal
      setPendingRefund({
        invalidationId:
          Number(
            feePrepJson.invalidation_id ??
            invalidationId ??
            0
          ) || undefined,
        contributionId,
        mint,
        tokenSymbol: tokenSymbol || undefined,
        refundFeeLamports: Number(feePrepJson.refund_fee_lamports ?? 0),
        refundFeeSol: Number(feePrepJson.refund_fee_sol ?? 0),
        treasuryWallet: String(feePrepJson.treasury_wallet || ''),
      });
  
      setRefundFeeConfirmOpen(true);
      setMessage(null);
    } catch (e: any) {
      console.error('[REFUND] handleRequestRefund failed:', e);
      setMessage(`❌ ${userFriendlyError(String(e?.message ?? 'REFUND_REQUEST_FAILED'))}`);
      setRefundError(
        contributionId,
        `❌ ${userFriendlyError(String(e?.message ?? 'REFUND_REQUEST_FAILED'))}`
      );
    } finally {
      setRefundingContributionId(null);
    }
  };

  const confirmRefundFeeThenRequest = async () => {
    if (!pendingRefund || !publicKey || !signMessage || !sendTransaction || !connection) {
      setMessage('❌ Wallet connection is not ready. Please reconnect and try again.');
      return;
    }
  
    try {
      setRefundDebug(null);
      setRefundFeeStep('paying');
      setRefundingContributionId(pendingRefund.contributionId);
      setMessage(null);
  
      const treasuryPubkey = new PublicKey(pendingRefund.treasuryWallet);
  
      setMessage(
        `💸 Paying refund processing fee (~${pendingRefund.refundFeeSol.toFixed(6)} SOL)... Please confirm in your wallet.`
      );
  
      // 1) Pay refund fee
      const feeTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: treasuryPubkey,
          lamports: pendingRefund.refundFeeLamports,
        })
      );
  
      feeTx.feePayer = publicKey;
  
      const latest = await connection.getLatestBlockhash('confirmed');
      feeTx.recentBlockhash = latest.blockhash;
  
      const feeSig = String(
        await sendTransaction(feeTx, connection, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        } as any)
      );
      setRefundFeeSigForSupport(feeSig);
  
      setRefundFeeStep('confirming');
      setMessage('⏳ Verifying refund fee payment...');
  
      // 2) Confirm fee with backend
      const feeConfirmRes = await fetch('/api/refunds/fee/confirm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invalidation_id: pendingRefund.invalidationId ?? undefined,
          wallet_address: publicKey.toBase58(),
          contribution_id: pendingRefund.contributionId,
          mint: pendingRefund.mint,
          fee_tx_signature: feeSig,
        }),
      });
  
      const feeConfirmJson: any = await feeConfirmRes.json().catch(() => ({}));
  
      if (process.env.NODE_ENV !== 'production') {
        console.log('[REFUND] fee confirm response:', {
          status: feeConfirmRes.status,
          body: feeConfirmJson,
        });
      }
  
      setRefundDebug({
        step: 'fee_confirm',
        status: feeConfirmRes.status,
        body: feeConfirmJson,
      });
  
      if (!feeConfirmRes.ok || !feeConfirmJson?.success) {
        throw new Error(
          String(feeConfirmJson?.error || `REFUND_FEE_CONFIRM_FAILED (${feeConfirmRes.status})`)
        );
      }
  
      setRefundFeeStep('paid');
      setMessage('✅ Refund fee received. Preparing your refund request...');
  
      // 3) Prepare refund request challenge
      const prepRes = await fetch('/api/refunds/request/prepare', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invalidation_id: pendingRefund.invalidationId ?? undefined,
          wallet_address: publicKey.toBase58(),
          contribution_id: pendingRefund.contributionId,
          mint: pendingRefund.mint,
        }),
      });
  
      const prepJson: any = await prepRes.json().catch(() => ({}));
  
      if (process.env.NODE_ENV !== 'production') {
        console.log('[REFUND] request prepare response:', {
          status: prepRes.status,
          body: prepJson,
        });
      }
  
      setRefundDebug({
        step: 'request_prepare',
        status: prepRes.status,
        body: prepJson,
      });
  
      if (!prepRes.ok || !prepJson?.success || !prepJson?.message || !prepJson?.nonce) {
        throw new Error(String(prepJson?.error || `REFUND_PREPARE_FAILED (${prepRes.status})`));
      }
  
      // 4) Sign challenge
      setRefundFeeStep('signing');
      setMessage('✍️ Refund fee received. Please sign the refund request message in your wallet.');
  
      const messageBytes = new TextEncoder().encode(String(prepJson.message));
      const signatureBytes = await signMessage(messageBytes);
      const signatureBase64 = uint8ToBase64(signatureBytes);
  
      setRefundFeeStep('submitting');
      setMessage('📨 Submitting your refund request...');
  
      // 5) Submit refund request
      const r = await fetch('/api/refunds/request', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invalidation_id: pendingRefund.invalidationId ?? undefined,
          wallet_address: publicKey.toBase58(),
          contribution_id: pendingRefund.contributionId,
          mint: pendingRefund.mint,
          nonce: prepJson.nonce,
          signature_base64: signatureBase64,
        }),
      });
  
      const j = await r.json().catch(() => ({}));
  
      if (process.env.NODE_ENV !== 'production') {
        console.log('[REFUND] request submit response:', {
          status: r.status,
          body: j,
        });
      }
  
      setRefundDebug({
        step: 'request_submit',
        status: r.status,
        body: j,
      });
  
      if (!r.ok || !j?.success) {
        throw new Error(String(j?.error || `REFUND_REQUEST_FAILED (${r.status})`));
      }
  
      setRefundFeeStep('submitted');
      setMessage('✅ Refund request signed and recorded successfully.');
      setRefundFeeConfirmOpen(false);
      setPendingRefund(null);
  
      const refreshed = await fetch(`/api/claim/${publicKey.toBase58()}`, {
        cache: 'no-store',
        credentials: 'include',
      });
  
      const refreshedJson: any = await refreshed.json().catch(() => ({}));
      if (refreshed.ok && refreshedJson?.success) {
        setData(refreshedJson.data);
      }
    } catch (e: any) {
      const raw = String(e?.message ?? 'REFUND_REQUEST_FAILED');
      console.error('[REFUND] confirmRefundFeeThenRequest failed:', raw, e);
  
      setRefundDebug((prev: any) => ({
        ...(prev || {}),
        step: 'catch',
        error: raw,
      }));
  
      setRefundFeeStep('idle');
      setMessage(`❌ ${userFriendlyError(raw)}`);
    } finally {
      setRefundingContributionId(null);
    }
  };

  const confirmAndPayFeeThenExecute = async () => {
    if (!pendingClaim) return;
  
    const { wallet, destination, phaseId, claimAmountRaw, idemKey } = pendingClaim;
  
    try {
      setIsClaiming(true);
      setMessage(null);
  
      // Guards
      if (!publicKey) throw new Error('WALLET_NOT_CONNECTED');
      if (!connection) throw new Error('RPC_CONNECTION_MISSING');
      if (!sendTransaction) throw new Error('WALLET_SEND_TX_UNAVAILABLE');
      if (!claimOpen) throw new Error('CLAIM_NOT_OPEN');
  
      // 1) Pay fee on-chain (user wallet -> treasury)
      setMessage(`💸 Paying the ${FEE_SOL} SOL session fee… Please confirm in your wallet.`);
  
      const feeTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: TREASURY_PUBKEY,
          lamports: FEE_LAMPORTS,
        })
      );
      feeTx.feePayer = publicKey;
  
      const latest = await connection.getLatestBlockhash('confirmed');
      feeTx.recentBlockhash = latest.blockhash;
  
      const feeSig = String(
        await sendTransaction(feeTx, connection, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        } as any)
      );
  
      setClaimFeeSigForSupport(feeSig);
      setMessage('⏳ Confirming fee payment on-chain…');
  
      await connection.confirmTransaction(
        {
          signature: feeSig,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        'confirmed'
      );
  
      // 2) Start session WITH fee signature
      setMessage('🧩 Opening your claim session…');
  
      const startRes = await fetch('/api/claim/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          wallet_address: wallet,
          destination,
          phase_id: phaseId,
          claim_scope: claimScope,
          fee_tx_signature: feeSig,
          fee_amount: FEE_LAMPORTS,
        }),
      });
  
      const startJson: any = await startRes.json().catch(() => ({}));
      if (!startRes.ok || !startJson?.success || !startJson?.session_id) {
        const rawErr = String(startJson?.error || `SESSION_START_FAILED (${startRes.status})`);
        throw new Error(rawErr);
      }
  
      const sid = String(startJson.session_id);
      setSessionId(sid);
  
      // 3) Execute claim
      setMessage('🚀 Executing your claim…');
  
      const execRes = await fetch('/api/claim/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          session_id: sid,
          wallet_address: wallet,
          destination,
          phase_id: phaseId,          // 0 => all phases
          claim_amount: claimAmountRaw,
          idempotency_key: idemKey,
        }),
      });
  
      const execJson: any = await execRes.json().catch(() => ({}));
  
      if (!execRes.ok || !execJson?.success) {
        const rawErr = String(execJson?.error || `CLAIM_EXECUTE_FAILED (${execRes.status})`);
        throw new Error(rawErr);
      }
  
      setClaimFeeSigForSupport(null);

      const isDryRun =
        execJson?.dry_run === true ||
        execJson?.dryRun === true ||
        String(execJson?.dry_run ?? '').trim().toLowerCase() === 'true';

      if (execJson?.deduped && execJson?.status !== 'succeeded') {
        setSessionId(null);
        setPendingClaim(null);
        attemptIdemKeyRef.current = null;
        setMessage('⚠️ Duplicate claim attempt detected. Please try again.');
        return;
      }

      if (isDryRun) {
        setMessage(
          `✅ Dry-run successful. No MEGY transfer was sent. Splits: ${
            Array.isArray(execJson.splits)
              ? execJson.splits
                  .map(
                    (s: any) =>
                      `${s.phase_label || s.phase_name || `Phase ${s.phase_no || s.phase_id}`}: ${s.amount}`
                  )
                  .join(' · ')
              : 'simulation complete'
          }`
        );
      } else if (execJson?.tx_signature) {
        setMessage(`✅ Claim sent! View tx: https://solscan.io/tx/${execJson.tx_signature}`);
      } else if (execJson?.deduped) {
        setMessage('⚠️ Duplicate claim attempt detected. Please try again.');
      } else {
        setMessage('❌ Claim execution failed.');
      }

      setClaimAmount('');
      setSelectedClaimPercent(null);
      setUseAltAddress(false);
      setAltAddress('');
      setPendingClaim(null);
      attemptIdemKeyRef.current = null;

      if (execJson?.session_closed === true) setSessionId(null);
  
      // 4) Refresh profile
      const refreshed = await fetch(
        `/api/claim/${wallet}${claimScope === 'identity' ? '?scope=identity' : ''}`,
        { cache: 'no-store' }
      );
      const refreshedJson: any = await refreshed.json().catch(() => ({}));
      if (refreshed.ok && refreshedJson?.success) setData(refreshedJson.data);
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      setMessage(`❌ ${userFriendlyError(msg)}`);
    } finally {
      setIsClaiming(false);
      setFeeConfirmOpen(false);
      setPendingClaim(null);
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

  const claimAmountRaw = claimAmount.trim();
  const isClaimAmountEmpty = claimAmountRaw === '';

  const amtNum = Number(claimAmountRaw);
  const claimAmountInvalid =
    !isClaimAmountEmpty && (!Number.isFinite(amtNum) || amtNum <= 0);

  const claimAmountNumber = Number(claimAmount || 0);

  const claimAmountExceeds =
    Number.isFinite(amtNum) && amtNum > selectedClaimable;

  const altAddressRaw = altAddress.trim();

  let destinationAddressInvalid = false;
  if (useAltAddress && altAddressRaw) {
    try {
      // eslint-disable-next-line no-new
      new PublicKey(altAddressRaw);
    } catch {
      destinationAddressInvalid = true;
    }
  }

  const claimDisabledReason = (() => {
    if (phaseLoading) return 'Loading finalized phase...';
    if (claimScope !== 'identity' && !effectivePhaseId) return 'No finalized phase found yet.';
    if (!claimOpen) return 'Claim window is currently closed.';
    if (isClaiming) return 'Claim is already in progress.';
    if (selectedClaimable <= 0) return 'No claimable balance for the selected snapshot.';
    if (isClaimAmountEmpty) return 'Enter an amount to continue.';
    if (claimAmountInvalid) return 'Enter a valid positive amount.';
    if (claimAmountExceeds) {
      return `Amount exceeds selected snapshot balance. Max: ${formatMegyAmount(selectedClaimable, 6)} MEGY.`;
    }
    if (useAltAddress && !altAddressRaw) return 'Enter destination wallet address.';
    if (destinationAddressInvalid) return 'Destination address is not a valid Solana wallet.';

    return null;
  })();

  const claimDisabled = Boolean(claimDisabledReason);

  const effectivePhaseName =
    selectedPhaseRow?.phase_name ||
    selectedPhaseRow?.phaseName ||
    null;

  const claimButtonLabel = phaseLoading
    ? '⏳ Loading phase...'
    : claimScope !== 'identity' && !effectivePhaseId
      ? '❌ No finalized phase'
      : isClaiming
        ? '🚀 Claiming...'
        : selectedClaimable <= 0
          ? '✅ Nothing to claim'
          : claimScope === 'identity'
            ? '🎉 Claim from All Linked Wallets'
            : `🎉 Claim from ${effectivePhaseName ? String(effectivePhaseName) : String(effectivePhaseLabel)}`;

  const protectedActionIssue = getProtectedActionIssue();

  const protectedActionToneClass =
    protectedActionIssue?.tone === 'red'
      ? 'border-red-400/30 bg-red-400/10 text-red-100'
      : protectedActionIssue?.tone === 'cyan'
        ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100'
        : 'border-yellow-400/30 bg-yellow-400/10 text-yellow-100';

  const supportFeeSig = claimFeeSigForSupport ?? refundFeeSigForSupport;

  const supportFeeSigLabel = claimFeeSigForSupport
    ? 'claim fee tx'
    : refundFeeSigForSupport
      ? 'refund fee tx'
      : 'fee tx';
  
  const filteredCpHistory = [...cpHistory].filter((ev: any) => {
    const type = String(ev?.type || '').toLowerCase();

    if (ledgerFilter === 'all') return true;

    if (ledgerFilter === 'contributions') {
      return type === 'usd' || type === 'usd_blacklist_reversal';
    }

    if (ledgerFilter === 'referrals') {
      return type === 'referral_signup';
    }

    if (ledgerFilter === 'shares') {
      return type === 'share';
    }

    if (ledgerFilter === 'deadcoins') {
      return type === 'deadcoin_first' || type === 'deadcoin_blacklist_reversal';
    }

    return true;
  });
  return (
    <div className="bg-zinc-950 min-h-screen py-10 px-4 sm:px-6 md:px-12 lg:px-20 text-white">
      <div className="max-w-6xl w-full mx-auto space-y-6">

        <AppWalletBar />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="bg-zinc-900 text-white p-6 rounded-2xl w-full border border-zinc-700 shadow-lg space-y-10"
        >
        <div className="flex items-center justify-center gap-3">
          <SectionIcon>PF</SectionIcon>
          <h2 className="text-3xl font-extrabold tracking-tight">
            Coincarnator Profile
          </h2>
        </div>

        <p className="mx-auto max-w-2xl text-center text-sm text-zinc-400">
          Your Coincarnation Identity, claims, contributions, and Personal Value Currency.
        </p>

        {identityStatus.identity && (
          <div className="text-center text-xs text-cyan-400 mb-2">
            Identity #{identityStatus.identity.id.slice(0, 6)} · {identityStatus.identity.linkedWalletCount} linked wallets
          </div>
        )}

        {/* 🧬 Identity Summary */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="w-full bg-zinc-900 border border-cyan-500/30 rounded-xl px-4 py-4 sm:px-6 sm:py-5 mb-5 shadow-md"
        >
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <SectionIcon>ID</SectionIcon>
              <h3 className="text-cyan-300 text-sm font-semibold uppercase tracking-wide">
                Identity Overview
              </h3>
            </div>

            {identityStatus.authenticated ? (
              <button
                type="button"
                onClick={handleIdentityLogout}
                className="self-start rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-white/70 transition hover:bg-white/[0.08] hover:text-white sm:self-auto"
                title="Only signs out this browser. Your linked wallets remain connected to your identity."
              >
                Sign out Identity
              </button>
            ) : walletBase58 ? (
              <button
                type="button"
                onClick={handleSignInWithWalletIdentity}
                className="self-start rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-bold text-cyan-200 transition hover:bg-cyan-400/15 hover:text-white sm:self-auto"
                title="Restore your identity session if this wallet is already linked."
              >
                Sign in with Wallet
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
            <Info
              label="Claim Status"
              value={getClaimStatusLabel(identityStatus.identity, protectedActionIssue)}
            />

            <Info
              label="Linked Wallets"
              value={String(identityStatus.identity?.linkedWalletCount ?? 0)}
            />

            <Info
              label="Human Confidence"
              value={String(identityStatus.identity?.humanConfidenceScore ?? 0)}
            />

            <Info
              label="Risk Score"
              value={String(identityStatus.identity?.riskScore ?? 0)}
            />
          </div>

          {protectedActionIssue && (
            <div className={`mt-5 rounded-xl border p-4 ${protectedActionToneClass}`}>
              <p className="text-sm font-bold">
                🧬 {protectedActionIssue.title}
              </p>

              <p className="mt-2 text-xs leading-5 opacity-85">
                {protectedActionIssue.description}
              </p>

              {protectedActionIssue.action === 'signIn' && (
                <button
                  type="button"
                  onClick={handleSignInWithWalletIdentity}
                  className="mt-3 rounded-full bg-cyan-300 px-4 py-2 text-xs font-black text-black transition hover:bg-cyan-200"
                >
                  Sign in with Wallet
                </button>
              )}

              {protectedActionIssue.action === 'verifyNew' && (
                <button
                  type="button"
                  onClick={handleVerifyIdentityInline}
                  disabled={verifyingIdentity}
                  className="mt-3 rounded-full bg-yellow-300 px-4 py-2 text-xs font-black text-black transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {verifyingIdentity ? 'Verifying...' : 'Verify as New Identity'}
                </button>
              )}

              {protectedActionIssue.action === 'verifyBrowser' && (
                <button
                  type="button"
                  onClick={handleVerifyIdentityInline}
                  disabled={verifyingIdentity}
                  className="mt-3 rounded-full bg-yellow-300 px-4 py-2 text-xs font-black text-black transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {verifyingIdentity ? 'Verifying...' : 'Verify This Browser'}
                </button>
              )}

              {protectedActionIssue.action === 'linkWallet' && (
                <button
                  type="button"
                  onClick={handleLinkActiveWalletToIdentity}
                  disabled={loading}
                  className="mt-3 rounded-full bg-yellow-300 px-4 py-2 text-xs font-black text-black transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Linking...' : 'Link Current Wallet'}
                </button>
              )}
            </div>
          )}
          
          {walletBase58 && !identityStatus.authenticated && (
            <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4">
              <p className="text-sm font-black text-amber-200">
                ⚠️ Use one Coincarnation Identity
              </p>

              <p className="mt-2 text-xs leading-5 text-amber-100/80">
                Link all wallets you own to a single Coincarnation Identity. Creating multiple identities with wallets that belong to the same person may increase your risk score and can temporarily lock protected actions such as claiming, voting, or refund requests.
              </p>
            </div>
          )}

          <div className="mt-5 rounded-xl border border-violet-400/20 bg-violet-400/5 p-4">
            <button
              type="button"
              onClick={() => setShowIdentityTools((v) => !v)}
              className="flex w-full items-center justify-between gap-3 text-left"
              aria-expanded={showIdentityTools}
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">
                  Advanced Identity Tools
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Generate a link code or connect this wallet to an existing identity.
                </p>
              </div>

              <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-[11px] font-black text-violet-200">
                {showIdentityTools ? 'Hide' : 'Show'}
              </span>
            </button>

            {showIdentityTools && (
              <div className="flex flex-col gap-4 lg:flex-1">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">
                    Identity Recovery / Link Code
                  </p>

                  <p className="mt-1 text-sm text-gray-300">
                    Use a temporary code to link wallets from another device, browser, or wallet app.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Create code from this identity
                    </p>

                    <button
                      type="button"
                      onClick={handleCreateIdentityLinkCode}
                      disabled={identityCodeCreating || !identityStatus.authenticated}
                      className="mt-3 rounded-full bg-violet-300 px-4 py-2 text-xs font-black text-black transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {identityCodeCreating ? 'Creating...' : 'Generate Link Code'}
                    </button>

                    {identityLinkMessage && (
                      <p className="mt-3 text-sm font-semibold text-emerald-300">
                        {identityLinkMessage}
                      </p>
                    )}

                    {identityLinkCode && (
                      <div className="mt-3 rounded-lg border border-violet-400/20 bg-violet-400/10 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-violet-200/70">
                          Your temporary code
                        </p>

                        <p className="mt-1 font-mono text-lg font-black text-violet-100">
                          {identityLinkCode}
                        </p>

                        {identityLinkCodeExpiresAt && (
                          <p className="mt-1 text-[11px] text-gray-400">
                            Expires: {new Date(identityLinkCodeExpiresAt).toLocaleString()}
                          </p>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            if (!identityLinkCode) return;

                            navigator.clipboard.writeText(identityLinkCode);

                            setIdentityCodeCopied(true);

                            setTimeout(() => {
                              setIdentityCodeCopied(false);
                            }, 2000);
                          }}
                          className="mt-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/[0.08]"
                        >
                          Copy Code
                        </button>
                        {identityCodeCopied && (
                          <p className="mt-2 text-xs font-semibold text-emerald-300">
                            ✅ Code copied successfully.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Link this wallet with a code
                    </p>

                    <input
                      type="text"
                      value={identityLinkCodeInput}
                      onChange={(e) => setIdentityLinkCodeInput(e.target.value.toUpperCase())}
                      placeholder="MEGY-123456"
                      className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-white outline-none transition focus:border-violet-300"
                    />

                    <button
                      type="button"
                      onClick={handleLinkWalletWithCode}
                      disabled={identityLinkingByCode || !walletBase58 || !identityLinkCodeInput.trim()}
                      className="mt-3 rounded-full bg-violet-300 px-4 py-2 text-xs font-black text-black transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {identityLinkingByCode ? 'Linking...' : 'Link Wallet With Code'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {linkedWallets.length > 0 && (() => {
            const visibleWallets = showAllLinkedWallets
              ? linkedWallets
              : linkedWallets.slice(0, 3);

            const hiddenCount = Math.max(linkedWallets.length - 3, 0);

            return (
              <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">
                    Linked Wallets ({linkedWallets.length})
                  </p>

                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllLinkedWallets((v) => !v)}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                    >
                      {showAllLinkedWallets ? 'Show Less' : `+${hiddenCount} More`}
                    </button>
                  )}
                </div>

                <div className="grid gap-2">
                  {visibleWallets.map((item) => {
                    const isCopied = copiedLinkedWallet === item.walletAddress;

                    return (
                      <div
                        key={`${item.chain}-${item.walletAddress}`}
                        className="flex min-w-0 items-center gap-2"
                      >
                        <button
                          type="button"
                          onClick={() => copyLinkedWallet(item.walletAddress)}
                          className="min-w-0 flex-1 overflow-hidden rounded-full border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-left font-mono text-xs text-gray-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/10"
                          title={item.walletAddress}
                        >
                          <span className="sm:hidden">
                            {isCopied ? 'Copied' : shorten(item.walletAddress)}
                          </span>

                          <span className="hidden sm:inline">
                            {isCopied ? 'Copied' : item.walletAddress}
                          </span>
                        </button>

                        {item.isPrimary && (
                          <span className="shrink-0 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-300">
                            Primary
                          </span>
                        )}

                        <span className="shrink-0 rounded-full bg-cyan-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-300">
                          {item.chain}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <p className="mt-3 text-xs text-gray-400 italic text-center">
            Your profile is protected by your Coincarnation Identity. Multiple wallets can belong to one identity.
          </p>
        </motion.section>

        {/* 👤 Personal Info */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative overflow-hidden w-full rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 px-4 py-5 sm:px-6 sm:py-6 mb-5 shadow-[0_0_35px_rgba(34,211,238,0.06)]"
        >
          <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-24 bottom-0 h-48 w-48 rounded-full bg-fuchsia-500/10 blur-3xl" />

          <div className="relative mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-300/80">
                Coincarnator Profile
              </p>

              <h3 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
                Your Revival Signature
              </h3>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Track your Coincarnation journey, your impact, and the value you are building.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left sm:text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                Coincarnator No
              </p>
              <p className="mt-1 text-2xl font-black text-cyan-200">
                #{data.id}
              </p>
            </div>
          </div>

          <div className="relative grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
            <div
              className="group relative flex h-[130px] cursor-pointer flex-col overflow-hidden rounded-2xl border border-blue-400/20 bg-blue-500/[0.08] p-4 transition hover:border-blue-300/40 hover:bg-blue-500/[0.14]"
              onClick={() => {
                if (!data?.wallet_address) return;

                navigator.clipboard.writeText(data.wallet_address);

                setCopiedTarget('wallet');

                setTimeout(() => setCopiedTarget(null), 2000);
              }}
            >
              <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
                <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-blue-300/20 blur-2xl" />
              </div>

              <span className="absolute right-4 top-4 text-white/30 transition group-hover:text-blue-100">
                <Copy className="h-4 w-4" />
              </span>

              <p className="relative text-xs font-bold uppercase tracking-wide text-blue-200/70">
                Wallet Address
              </p>

              <p className="relative mt-2 truncate pr-8 font-mono text-sm font-black text-blue-100">
                {shorten(data.wallet_address)}
              </p>

              <p className="relative mt-auto line-clamp-2 text-xs leading-5 text-blue-100/60">
                Click to copy your active wallet.
              </p>

              {copiedTarget === 'wallet' && (
                <p className="absolute right-4 top-10 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300 backdrop-blur-sm">
                  ✅ Copied
                </p>
              )}
            </div>

            <div
              className={[
                'group relative flex h-[130px] flex-col overflow-hidden rounded-2xl border p-4 transition',
                data?.referral_code
                  ? 'cursor-pointer border-fuchsia-400/20 bg-fuchsia-400/10 hover:border-fuchsia-300/40 hover:bg-fuchsia-400/15'
                  : 'cursor-default border-zinc-700/60 bg-zinc-900/60',
              ].join(' ')}
              onClick={() => {
                if (!data?.referral_code) return;

                const url = buildReferralUrl(data.referral_code ?? '');

                navigator.clipboard.writeText(url);

                setCopiedTarget('referral');

                setTimeout(() => setCopiedTarget(null), 2000);
              }}
            >
              <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
                <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-fuchsia-300/20 blur-2xl" />
              </div>

              {data?.referral_code ? (
                <span className="absolute right-4 top-4 text-white/30 transition group-hover:text-fuchsia-100">
                  <Copy className="h-4 w-4" />
                </span>
              ) : (
                <span className="absolute right-4 top-4 rounded-full border border-zinc-700 bg-black/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  Locked
                </span>
              )}

              <p
                className={[
                  'relative text-xs font-bold uppercase tracking-wide',
                  data?.referral_code ? 'text-fuchsia-200/70' : 'text-zinc-500',
                ].join(' ')}
              >
                Referral Code
              </p>

              <p
                className={[
                  'relative mt-2 truncate pr-8 font-mono font-black',
                  data?.referral_code
                    ? 'text-lg text-fuchsia-100'
                    : 'text-sm text-zinc-300',
                ].join(' ')}
              >
                {data?.referral_code || 'Identity required'}
              </p>

              <p
                className={[
                  'relative mt-auto line-clamp-2 text-xs leading-5',
                  data?.referral_code ? 'text-fuchsia-100/60' : 'text-zinc-500',
                ].join(' ')}
              >
                {data?.referral_code
                  ? 'Copy your identity referral link.'
                  : 'Activate your Coincarnation Identity to unlock your referral economy.'}
              </p>

              {copiedTarget === 'referral' && data?.referral_code && (
                <p className="absolute right-4 top-10 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300 backdrop-blur-sm">
                  ✅ Copied
                </p>
              )}
            </div>

            <div className="flex h-[130px] flex-col rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-200/70">
                Referred Identities
              </p>

              <p className="mt-2 text-3xl font-black text-emerald-200">
                {String(data.referral_count ?? 0)}
              </p>

              <p className="mt-auto line-clamp-2 text-xs leading-5 text-emerald-100/60">
                Unique new identities activated through your referral.
              </p>
            </div>

            <div className="flex h-[130px] flex-col rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-yellow-200/70">
                Total USD Revived
              </p>
              <p className="mt-2 text-3xl font-black text-yellow-100">
                ${Number(data.total_usd_contributed || 0).toFixed(2)}
              </p>
              <p className="mt-auto line-clamp-2 text-xs leading-5 text-yellow-100/60">
                Your personal revival contribution.
              </p>
            </div>

            <div className="flex h-[130px] flex-col rounded-2xl border border-red-400/20 bg-red-400/10 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-red-200/70">
                Deadcoins Revived
              </p>
              <p className="mt-2 text-3xl font-black text-red-100">
                {String(deadcoinsRevived)}
              </p>
              <p className="mt-auto line-clamp-2 text-xs leading-5 text-red-100/60">
                Unique deadcoins revived by your identity.
              </p>
            </div>

            <div className="flex h-[130px] flex-col rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-cyan-200/70">
                Personal Value Currency
              </p>

              <p className="mt-2 truncate text-3xl font-black text-cyan-100">
                {Number(data.core_point ?? 0).toLocaleString()} CP
              </p>

              <p className="mt-auto line-clamp-2 text-xs leading-5 text-cyan-100/60">
                Your CorePoint-powered PVC.
              </p>
            </div>
          </div>
        </motion.section>

        {/* 🌍 Protocol Momentum */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="relative overflow-hidden w-full rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 px-4 sm:px-6 py-5 sm:py-6 mb-5 shadow-[0_0_35px_rgba(16,185,129,0.06)]"
        >
          <h3 className="text-emerald-300 text-sm font-semibold uppercase mb-4 tracking-wide">
            🌍 Protocol Momentum
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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

          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('coincarnation_recoincarnate_intent', 'profile_global_momentum');
                window.location.href = '/';
              }}
              className="group inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-white/[0.03] px-5 py-2 text-xs font-black text-emerald-200 transition hover:border-emerald-300/50 hover:bg-emerald-400/10 hover:text-emerald-100"
            >
              <span className="text-sm text-emerald-300 transition-transform duration-500 group-hover:rotate-180">
                ✦
              </span>
              <span>
                Recoincarnate
              </span>
            </button>
          </div>

          {/* 🟢 Phase Engine */}
          <div className="mt-6">
            <div className="mb-3">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-300/80">
                Phase Engine
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                See how the current phase is filling and how your live estimate evolves.
              </p>
            </div>
            <div
              className={[
                "relative overflow-hidden rounded-2xl border bg-gradient-to-br from-zinc-950 via-emerald-950/10 to-zinc-950 p-4 shadow-[0_0_30px_rgba(16,185,129,0.06)]",
                currentPhase && !currentPhase?.snapshot_taken_at && !currentPhase?.finalized_at
                  ? "border-emerald-400/40 ring-1 ring-emerald-400/25"
                  : "border-zinc-700",
              ].join(" ")}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 min-w-0">
                <div className="min-w-0">
                  <p className="text-gray-400 text-xs uppercase tracking-wide">Current Phase</p>
                  <p className="text-white font-semibold truncate">
                    {phasesLoading ? 'Loading…' : currentPhase ? `${currentPhase.name || 'Current Phase'}` : 'No phase'}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    {currentPhase ? (
                      <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300">
                        active
                      </span>
                    ) : null}
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
                      const ratio = toPct01(currentPhase?.fill_pct); // 0..1
                      const pct = ratio * 100;
                      return `${pct.toFixed(ratio >= 1 ? 0 : 1)}%`;
                    })()}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3">
              {(() => {
                const fill = Number(currentPhase?.fill_pct ?? 0); // ratio
                const ratio = Number.isFinite(fill) ? fill : 0;
                const pct01 = Math.max(0, Math.min(ratio, 1));

                return (
                  <div className="w-full h-3 bg-zinc-900 border border-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-lime-400"
                      style={{ width: `${pct01 * 100}%` }}
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

                {(() => {
                  const fill = Number(currentPhase?.fill_pct ?? 0); // ratio
                  const ratio = Number.isFinite(fill) ? fill : 0;
                  return ratio > 1;
                })() && (
                  <div className="mt-2 text-xs text-yellow-300">
                    ⚠️ Phase is overfilled (Used exceeded Cap). This can happen when the last contribution crosses the target.
                  </div>
                )}
              </div>

              {/* Your estimate (inside the same card) */}
              {activeEstimate?.active?.id && !currentPhase?.snapshot_taken_at && (
                <div className="mt-4 pt-4 border-t border-zinc-700">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <p className="text-gray-400 text-xs uppercase tracking-wide">
                        Your live estimate
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        <span className="px-2 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-200">
                          ⏳ live estimate
                        </span>

                        {estimateLoading && (
                          <span className="px-2 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-200">
                            refreshing…
                          </span>
                        )}

                        <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300">
                          changes until snapshot
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-gray-400 text-xs">Your Share</p>
                      <p className="text-white font-semibold">
                        {(activeEstimate.me.shareRatio * 100).toFixed(3)}%
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                      <p className="text-xs text-emerald-100/60">Your USD</p>
                      <p className="font-semibold text-white">
                        ${Number(activeEstimate.me.userUsd).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                      <p className="text-xs text-cyan-100/60">Phase Total</p>
                      <p className="font-semibold text-white">
                        ${Number(activeEstimate.totals.totalUsd).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 shadow-[0_0_25px_rgba(250,204,21,0.06)]">
                      <p className="text-xs text-yellow-100/60">Estimated MEGY</p>
                      <p className="font-extrabold text-yellow-300 text-lg">
                        {formatMegyAmount(activeEstimate.me.estimatedMegy)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-gray-400 italic text-center">
                    ⚠️ This is a <span className="text-yellow-300 font-medium">live estimate</span>. Final MEGY amount will be locked at snapshot.
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.section>

        {/* 📊 MEGY Claim Center */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative overflow-hidden w-full rounded-2xl border border-purple-400/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 px-4 sm:px-6 py-5 sm:py-6 mb-5 shadow-[0_0_35px_rgba(168,85,247,0.06)]"
        >
          <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-purple-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-24 top-10 h-44 w-44 rounded-full bg-pink-500/10 blur-3xl" />
          
          <h3 className="text-blue-400 text-sm font-semibold uppercase mb-4 tracking-wide">
            📊 MEGY Claim Center
          </h3>

          {/* 🎯 Claim Hero */}
          <div className="relative border-b border-white/10 pb-5 mb-5">
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-purple-300/80">
                  Claimable MEGY
                </p>

                <div className="mt-3 flex items-end gap-3">
                  <p className="text-4xl sm:text-5xl font-black tracking-tight text-white">
                    {formatMegyAmount(claimableMegy)}
                  </p>

                  {(() => {
                    const finalized = Number(finalizedClaim?.finalized_megy_total ?? 0);
                    const claimed = Number(finalizedClaim?.claimed_megy_total ?? 0);
                    const claimable = Number(claimableMegy ?? 0);

                    const badge =
                      finalized > 0 && claimed >= finalized
                        ? {
                            label: 'CLAIMED',
                            className: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
                          }
                        : !claimOpen
                          ? {
                              label: 'LOCKED',
                              className: 'border-yellow-400/20 bg-yellow-400/10 text-yellow-300',
                            }
                          : claimable <= 0
                            ? {
                                label: 'EMPTY',
                                className: 'border-zinc-400/20 bg-white/[0.04] text-zinc-300',
                              }
                            : claimed > 0
                              ? {
                                  label: 'PARTIAL',
                                  className: 'border-purple-400/20 bg-purple-400/10 text-purple-200',
                                }
                              : {
                                  label: 'READY',
                                  className: 'border-purple-400/20 bg-purple-400/10 text-purple-200',
                                };

                    return (
                      <span className={`mb-1 rounded-full border px-3 py-1 text-xs font-bold ${badge.className}`}>
                        {badge.label}
                      </span>
                    );
                  })()}
                </div>

                <p className="mt-3 max-w-xl text-sm text-zinc-400">
                  Your finalized MEGY balance across Coincarnation snapshots.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 min-w-0 lg:min-w-[480px]">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                    Finalized
                  </p>

                  <p className="mt-2 text-xl font-black text-white">
                    {formatMegyAmount(finalizedClaim?.finalized_megy_total)}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                    Claimed
                  </p>

                  <p className="mt-2 text-xl font-black text-white">
                    {formatMegyAmount(finalizedClaim?.claimed_megy_total)}
                  </p>
                </div>

                <div className="rounded-2xl border border-purple-400/20 bg-purple-400/10 p-4">
                  <p className="text-[11px] uppercase tracking-wide text-purple-200/70">
                    Selected Phase
                  </p>

                  <p className="mt-2 text-xl font-black text-purple-100">
                    {formatMegyAmount(selectedClaimable)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 💳 Claim controls */}
          <div className="relative space-y-3">
            <div className="relative pb-2">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-pink-300/80">
                Claim Execution
              </p>

              <p className="mt-1 text-xs leading-5 text-zinc-400">
                Choose destination, select phase, confirm amount, and claim your MEGY.
              </p>
            </div>

            <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.04] p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300/90">
                    Claim Scope
                  </p>

                  <p className="mt-1 text-sm text-gray-300">
                    Choose whether to claim from only this wallet or all wallets linked to your Identity.
                  </p>

                  <p className="mt-2 text-xs leading-5 text-cyan-100/60">
                    {claimScopeMeta.isIdentityClaimScope
                      ? `Viewing ${claimScopeMeta.claimWalletsCount} linked wallets under this identity.`
                      : 'Viewing the connected wallet only.'}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setClaimScope('wallet')}
                    className={[
                      'rounded-full px-4 py-2 text-xs font-black transition',
                      claimScope === 'wallet'
                        ? 'bg-cyan-300 text-black'
                        : 'border border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white',
                    ].join(' ')}
                  >
                    Current Wallet
                  </button>

                  <button
                    type="button"
                    onClick={() => setClaimScope('identity')}
                    disabled={!identityStatus.authenticated || !identityStatus.identity}
                    className={[
                      'rounded-full px-4 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40',
                      claimScope === 'identity'
                        ? 'bg-emerald-300 text-black'
                        : 'border border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white',
                    ].join(' ')}
                    title={
                      identityStatus.authenticated && identityStatus.identity
                        ? 'Claim across all linked wallets.'
                        : 'Verify your Coincarnation Identity to use linked wallet claims.'
                    }
                  >
                    All Linked Wallets
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-200/70">
                    Destination Wallet
                  </p>

                  <p className="mt-1 text-xs text-zinc-500">
                    Select where your claimed MEGY will be sent.
                  </p>
                </div>

                <label className="flex items-center gap-2 text-[11px] font-semibold text-zinc-300">
                  <input
                    type="checkbox"
                    checked={useAltAddress}
                    onChange={(e) => {
                      setUseAltAddress(e.target.checked);
                      setAltAddress('');
                    }}
                    className="accent-pink-500"
                  />

                  <span>Custom</span>
                </label>
              </div>

              <div className="mt-4">
                {!useAltAddress ? (
                  <button
                    type="button"
                    onClick={() => {
                      const address = publicKey?.toBase58();
                      if (!address) return;

                      navigator.clipboard.writeText(address);
                      setCopiedTarget('wallet');
                      setTimeout(() => setCopiedTarget(null), 2000);
                    }}
                    className="relative w-full rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-left font-mono text-sm text-emerald-200 break-all transition hover:border-emerald-300/40 hover:bg-emerald-400/15"
                    title="Click to copy destination address"
                  >
                    {publicKey?.toBase58()}

                    {copiedTarget === 'wallet' && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300 backdrop-blur-sm">
                        ✅ Copied
                      </span>
                    )}
                  </button>
                ) : (
                  <>
                    <input
                      type="text"
                      value={altAddress}
                      onChange={(e) => setAltAddress(e.target.value)}
                      placeholder="Enter custom wallet address"
                      className="relative w-full rounded-xl border border-pink-400/20 bg-black/30 p-3 font-mono text-sm text-white outline-none transition focus:border-pink-300/60"
                    />
                
                    <p className="mt-2 text-[11px] leading-5 text-amber-200/70">
                      Funds sent to a custom wallet cannot be reversed. Please verify the address carefully.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* 🧬 Select Phase */}
            {Array.isArray(finalizedClaim?.finalized_by_phase) && finalizedClaim.finalized_by_phase.length > 0 && (() => {
              const phases = finalizedClaim.finalized_by_phase
                .slice()
                .map((p: any) => ({
                  pid: Number(p?.phase_id ?? p?.phaseId ?? 0),
                  phaseNo: Number(p?.phase_no ?? p?.phaseNo ?? 0) || null,
                  phaseName: p?.phase_name ?? p?.phaseName ?? null,
                  created: p?.created_at ?? p?.snapshot_taken_at ?? p?.createdAt ?? null,
                  claimable: Number(p?.claimable_megy ?? p?.claimable ?? p?.claimableMegy ?? 0),
                  claimed: Number(p?.claimed_megy ?? p?.claimed ?? p?.claimedMegy ?? 0),
                }))
                .filter((x: any) => Number.isFinite(x.pid) && x.pid > 0)
                .sort((a: any, b: any) => b.pid - a.pid);

              const options: number[] = Array.from(new Set(phases.map((x: any) => x.pid)));

              const isAllLinkedWalletsMode = claimScope === 'identity';

              const activePid =
                isAllLinkedWalletsMode
                  ? null
                  : (selectedPhaseId != null && options.includes(selectedPhaseId))
                    ? selectedPhaseId
                    : (options[0] ?? null);

              const ordered =
                isAllLinkedWalletsMode
                  ? phases.sort((a: any, b: any) => {
                      const phaseNoDiff = Number(b.phaseNo || 0) - Number(a.phaseNo || 0);
                      if (phaseNoDiff !== 0) return phaseNoDiff;
                      return Number(b.pid || 0) - Number(a.pid || 0);
                    })
                  : activePid
                    ? [
                        ...phases.filter((x: any) => x.pid === activePid),
                        ...phases.filter((x: any) => x.pid !== activePid),
                      ]
                    : phases;

              return (
                <div className="border-b border-white/10 pb-5 mb-5 text-sm">
                  <div className="flex flex-col gap-3 mb-3 min-w-0">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.28em] text-violet-300/80">
                        Select Phase
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {isAllLinkedWalletsMode
                          ? 'All finalized phases are included. Partial claims are processed FIFO across linked wallet balances.'
                          : 'Choose the finalized phase you want to claim from.'}
                      </p>
                    </div>

                    <div className="w-full sm:w-auto flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold text-violet-200/70 shrink-0">{isAllLinkedWalletsMode ? 'All phases selected' : 'Select phase'}</span>

                      <select
                        value={activePid ? String(activePid) : ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const v = Number(raw);
                          setSelectedPhaseId(raw === '' ? null : (Number.isFinite(v) ? v : null));
                        }}
                        disabled={options.length === 0 || isAllLinkedWalletsMode}
                        className="w-full sm:w-44 bg-zinc-900 border border-zinc-600 text-white text-xs rounded-md px-2 py-2 sm:py-1 disabled:opacity-50"
                      >
                        <option value="">Latest finalized snapshot</option>
                        {options.map((pid) => {
                          const row = phases.find((x: any) => x.pid === pid);
                          const label =
                            row?.phaseName
                              ? String(row.phaseName)
                              : row?.phaseNo
                                ? `Phase ${row.phaseNo}`
                                : `Phase`;

                          return (
                            <option key={pid} value={String(pid)}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                    {ordered.map((p: any) => {
                      const isSelected = isAllLinkedWalletsMode || (activePid != null && p.pid === activePid);

                      return (
                        <button
                          type="button"
                          key={p.pid}
                          onClick={() => {
                            if (isAllLinkedWalletsMode) return;
                            setSelectedPhaseId(p.pid);
                          }}
                          aria-pressed={isSelected}
                          className={[
                            "w-full text-left rounded-2xl border px-4 py-3 flex flex-col gap-3 transition min-w-0 focus:outline-none focus:ring-2 focus:ring-violet-300/40 sm:flex-row sm:items-start sm:justify-between",
                            isSelected
                              ? "border-emerald-400/40 bg-emerald-400/10 shadow-[0_0_0_1px_rgba(52,211,153,0.25)]"
                              : "border-zinc-700 bg-zinc-900/20 hover:bg-zinc-800/40",
                            isAllLinkedWalletsMode ? "cursor-default" : "cursor-pointer",
                          ].join(" ")}
                        >
                          <div className="text-gray-300 min-w-0 w-full sm:w-auto">
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span className="min-w-0 max-w-[120px] truncate text-white font-semibold sm:max-w-[220px]">
                                {p.phaseName ? String(p.phaseName) : (p.phaseNo ? `Phase ${p.phaseNo}` : `Phase`)}
                              </span>

                              {isSelected && (
                                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 shrink-0">
                                  {isAllLinkedWalletsMode ? 'Included' : 'Selected'}
                                </span>
                              )}
                              <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-200 shrink-0">
                                Finalized
                              </span>

                              {(() => {
                                const phaseClaimable = Number(p.claimable || 0);
                                const phaseClaimed = Number(p.claimed || 0);

                                if (phaseClaimable <= 0 && phaseClaimed > 0) {
                                  return (
                                    <span className="rounded-full border border-zinc-400/20 bg-zinc-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-zinc-300 shrink-0">
                                      Fully Claimed
                                    </span>
                                  );
                                }

                                if (phaseClaimed > 0 && phaseClaimable > 0) {
                                  return (
                                    <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-200 shrink-0">
                                      Partial
                                    </span>
                                  );
                                }

                                return (
                                  <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-cyan-200 shrink-0">
                                    Ready
                                  </span>
                                );
                              })()}
                            </div>

                            {p.created ? (
                              <div className="text-xs text-gray-500">{formatDate(String(p.created))}</div>
                            ) : null}
                          </div>

                          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:block sm:text-right sm:shrink-0">
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
                        </button>
                      );
                    })}
                  </div>
                  {ordered.length > 4 && (
                    <div className="mt-2 flex items-center justify-center sm:hidden">
                      <span className="animate-pulse text-[11px] font-semibold tracking-wide text-cyan-300/70">
                        Scroll for more ↓
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {claimOpen && (
              <div className="rounded-2xl border border-pink-400/15 bg-pink-400/[0.04] p-4">
                <p className="mb-3 text-[11px] font-black uppercase tracking-[0.22em] text-pink-300/80">
                  Claim Amount
                </p>
                <div className="mb-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                      Already Claimed
                    </p>

                    <p className="mt-1 font-black text-purple-200">
                      {formatMegyAmount(
                        selectedPhaseSnapshot?.claimed_megy ??
                        selectedPhaseSnapshot?.claimed ??
                        0
                      )} MEGY
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                      Phase Total
                    </p>

                    <p className="mt-1 font-black text-purple-200">
                      {formatMegyAmount(selectedPhaseTotal)} MEGY
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                      Still Claimable
                    </p>

                    <p className="mt-1 font-black text-emerald-200">
                      {formatMegyAmount(selectedClaimable, 6)}
                    </p>

                    {claimAmountNumber > 0 && (
                      <p className="mt-1 text-[10px] text-zinc-500">
                        Remaining after claim:{' '}
                        <span className="font-semibold text-zinc-300">
                          {formatMegyAmount(Math.max(0, selectedClaimable - claimAmountNumber), 6)} MEGY
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                {selectedPhaseTotal > 0 && (
                  <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-3">
                    {(() => {
                      const alreadyClaimed = Number(
                        selectedPhaseSnapshot?.claimed_megy ??
                          selectedPhaseSnapshot?.claimed ??
                          0
                      );

                      const progress = Math.min(
                        100,
                        Math.max(0, (alreadyClaimed / selectedPhaseTotal) * 100)
                      );

                      return (
                        <>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                              Claim Progress
                            </p>

                            <p className="text-xs font-black text-zinc-300">
                              {progress.toFixed(1)}% claimed
                            </p>
                          </div>

                          <div className="h-2 overflow-hidden rounded-full bg-white/10">
                            <div
                              className={[
                                'h-full rounded-full transition-all duration-500',
                                progress >= 90
                                  ? 'bg-red-400'
                                  : progress >= 50
                                    ? 'bg-amber-300'
                                    : 'bg-emerald-300',
                              ].join(' ')}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {selectedClaimable > 0 && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-3 text-xs font-black">
                      <button
                        type="button"
                        disabled={!claimOpen || isClaiming || selectedClaimable <= 0}
                        className={[
                          'rounded-full border px-4 py-2 transition disabled:cursor-not-allowed disabled:opacity-50',
                          selectedClaimPercent === 25
                            ? 'border-pink-300/50 bg-pink-400/15 text-pink-100'
                            : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-pink-300/30 hover:bg-pink-400/10 hover:text-pink-100',
                        ].join(' ')}
                        onClick={() => {
                          setSelectedClaimPercent(25);
                          setClaimAmount(
                            normalizeClaimInput(
                              String(selectedClaimable * 0.25),
                              selectedClaimable
                            )
                          );
                        }}
                      >
                        25%
                      </button>

                      <button
                        type="button"
                        disabled={!claimOpen || isClaiming || selectedClaimable <= 0}
                        className={[
                          'rounded-full border px-4 py-2 transition disabled:cursor-not-allowed disabled:opacity-50',
                          selectedClaimPercent === 50
                            ? 'border-pink-300/50 bg-pink-400/15 text-pink-100'
                            : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-pink-300/30 hover:bg-pink-400/10 hover:text-pink-100',
                        ].join(' ')}
                        onClick={() => {
                          setSelectedClaimPercent(50);
                          setClaimAmount(
                            normalizeClaimInput(
                              String(selectedClaimable * 0.5),
                              selectedClaimable
                            )
                          );
                        }}
                      >
                        HALF
                      </button>

                      <button
                        type="button"
                        disabled={!claimOpen || isClaiming || selectedClaimable <= 0}
                        className={[
                          'rounded-full border px-4 py-2 transition disabled:cursor-not-allowed disabled:opacity-50',
                          selectedClaimPercent === 100
                            ? 'border-pink-300/50 bg-pink-400/15 text-pink-100'
                            : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-pink-300/30 hover:bg-pink-400/10 hover:text-pink-100',
                        ].join(' ')}
                        onClick={() => {
                          setSelectedClaimPercent(100);
                          setClaimAmount(
                            normalizeClaimInput(
                              String(selectedClaimable),
                              selectedClaimable
                            )
                          );
                        }}
                      >
                        MAX
                      </button>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={claimAmount}
                      onChange={(e) => {
                        setSelectedClaimPercent(null);
                        setClaimAmount(normalizeClaimInput(e.target.value, selectedClaimable));
                      }}
                      placeholder="Enter amount to claim"
                      className="w-full rounded-xl border border-pink-400/20 bg-black/30 p-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-pink-300/60"
                    />

                    {claimDisabledReason && selectedClaimable > 0 && (
                      <p
                        className={[
                          'text-center text-xs transition',
                          claimAmountExceeds || claimAmountInvalid || destinationAddressInvalid
                            ? 'text-red-300'
                            : isClaimAmountEmpty
                            ? 'text-zinc-500'
                            : 'text-yellow-300',
                        ].join(' ')}
                      >
                        {isClaimAmountEmpty
                          ? 'Select how much MEGY you want to claim.'
                          : `⚠️ ${claimDisabledReason}`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {claimOpen && claimAmountNumber > 0 && !claimAmountInvalid && !claimAmountExceeds && (
              <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-xs shadow-[0_0_25px_rgba(251,191,36,0.08)]">
                <p className="font-black uppercase tracking-[0.22em] text-amber-200/80">
                  Claim Summary
                </p>

                <p className="mt-2 leading-6 text-zinc-300">
                  You are about to claim{' '}
                  <span className="font-black text-amber-200">
                    {formatMegyAmount(claimAmountNumber, 6)} MEGY
                  </span>{' '}
                  from{' '}
                  <span className="font-semibold text-white">
                    {claimScope === 'identity'
                      ? 'All Linked Wallets · FIFO'
                      : selectedPhaseSnapshot?.phase_name ||
                        selectedPhaseSnapshot?.phaseName ||
                        'selected phase'}
                  </span>{' '}
                  to{' '}
                  <span className="font-mono font-semibold text-emerald-200">
                    {useAltAddress ? shorten(altAddress) : publicKey ? shorten(publicKey.toBase58()) : '-'}
                  </span>.
                </p>
              </div>
            )}

            {claimOpen ? (
              <>
                {(claimScope === 'identity' || effectivePhaseId) && selectedClaimable <= 0 && (
                  <p className="text-center text-xs text-yellow-300 mb-2">
                    ⚠️ No claimable balance found for the selected phase. Please select another finalized phase.
                  </p>
                )}

                <div className="relative group">
                  <button
                    onClick={handleClaim}
                    disabled={claimDisabled}
                    className="w-full rounded-2xl border border-pink-300/30 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 py-3.5 text-sm font-black text-white shadow-[0_0_30px_rgba(236,72,153,0.18)] transition-all hover:scale-[1.01] hover:shadow-[0_0_40px_rgba(236,72,153,0.28)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                  >
                    <div className="flex items-center justify-center gap-2">
                      {isClaiming && (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      )}

                      <span>
                        {claimButtonLabel}
                      </span>
                    </div>
                  </button>

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
                      {claimDisabledReason ? (
                        <span>{claimDisabledReason}</span>
                      ) : (
                        <>
                          You can claim up to{" "}
                          <span className="text-purple-300 font-semibold">
                            {formatMegyAmount(selectedClaimable, 6)}
                          </span>{" "}
                          MEGY in this phase.
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-yellow-400 text-center font-medium mt-4">
                ⚠️ Claiming is currently closed. You will be able to claim when the window opens.
              </p>
            )}

            {message && <p className="text-center mt-3 text-sm whitespace-pre-line">{message}</p>}

            {process.env.NODE_ENV !== 'production' && refundDebug ? (
              <pre className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] text-white/80 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(refundDebug, null, 2)}
              </pre>
            ) : null}

            {supportFeeSig && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(supportFeeSig)}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-white transition hover:bg-zinc-700"
                >
                  Copy {supportFeeSigLabel}
                </button>

                <a
                  href={`https://solscan.io/tx/${supportFeeSig}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-300 underline"
                >
                  View on Solscan
                </a>
              </div>
            )}
          </div>

          <motion.div
            className="mt-8 flex flex-col items-center justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('coincarnation_recoincarnate_intent', 'profile_footer');
                window.location.href = '/';
              }}
              className="group inline-flex items-center gap-2 rounded-full border border-pink-300/20 bg-white/[0.03] px-5 py-2.5 text-xs font-black text-pink-100 transition hover:border-pink-300/50 hover:bg-pink-400/10 hover:text-white"
            >
              <span className="text-sm text-pink-300 transition-transform duration-500 group-hover:rotate-180">
                ✦
              </span>

              <span>
                Recoincarnate
              </span>
            </button>

            <p className="mt-3 text-center text-xs text-zinc-500">
              Return to the Coincarnation engine and expand your revival impact.
            </p>
          </motion.div>
        </motion.section>

        {/* 📜 Contribution History */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="relative overflow-hidden w-full rounded-2xl border border-yellow-400/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 px-4 py-5 sm:px-6 sm:py-6 mb-5 shadow-[0_0_35px_rgba(250,204,21,0.06)]"
        >
          <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-yellow-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-24 bottom-0 h-48 w-48 rounded-full bg-orange-500/10 blur-3xl" />

          <div className="relative mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-yellow-300/80">
                Contribution History
              </p>

              <h3 className="mt-2 text-2xl font-black tracking-tight text-white">
                Your Coincarnation Trail
              </h3>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Every Coincarnation you made, every revived asset, and every shareable proof of impact.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                Total Records
              </p>
              <p className="mt-1 text-2xl font-black text-yellow-200">
                {txs.length}
              </p>
            </div>
          </div>

          {txs.length > 0 ? (
            <div className="relative">
            <div className="relative grid max-h-[72vh] gap-3 overflow-y-auto pr-1 sm:max-h-[620px]">
              {[...txs]
                .sort((a: any, b: any) => {
                  const aTime = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
                  const bTime = b?.timestamp ? new Date(b.timestamp).getTime() : 0;

                  return bTime - aTime;
                })
                .map((tx: any, index: number) => {
                const contributionId = Number(
                  tx?.contribution_id ??
                    tx?.contributionId ??
                    tx?.id ??
                    0
                );

                const refundState = getRefundUiState(tx);

                const rawTxId =
                  (tx.tx_id && String(tx.tx_id)) ||
                  (tx.txId && String(tx.txId)) ||
                  (tx.transaction_signature && String(tx.transaction_signature)) ||
                  (tx.tx_signature && String(tx.tx_signature)) ||
                  (tx.tx_hash && String(tx.tx_hash)) ||
                  undefined;

                const assetLabel = tx.token_symbol || tx.symbol || 'Unknown Asset';
                const isRefunding = refundingContributionId === contributionId;

                return (
                  <div
                    key={rawTxId || contributionId || index}
                    className="group rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-yellow-300/25 hover:bg-yellow-300/[0.03]"
                  >
                    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1.35fr_0.75fr_0.9fr_0.9fr_1fr_auto] lg:items-center lg:gap-5">
                      {/* ASSET */}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-lg font-black text-white">
                            {assetLabel}
                          </p>
                        </div>
                      </div>

                      {/* AMOUNT */}
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 lg:border-transparent lg:bg-transparent lg:px-0 lg:py-0">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                          Amount
                        </p>
                        <p className="mt-1 font-semibold text-white">
                          {tx.token_amount ?? '-'}
                        </p>
                      </div>

                      {/* USD VALUE */}
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 lg:border-transparent lg:bg-transparent lg:px-0 lg:py-0">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                          USD Value
                        </p>
                        <p className="mt-1 font-semibold text-emerald-300">
                          {formatUsdValue(tx.usd_value)}
                        </p>
                      </div>

                      {/* DATE */}
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 lg:border-transparent lg:bg-transparent lg:px-0 lg:py-0">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                          Date
                        </p>
                        <p className="mt-1 font-semibold text-zinc-200">
                          {tx.timestamp ? formatDate(tx.timestamp) : '-'}
                        </p>
                      </div>

                      {/* STATUS */}
                      <div className="flex flex-wrap items-center gap-2">
                        {tx?.blacklisted && (
                          <span className="rounded-full border border-red-400/25 bg-red-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-red-200">
                            Blacklist
                          </span>
                        )}

                        {refundState.badge ? (
                          <span
                            className={[
                              'rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide',
                              refundState.badge === 'Refunded'
                                ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                                : refundState.badge === 'Refund Requested'
                                  ? 'border-yellow-400/25 bg-yellow-400/10 text-yellow-200'
                                  : refundState.badge === 'Complete Refund Request'
                                    ? 'border-orange-400/25 bg-orange-400/10 text-orange-200'
                                    : 'border-blue-400/25 bg-blue-400/10 text-blue-200',
                            ].join(' ')}
                          >
                            {refundState.badge}
                          </span>
                        ) : (
                          <span className="hidden text-zinc-600 lg:inline">—</span>
                        )}
                      </div>

                      {/* ACTION */}
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end lg:justify-end">
                        <button
                          type="button"
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
                                src: 'app',
                              },
                            );

                            setSharePayload(payload);
                            setShareContext('contribution');

                            const wallet = data.wallet_address || publicKey?.toBase58() || 'unknown';
                            const anchor =
                              rawTxId
                                ? `contribution:${wallet}:${rawTxId}`
                                : `contribution:${wallet}:idx-${index}`;

                            setShareTxId(rawTxId);
                            setShareAnchor(anchor);
                            setShareOpen(true);
                          }}
                          className="inline-flex items-center justify-center rounded-full border border-blue-300/20 bg-blue-400/10 px-4 py-2 text-xs font-black text-blue-100 transition hover:border-blue-300/45 hover:bg-blue-400/15 hover:text-white"
                        >
                          Share
                        </button>

                        {refundState.showRefundButton && (
                          <button
                            type="button"
                            onClick={() => handleRequestRefund(tx)}
                            disabled={isRefunding}
                            className="inline-flex items-center justify-center rounded-full border border-fuchsia-300/20 bg-fuchsia-500/10 px-4 py-2 text-xs font-black text-fuchsia-100 transition hover:border-fuchsia-300/45 hover:bg-fuchsia-500/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isRefunding ? 'Processing...' : refundState.buttonLabel}
                          </button>
                        )}
                      </div>
                    </div>

                    {refundErrors[contributionId] && (
                      <p className="mt-3 rounded-xl border border-yellow-400/20 bg-yellow-400/10 px-3 py-2 text-xs font-semibold leading-5 text-yellow-100">
                        {refundErrors[contributionId]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {txs.length > 6 && (
              <div className="mt-2 flex items-center justify-center sm:hidden">
                <span className="animate-pulse text-[11px] font-semibold tracking-wide text-cyan-300/70">
                  Scroll for more ↓
                </span>
              </div>
            )}
            </div>
          ) : (
            <div className="relative rounded-2xl border border-white/10 bg-black/20 px-4 py-8 text-center">
              <p className="text-sm font-semibold text-zinc-300">
                You haven’t Coincarnated anything yet.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Your revived assets and shareable contribution proofs will appear here.
              </p>
            </div>
          )}
        </motion.section>

        {/* 💠 Personal Value Currency */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="relative mb-5 w-full overflow-hidden rounded-[28px] border border-fuchsia-400/20 bg-gradient-to-br from-zinc-950 via-[#120817] to-zinc-950 px-4 py-6 shadow-[0_0_45px_rgba(217,70,239,0.08)] sm:px-6 sm:py-7"
        >
          <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

          {/* HERO */}
          <div className="relative z-10 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-center">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.34em] text-fuchsia-300/80">
                Personal Value Currency
              </p>

              <h3 className="mt-4 text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
                Your value.
                <span className="block bg-gradient-to-r from-fuchsia-300 via-pink-200 to-cyan-200 bg-clip-text text-transparent">
                  Your currency.
                </span>
              </h3>

              <p className="mt-6 max-w-2xl text-base leading-8 text-zinc-400">
                Turn contribution into currency.
                Build the economic layer of your future identity.
              </p>

              <p className="mt-4 text-sm font-semibold tracking-wide text-fuchsia-200/70">
                CorePoint powers your Personal Value Currency.
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-fuchsia-300/70">
                    Contribution
                  </p>
                  <p className="mt-2 text-sm font-bold text-white">
                    Your actions create value.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/70">
                    CorePoint
                  </p>
                  <p className="mt-2 text-sm font-bold text-white">
                    Value becomes signal.
                  </p>
                </div>

                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/70">
                    PVC
                  </p>
                  <p className="mt-2 text-sm font-black text-cyan-100">
                    Signal becomes currency.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative min-w-0 rounded-[28px] border border-fuchsia-400/20 bg-black/30 px-4 py-8 text-center backdrop-blur-xl sm:px-6 sm:py-10">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(217,70,239,0.16),transparent_68%)]" />

              <div className="relative">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-fuchsia-200/70">
                  Your Value Core
                </p>

                <p className="mt-5 break-words text-5xl font-black tracking-tight text-white sm:text-7xl">
                  {Number(data.core_point || 0).toFixed(1)}
                </p>

                <p className="mt-4 text-[10px] font-black uppercase tracking-[0.42em] text-fuchsia-200/70">
                  CorePoint
                </p>

                {typeof data.pvc_share === 'number' && (
                  <div className="mt-8 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-200/70">
                      PVC Economy Share
                    </p>

                    <p className="mt-1 text-4xl font-black text-emerald-200">
                      {(Number(data.pvc_share) * 100).toFixed(2)}%
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* BUILD SOURCES */}
          {data.core_point_breakdown && (
            <div className="relative z-10 mt-10 sm:rounded-[28px] sm:border sm:border-white/10 sm:bg-black/20 sm:p-5">
              <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.3em] text-cyan-300/80">
                    How your PVC is built
                  </p>

                  <h4 className="mt-2 text-2xl font-black text-white">
                    Contribution sources
                  </h4>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-semibold leading-5 text-zinc-400">
                  Rates are protocol-defined and may evolve through community decision.
                </div>
              </div>

              <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {/* Coincarnations */}
                <div className="flex h-full flex-col rounded-3xl border border-fuchsia-400/15 bg-fuchsia-400/[0.05] p-5">
                  <div className="flex min-h-[76px] items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 text-2xl">
                      <Coins className="h-5 w-5" />
                    </span>

                    <div className="min-w-0">
                      <p className="font-black text-white">Coincarnations</p>
                      <p className="text-xs text-zinc-500">Revived value</p>
                    </div>
                  </div>

                  <div className="mt-4 min-h-[76px]">
                    <p className="text-3xl font-black text-fuchsia-200">
                      {Number(data.core_point_breakdown.coincarnations || 0).toFixed(1)}
                    </p>

                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                      CorePoint
                    </p>
                  </div>

                  <p className="mb-6 min-h-[64px] text-sm leading-6 text-zinc-400">
                    Capital revived into future value.
                  </p>

                  <div className="mt-auto min-h-[92px] rounded-2xl border border-fuchsia-300/15 bg-black/25 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-fuchsia-200/60">
                      Earning Logic
                    </p>

                    <p className="mt-2 text-xs leading-5 text-fuchsia-100/80">
                      {cpConfig
                        ? `~${Math.round(cpConfig.usdPer1 * cpConfig.multUsd)} CP per $1 revived.`
                        : 'CorePoints from Coincarnation contributions.'}
                    </p>
                  </div>
                </div>

                {/* Referrals */}
                <div className="relative flex h-full flex-col rounded-3xl border border-amber-400/15 bg-amber-400/[0.05] p-5">
                  {data.referral_code && (
                    <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
                      <button
                        type="button"
                        title="Copy referral link"
                        aria-label="Copy referral link"
                        onClick={() => {
                          if (!data.referral_code) return;
                          const url = buildReferralUrl(data.referral_code ?? '');
                          navigator.clipboard.writeText(url);
                          setCopiedTarget('referral');
                          setTimeout(() => setCopiedTarget(null), 2000);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10 text-sm font-black text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.08)] transition hover:bg-amber-300/20"
                      >
                        <Copy className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        title="Share referral link"
                        aria-label="Share referral link"
                        onClick={() => {
                          if (!data.referral_code) return;

                          const url = buildReferralUrl(data.referral_code ?? '');

                          const payload = buildPayload(
                            'profile',
                            { url },
                            {
                              ref: data.referral_code ?? undefined,
                              src: 'app',
                            },
                          );

                          setSharePayload(payload);
                          setShareContext('profile');
                          setShareTxId(undefined);
                          setShareAnchor(`profile:${data.wallet_address}`);
                          setShareOpen(true);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10 text-sm font-black text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.08)] transition hover:bg-amber-300/20"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <div className="flex min-h-[76px] items-center gap-3 pr-14">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-300/20 bg-amber-400/10 text-2xl">
                      <Megaphone className="h-5 w-5" />
                    </span>

                    <div className="min-w-0">
                      <p className="font-black text-white">Referrals</p>
                      <p className="text-xs text-zinc-500">Network value</p>
                    </div>
                  </div>

                  <div className="mt-4 min-h-[76px]">
                    <p className="text-3xl font-black text-amber-200">
                      {Number(data.core_point_breakdown.referrals || 0).toFixed(1)}
                    </p>

                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                      CorePoint
                    </p>
                  </div>

                  <p className="mb-6 min-h-[64px] text-sm leading-6 text-zinc-400">
                    Network growth turned into value.
                  </p>

                  <div className="mt-auto min-h-[92px] rounded-2xl border border-fuchsia-300/15 bg-black/25 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200/60">
                      Earning Logic
                    </p>

                    <p className="mt-2 text-xs leading-5 text-amber-100/80">
                      {cpConfig
                        ? `~${Math.round(cpConfig.refSignup * cpConfig.multReferral)} CP per referred identity.`
                        : `${data.referral_count} identities joined through your link.`}
                    </p>
                  </div>

                  {copiedTarget === 'referral' && (
                    <p className="mt-3 text-xs font-semibold text-emerald-300">
                      ✅ Referral link copied
                    </p>
                  )}
                </div>

                {/* Social Shares */}
                <div className="flex h-full flex-col rounded-3xl border border-cyan-400/15 bg-cyan-400/[0.05] p-5">
                  <div className="flex min-h-[76px] items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-400/10 text-2xl">
                      <Share2 className="h-5 w-5" />
                    </span>

                    <div className="min-w-0">
                      <p className="font-black text-white">Social Shares</p>
                      <p className="text-xs text-zinc-500">Social value</p>
                    </div>
                  </div>

                  <div className="mt-4 min-h-[76px]">
                    <p className="text-3xl font-black text-cyan-200">
                      {Number(data.core_point_breakdown.shares || 0).toFixed(1)}
                    </p>

                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                      CorePoint
                    </p>
                  </div>

                  <p className="mb-6 min-h-[64px] text-sm leading-6 text-zinc-400">
                    Visibility converted into value.
                  </p>

                  <div className="mt-auto min-h-[92px] rounded-2xl border border-fuchsia-300/15 bg-black/25 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/60">
                      Earning Logic
                    </p>

                    <p className="mt-2 text-xs leading-5 text-cyan-100/80">
                      {cpConfig ? (
                        <>
                          X share: ~{Math.round(cpConfig.shareTwitter * cpConfig.multShare)} CP.
                          <br />
                          Other channels: ~{Math.round(cpConfig.shareOther * cpConfig.multShare)} CP.
                        </>
                      ) : (
                        'CorePoints from sharing Coincarnation.'
                      )}
                    </p>
                  </div>
                </div>

                {/* Deadcoins Bonus */}
                <div className="flex h-full flex-col rounded-3xl border border-violet-400/15 bg-violet-400/[0.05] p-5">
                  <div className="flex min-h-[76px] items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-violet-300/20 bg-violet-400/10 text-2xl">
                      <Skull className="h-5 w-5" />
                    </span>

                    <div className="min-w-0">
                      <p className="font-black text-white">Deadcoins Bonus</p>
                      <p className="text-xs text-zinc-500">Forgotten value</p>
                    </div>
                  </div>

                  <div className="mt-4 min-h-[76px]">
                    <p className="text-3xl font-black text-violet-200">
                      {Number(data.core_point_breakdown.deadcoins || 0).toFixed(1)}
                    </p>

                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                      CorePoint
                    </p>
                  </div>

                  <p className="mb-6 min-h-[64px] text-sm leading-6 text-zinc-400">
                    Forgotten value discovered.
                  </p>

                  <div className="mt-auto min-h-[92px] rounded-2xl border border-fuchsia-300/15 bg-black/25 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-200/60">
                      Earning Logic
                    </p>

                    <p className="mt-2 text-xs leading-5 text-violet-100/80">
                      {cpConfig
                        ? `~${Math.round(cpConfig.deadcoinFirst * cpConfig.multDeadcoin)} CP per unique deadcoin.`
                        : 'Extra CorePoints for reviving true deadcoins.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PROOF LEDGER */}
          <div className="relative z-10 mt-6 rounded-[28px] border border-emerald-400/20 bg-black/20 p-4 sm:p-5">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-emerald-300/80">
                  Proof Ledger
                </p>

                <h4 className="mt-2 text-2xl font-black text-white">
                  CorePoint records behind your PVC
                </h4>
              </div>

              <p className="max-w-xl text-xs leading-5 text-zinc-500">
                Every CorePoint that builds your Personal Value Currency is recorded here across your linked Coincarnation Identity wallets.
              </p>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
              {[
                { key: 'all', label: 'All', mobileLabel: 'All' },
                { key: 'contributions', label: 'Contributions', mobileLabel: 'Contrib.' },
                { key: 'referrals', label: 'Referrals', mobileLabel: 'Refs' },
                { key: 'shares', label: 'Shares', mobileLabel: 'Shares' },
                { key: 'deadcoins', label: 'Deadcoins', mobileLabel: 'Dead' },
              ].map((item) => {
                const active = ledgerFilter === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setLedgerFilter(item.key as typeof ledgerFilter)}
                    className={[
                      item.key === 'all'
                        ? 'col-span-2 w-full lg:col-span-1 lg:w-auto'
                        : 'w-full lg:w-auto',
                      'rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition lg:min-w-[150px]',
                      active
                        ? 'border-emerald-300/50 bg-emerald-300/15 text-emerald-100'
                        : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-emerald-300/30 hover:text-emerald-200',
                    ].join(' ')}
                  >
                    <span className="sm:hidden">{item.mobileLabel}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                );
              })}
            </div>

            {loadingHistory && (
              <div className="relative rounded-2xl border border-white/10 bg-black/20 px-4 py-8 text-center">
                <p className="text-sm font-semibold text-zinc-300">
                  Loading CorePoint activity...
                </p>
              </div>
            )}

            {!loadingHistory && cpHistory.length === 0 && (
              <div className="relative rounded-2xl border border-white/10 bg-black/20 px-4 py-8 text-center">
                <p className="text-sm font-semibold text-zinc-300">
                  No CorePoint activity yet.
                </p>

                <p className="mt-2 text-xs text-zinc-500">
                  Your value signals will appear here after Coincarnations, shares, referrals, and deadcoin revivals.
                </p>
              </div>
            )}

            {!loadingHistory && cpHistory.length > 0 && filteredCpHistory.length === 0 && (
              <div className="relative rounded-2xl border border-white/10 bg-black/20 px-4 py-8 text-center">
                <p className="text-sm font-semibold text-zinc-300">
                  No records in this filter.
                </p>

                <p className="mt-2 text-xs text-zinc-500">
                  Try another CorePoint category.
                </p>
              </div>
            )}

            {!loadingHistory && filteredCpHistory.length > 0 && (
              <>
                <div className="relative grid max-h-[620px] gap-3 overflow-y-auto pr-1">
                  {[...filteredCpHistory]
                    .sort((a: any, b: any) => {
                      const aDate = a?.created_at || a?.day || null;
                      const bDate = b?.created_at || b?.day || null;

                      const aTime = aDate ? new Date(aDate).getTime() : 0;
                      const bTime = bDate ? new Date(bDate).getTime() : 0;

                      return bTime - aTime;
                    })
                    .map((ev: any, i: number) => {
                      const typeLabel =
                        ev.type === 'usd'
                          ? 'Contribution'
                          : ev.type === 'usd_blacklist_reversal'
                            ? 'USD Reversal'
                            : ev.type === 'deadcoin_first'
                              ? 'Deadcoin Revival'
                              : ev.type === 'deadcoin_blacklist_reversal'
                                ? 'Deadcoin Reversal'
                                : ev.type === 'share'
                                  ? 'Share Signal'
                                  : ev.type === 'referral_signup'
                                    ? 'Referral Signup'
                                    : ev.type || 'Other';

                      let detail = '';

                      if (ev.type === 'usd') {
                        detail = `Capital revived · $${Number(ev.value || 0).toFixed(2)}`;
                      } else if (ev.type === 'usd_blacklist_reversal') {
                        detail = 'Value adjusted after blacklist';
                      } else if (ev.type === 'share') {
                        detail = ev.channel
                          ? `Visibility generated · ${String(ev.channel).toUpperCase()}`
                          : 'Visibility generated';
                      } else if (ev.type === 'deadcoin_first') {
                        detail = ev.token_contract
                          ? `Deadcoin discovered · ${shorten(ev.token_contract)}`
                          : 'Deadcoin discovered';
                      } else if (ev.type === 'deadcoin_blacklist_reversal') {
                        detail = ev.token_contract
                          ? `Deadcoin bonus reversed · ${shorten(ev.token_contract)}`
                          : 'Deadcoin bonus reversed';
                      } else if (ev.type === 'referral_signup') {
                        detail = ev.ref_wallet
                          ? `Network expanded · ${shorten(ev.ref_wallet)}`
                          : 'Network expanded';
                      } else {
                        detail = ev.detail || 'Value signal recorded';
                      }

                      const dateStr = ev.created_at || ev.day || null;
                      const points = Number(ev.points || 0);

                      const badgeClass =
                        ev.type === 'usd'
                          ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200'
                          : ev.type === 'usd_blacklist_reversal'
                            ? 'border-red-400/25 bg-red-400/10 text-red-200'
                            : ev.type === 'deadcoin_first'
                              ? 'border-amber-400/25 bg-amber-400/10 text-amber-200'
                              : ev.type === 'deadcoin_blacklist_reversal'
                                ? 'border-red-400/25 bg-red-400/10 text-red-200'
                                : ev.type === 'share'
                                  ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                                  : ev.type === 'referral_signup'
                                    ? 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-200'
                                    : 'border-white/10 bg-white/[0.04] text-zinc-300';

                      return (
                        <div
                          key={`${ev.type || 'event'}-${dateStr || i}-${i}`}
                          className="group rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-emerald-300/25 hover:bg-emerald-300/[0.03]"
                        >
                          <div>
                            {/* Mobile Compact View */}
                            <div className="lg:hidden">
                              <div className="flex items-center gap-2">
                                <p className="text-base font-black text-emerald-300">
                                  {points > 0 ? '+' : ''}
                                  {points.toFixed(1)} CP
                                </p>

                                <span className="text-xs text-zinc-500">·</span>

                                <span
                                  className={[
                                    'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide',
                                    badgeClass,
                                  ].join(' ')}
                                >
                                  {typeLabel}
                                </span>
                              </div>

                              <p className="mt-2 truncate text-sm font-semibold text-zinc-200">
                                {detail || '-'}
                              </p>

                              <p className="mt-1 text-[11px] font-medium text-zinc-500">
                                {dateStr ? formatDate(dateStr) : '-'} ·{' '}
                                {ev.wallet_address ? shorten(ev.wallet_address) : '-'}
                              </p>
                            </div>

                            {/* Desktop Detailed View */}
                            <div className="hidden lg:grid lg:grid-cols-[0.7fr_0.9fr_1.2fr_0.8fr_0.9fr] lg:items-center lg:gap-5">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                                  Points
                                </p>

                                <p className="mt-1 text-xl font-black text-emerald-300">
                                  +{points.toFixed(1)} CP
                                </p>
                              </div>

                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                                  Type
                                </p>

                                <span
                                  className={[
                                    'mt-1 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide',
                                    badgeClass,
                                  ].join(' ')}
                                >
                                  {typeLabel}
                                </span>
                              </div>

                              <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                                  Detail
                                </p>

                                <p className="mt-1 truncate font-semibold text-zinc-200">
                                  {detail || '-'}
                                </p>
                              </div>

                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                                  Date
                                </p>

                                <p className="mt-1 font-semibold text-zinc-200">
                                  {dateStr ? formatDate(dateStr) : '-'}
                                </p>
                              </div>

                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                                  Wallet
                                </p>

                                <p className="mt-1 font-mono text-xs font-semibold text-zinc-300">
                                  {ev.wallet_address ? shorten(ev.wallet_address) : '-'}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {filteredCpHistory.length > 6 && (
                  <div className="mt-2 flex items-center justify-center sm:hidden">
                    <span className="animate-pulse text-[11px] font-semibold tracking-wide text-cyan-300/70">
                      Scroll for more ↓
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* PVC Composition */}
          {data.core_point_breakdown && (
            <div className="relative z-10 mt-6 rounded-[28px] border border-white/10 bg-black/15 px-4 py-5 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.3em] text-indigo-300/80">
                    PVC Composition
                  </p>

                  <h4 className="mt-2 text-xl font-black text-white sm:text-2xl">
                    CorePoint distribution
                  </h4>
                </div>

                <p className="max-w-md text-sm leading-6 text-zinc-500 sm:text-right">
                  Net breakdown of the value signals building your Personal Value Currency.
                </p>
              </div>

              <div className="mt-5">
                <CorePointChart data={data.core_point_breakdown} />
              </div>
            </div>
          )}
        </motion.section>
        {/* 🏆 Global Leaderboard */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="relative mb-5 w-full"
        >
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
      {/* ✅ Fee Confirm Modal */}
      {feeConfirmOpen && pendingClaim && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => {
              if (isClaiming) return;
              setFeeConfirmOpen(false);
              setPendingClaim(null);
            }}
          />
          <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-5">
            <h4 className="text-white font-extrabold text-xl text-center">
              Confirm Session Fee
            </h4>

            <p className="text-gray-300 text-sm mt-3 text-center leading-relaxed">
              To start a new claim session, a one-time fee of{" "}
              <span className="text-purple-300 font-semibold">~{FEE_SOL} SOL</span>{" "}
              is required.
            </p>

            <div className="mt-4 bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-sm text-gray-300 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-400">Destination</span>
                <span className="font-mono text-xs break-all text-white">
                  {pendingClaim.destination}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-400">Claim amount</span>
                <span className="font-semibold text-white">
                  {pendingClaim.claimAmountRaw} MEGY
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-400">Scope</span>
                <span className="font-semibold text-white">
                  {pendingClaim.phaseId === 0 ? 'All finalized phases' : String(selectedScopeLabel)}
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-400 italic text-center mt-3">
              Next claims in the same session are free.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                disabled={isClaiming}
                onClick={() => {
                  if (isClaiming) return;
                  setFeeConfirmOpen(false);
                  setPendingClaim(null);
                }}
                className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-white font-semibold py-3 rounded-xl disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                disabled={isClaiming}
                onClick={confirmAndPayFeeThenExecute}
                className="bg-gradient-to-r from-purple-600 to-pink-500 hover:scale-[1.02] transition-all text-white font-extrabold py-3 rounded-xl disabled:opacity-50"
              >
                {isClaiming ? 'Paying…' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Refund Fee Confirm Modal */}
      {refundFeeConfirmOpen && pendingRefund && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => {
              if (refundingContributionId != null) return;
              setRefundFeeConfirmOpen(false);
              setPendingRefund(null);
              setRefundFeeStep('idle');
            }}
          />
          <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-5">
            <h4 className="text-white font-extrabold text-xl text-center">
              Confirm Refund Request Fee
            </h4>

            <p className="text-gray-300 text-sm mt-3 text-center leading-relaxed">
              Refund requests for blacklisted contributions require a small processing fee of{' '}
              <span className="text-fuchsia-300 font-semibold">
                ~{pendingRefund.refundFeeSol.toFixed(6)} SOL
              </span>.
            </p>

            <div className="mt-4 bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-sm text-gray-300 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-400">Asset</span>
                <span className="font-semibold text-white">
                  {pendingRefund.tokenSymbol || 'Token'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-400">Contribution ID</span>
                <span className="font-mono text-xs text-white">
                  {pendingRefund.contributionId}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-400">Fee</span>
                <span className="font-semibold text-white">
                  ~{pendingRefund.refundFeeSol.toFixed(6)} SOL
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-400 italic text-center mt-3">
              This fee covers the network and processing cost of the refund flow.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                disabled={
                  refundFeeStep === 'paying' ||
                  refundFeeStep === 'confirming' ||
                  refundFeeStep === 'signing' ||
                  refundFeeStep === 'submitting' ||
                  refundFeeStep === 'submitted'
                }
                onClick={() => {
                  if (refundingContributionId != null) return;
                  setRefundFeeConfirmOpen(false);
                  setPendingRefund(null);
                  setRefundFeeStep('idle');
                }}
                className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-white font-semibold py-3 rounded-xl disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={refundingContributionId != null}
                onClick={confirmRefundFeeThenRequest}
                className="bg-gradient-to-r from-fuchsia-600 to-pink-500 hover:scale-[1.02] transition-all text-white font-extrabold py-3 rounded-xl disabled:opacity-50"
              >
                {
                  refundFeeStep === 'paying'
                    ? 'Paying...'
                    : refundFeeStep === 'confirming'
                    ? 'Confirming...'
                    : refundFeeStep === 'signing'
                    ? 'Waiting for signature...'
                    : refundFeeStep === 'submitting'
                    ? 'Submitting...'
                    : refundFeeStep === 'paid'
                    ? 'Fee Paid'
                    : refundFeeStep === 'submitted'
                    ? 'Submitted'
                    : 'Continue'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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

function shorten(addr: any) {
  const s = String(addr ?? '').trim();
  if (!s) return '-';
  if (s.length <= 12) return s;
  return s.slice(0, 6) + '...' + s.slice(-4);
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

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function userFriendlyError(msg: string) {
  const m = String(msg || '').trim();

  // Claim / session
  if (m === 'CLAIM_NOT_LIVE') {
    return 'Claim is not available yet. MEGY token is not live.';
  }
  if (m === 'CLAIM_NOT_OPEN') {
    return 'Claiming is currently closed.';
  }
  if (m === 'DB_ERROR_CLAIM_OPEN_CHECK') {
    return 'Claim status could not be verified. Please try again shortly.';
  }
  if (m === 'SESSION_DESTINATION_MISMATCH') {
    return 'Claim destination changed during the session. Please start the claim again.';
  }
  if (m === 'SESSION_PHASE_MISMATCH') {
    return 'Selected claim phase changed during the session. Please start the claim again.';
  }
  if (m === 'SESSION_NOT_OPEN') {
    return 'Your claim session is no longer active. Please start again.';
  }
  if (m === 'SESSION_NOT_FOUND') {
    return 'Claim session could not be found. Please start again.';
  }
  if (m === 'SESSION_WALLET_MISMATCH') {
    return 'Claim session does not belong to the connected wallet. Please reconnect and try again.';
  }
  if (m === 'SESSION_ALREADY_OPEN') {
    return 'A claim session is already open. Please refresh and try again.';
  }

  // Wallet / RPC / transaction
  if (m === 'WALLET_NOT_CONNECTED') {
    return 'Please connect your wallet.';
  }
  if (m === 'RPC_CONNECTION_MISSING') {
    return 'RPC connection is missing. Please retry.';
  }
  if (m === 'WALLET_SEND_TX_UNAVAILABLE') {
    return 'Your wallet cannot send this transaction. Please reconnect and try again.';
  }
  if (m === 'FEE_TX_CONFIRM_TIMEOUT') {
    return 'Fee payment is taking longer than usual. Please retry.';
  }
  if (m === 'FEE_TX_FAILED') {
    return 'Fee transaction failed. Please retry.';
  }
  if (m === 'FEE_TX_TOO_OLD') {
    return 'Fee transaction is too old. Please start a new claim session.';
  }
  if (m === 'FEE_TX_NOT_FOUND') {
    return 'Fee transaction could not be found yet. Please try again.';
  }
  if (m === 'FEE_TRANSFER_NOT_DETECTED') {
    return 'Fee transfer could not be detected. Please retry after a few seconds.';
  }
  if (m === 'FEE_AMOUNT_TOO_LOW') {
    return 'Fee payment amount is lower than required. Please start again.';
  }
  if (m === 'FEE_SIGNATURE_ALREADY_USED') {
    return 'This fee transaction was already used. Please press Claim again.';
  }

  // Claim execution
  if (m === 'BAD_AMOUNT') {
    return 'Claim amount is invalid.';
  }
  if (m === 'BAD_PHASE_ID') {
    return 'Selected claim phase is invalid.';
  }
  if (m === 'BAD_MEGY_DECIMALS') {
    return 'MEGY token configuration is invalid.';
  }
  if (m === 'MISSING_TREASURY_SECRET') {
    return 'Claim treasury is not configured yet.';
  }
  if (m === 'NO_CLAIMABLE_BALANCE') {
    return 'No claimable MEGY balance is available.';
  }
  if (m === 'AMOUNT_EXCEEDS_PHASE_CLAIMABLE') {
    return 'Claim amount exceeds the selected snapshot balance.';
  }
  if (m === 'AMOUNT_EXCEEDS_TOTAL_CLAIMABLE') {
    return 'Claim amount exceeds your total claimable balance.';
  }
  if (m === 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST') {
    return 'This claim attempt was reused with different details. Please start again.';
  }
  if (m === 'CLAIM_TX_FAILED') {
    return 'Claim transaction failed on-chain. Please retry.';
  }
  if (m === 'DB_RESERVATION_FAILED') {
    return 'Claim could not be reserved. Please retry.';
  }
  if (m === 'DB_FINALIZE_FAILED_AFTER_TRANSFER') {
    return 'Claim transaction succeeded, but final recording needs review. Please contact support.';
  }
  if (m.startsWith('SESSION_START_FAILED')) {
    return 'Could not open claim session. Please retry.';
  }
  if (m.startsWith('CLAIM_EXECUTE_FAILED')) {
    return 'Claim could not be executed. Please retry.';
  }

  // Refund
  if (m === 'REFUND_NOT_AVAILABLE') {
    return 'Refund is not available for this contribution.';
  }
  if (m === 'ALREADY_REFUNDED') {
    return 'This contribution was already refunded.';
  }
  if (m.startsWith('REFUND_REQUEST_FAILED')) {
    return 'Refund request could not be recorded.';
  }
  if (m === 'REFUND_PREPARE_FAILED') {
    return 'Refund signing challenge could not be prepared.';
  }
  if (m === 'CHALLENGE_NOT_FOUND') {
    return 'Refund signing challenge was not found. Please try again.';
  }
  if (m === 'CHALLENGE_ALREADY_USED') {
    return 'This refund signing challenge was already used. Please try again.';
  }
  if (m === 'CHALLENGE_EXPIRED') {
    return 'Refund signing challenge expired. Please try again.';
  }
  if (m === 'INVALID_SIGNATURE') {
    return 'Signature verification failed.';
  }
  if (m === 'REFUND_ONLY_FOR_BLACKLIST') {
    return 'Refund requests are only available for blacklist-based invalidations.';
  }
  if (m === 'REFUND_FEE_REQUIRED') {
    return 'Refund fee must be paid before submitting the request.';
  }
  if (m === 'REFUND_FEE_PREPARE_FAILED' || m.startsWith('REFUND_FEE_PREPARE_FAILED')) {
    return 'Refund fee information could not be prepared.';
  }
  if (m === 'TREASURY_WALLET_MISSING') {
    return 'Refund treasury wallet is not configured.';
  }
  if (m === 'FEE_TX_WALLET_MISMATCH') {
    return 'Refund fee transaction does not belong to the connected wallet.';
  }
  if (m === 'REFUND_FEE_PAYMENT_NOT_VALID') {
    return 'Refund fee payment could not be verified.';
  }
  if (m.startsWith('REFUND_FEE_CONFIRM_FAILED')) {
    return 'Refund fee payment could not be confirmed.';
  }
  if (m === 'REFUND_NOT_REQUESTED') {
    return 'Refund is not yet in requested state.';
  }
  if (m === 'FEE_TX_SIGNATURE_ALREADY_USED') {
    return 'This refund fee transaction was already used.';
  }
  if (m === 'REFUND_STATUS_NOT_REQUESTABLE') {
    return 'This refund request is no longer in a requestable state.';
  }
  if (m === 'REFUND_FEE_NOT_PAID') {
    return 'Refund fee has not been paid yet.';
  }

  // Generic
  if (m === 'BAD_REQUEST') {
    return 'Request payload is invalid.';
  }
  if (m === 'INTERNAL_ERROR') {
    return 'Internal server error.';
  }

  return m || 'Unexpected error. Please retry.';
}