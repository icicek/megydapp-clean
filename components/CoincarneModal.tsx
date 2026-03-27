// components/CoincarneModal.tsx
'use client';
import ShareCenter from '@/components/share/ShareCenter';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getMint,
} from '@solana/spl-token';
import { PublicKey, Transaction, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';
import { connection } from '@/lib/solanaConnection';
import { useInternalBalance, quantize } from '@/hooks/useInternalBalance';
import { getDestAddress, __dest_debug__ } from '@/lib/chain/env';
import { getTokenMeta } from '@/lib/solana/tokenMeta';
import type { SharePayload } from '@/components/share/intent';


type TokenStatusApi =
  | 'healthy'
  | 'walking_dead'
  | 'deadcoin'
  | 'redlist'
  | 'blacklist'
  | 'unknown';

type CoincarnationResultProps = {
  tokenFrom: string;
  number: number;
  txId: string;
  referral?: string;
  voteEligible?: boolean;
  tokenStatus?: TokenStatusApi | null;
  onRecoincarnate: () => void;
  onGoToProfile: () => void;
};

const CoincarnationResult = dynamic(
  () => import('@/components/CoincarnationResult'),
  { ssr: false }
) as React.ComponentType<CoincarnationResultProps>;

type ConfirmModalProps = {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  usdValue: number;
  tokenSymbol: string;
  amount: number;
  tokenCategory: 'healthy' | 'deadcoin' | 'unknown';
  priceSources: { price: number; source: string }[];
  fetchStatus: 'loading' | 'found' | 'not_found' | 'error';
  tokenMint?: string;
  currentWallet?: string | null;
  onDeadcoinVote: (vote: 'yes' | 'no') => void;
  tokenContract?: string;
  networkLabel?: string;
  confirmBusy?: boolean;
  confirmLabel?: string;
};

function getReferralFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const r = url.searchParams.get('r');
    return r && r.trim() ? r.trim() : null;
  } catch {
    return null;
  }
}

const ConfirmModal = dynamic(
  () => import('@/components/ConfirmModal'),
  { ssr: false }
) as React.ComponentType<ConfirmModalProps>;

type StatusApiDecision = {
  status?: TokenStatusApi | null;
  zone: 'healthy' | 'wd_gray' | 'wd_vote' | 'deadzone';
  highLiq: boolean;
  voteEligible: boolean;
};

type StatusApiResponse = {
  status: TokenStatusApi | null;
  decision?: StatusApiDecision;
  registry?: {
    status?: TokenStatusApi | null;
  } | null;
  statusAt?: string | null;
};

function resolveLatestStatus(data: StatusApiResponse | null | undefined): TokenStatusApi | null {
  if (!data) return null;

  const registryStatus = data?.registry?.status ?? null;
  const apiStatus = data?.status ?? null;

  return registryStatus ?? apiStatus ?? null;
}

/* -------- Local types & consts -------- */

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
type TokenCategory = 'healthy' | 'deadcoin' | 'unknown';

interface TokenInfo {
  mint: string;
  amount: number;
  symbol?: string;
  logoURI?: string;
}

interface CoincarneModalProps {
  token: TokenInfo;
  onClose: () => void;
  refetchTokens?: () => void;
  onGoToProfileRequest?: () => void;
}

type PriceView = {
  fetchStatus: 'loading' | 'found' | 'not_found' | 'error';
  usdValue: number;
  priceSources: { price: number; source: string }[];
};

// uiAmount → u64 string (decimals’e göre)
function toU64(ui: string | number, d: number): string {
  const s = String(ui ?? '0').replace(/[^0-9.]/g, '');
  const [i = '0', f = ''] = s.split('.');
  const frac = (f + '0'.repeat(d)).slice(0, d);
  const joined = `${i}${frac}`.replace(/^0+/, '');
  return joined.length ? joined : '0';
}

function solToLamports(ui: string | number): number {
  const s = String(ui ?? '0').trim();
  const [i = '0', f = ''] = s.split('.');
  const frac = (f + '0'.repeat(9)).slice(0, 9);
  const joined = (i + frac).replace(/^0+/, '') || '0';
  const n = Number(joined);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('INVALID_LAMPORTS');
  return n;
}

async function simulateTxOrThrow(connection: any, tx: any) {
  // ✅ Default: simulation OFF in production
  // Enable only when you explicitly set NEXT_PUBLIC_ENABLE_SIMULATION="1"
  const enabled =
    typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_ENABLE_SIMULATION === '1');

  if (!enabled) return;

  // ensure blockhash
  const latest = await connection.getLatestBlockhash('processed');
  tx.recentBlockhash = latest.blockhash;

  // web3.js version differences: try common call shapes
  try {
    const sim = await (connection as any).simulateTransaction(tx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: 'processed',
    });

    if (sim?.value?.err) {
      console.error('❌ simulate err:', sim.value.err, sim.value.logs);
      throw new Error('SIMULATION_FAILED');
    }
    return;
  } catch (e1) {
    // fallback signature: (tx, signers?, commitment?)
    try {
      const sim = await (connection as any).simulateTransaction(tx, undefined, 'processed');
      if (sim?.value?.err) {
        console.error('❌ simulate err (fallback):', sim.value.err, sim.value.logs);
        throw new Error('SIMULATION_FAILED');
      }
      return;
    } catch (e2) {
      console.warn('⚠️ simulateTransaction incompatible (skipped):', e1, e2);
      return;
    }
  }
}

async function fetchLatestTokenStatus(mint: string): Promise<StatusApiResponse | null> {
  try {
    const url = `/api/status?mint=${encodeURIComponent(mint)}&includeMetrics=1&_ts=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
      throw new Error(`status ${res.status}`);
    }

    const data = (await res.json()) as StatusApiResponse;
    return data;
  } catch (e) {
    console.warn('⚠️ latest token status fetch failed:', e);
    return null;
  }
}

export default function CoincarneModal({
  token,
  onClose,
  refetchTokens,
  onGoToProfileRequest,
}: CoincarneModalProps) {
  const { publicKey, sendTransaction } = useWallet();

  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [shareContext, setShareContext] = useState<
    'success' | 'contribution' | 'profile' | 'leaderboard'
  >('success');
  const [shareTxId, setShareTxId] = useState<string | null>(null);

  const handleShare = (payload: SharePayload, txId?: string) => {
    if (!payload) {
      console.warn('⚠️ handleShare called without payload');
      return;
    }
    setSharePayload(payload);
    setShareContext('success');
    setShareTxId(txId ?? null);
    setShareOpen(true);
  };

  /* ------------------ DEST DEBUG + DEST ADDRESS ------------------ */
  const [destSol, setDestSol] = useState<PublicKey | null>(null);
  const [destErr, setDestErr] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('[DEST DEBUG]', __dest_debug__());
    }
  }, []);

  /* ------------------ LOCAL UI STATE ------------------ */
  const [loading, setLoading] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [precheckMsg, setPrecheckMsg] = useState<string | null>(null);

  const [resultData, setResultData] = useState<{
    tokenFrom: string;
    number: number;
    txId: string;
    referralCode?: string | null;
    voteEligible?: boolean;
    tokenStatus?: TokenStatusApi | null;
  } | null>(null);
  
  const [statusInfo, setStatusInfo] = useState<StatusApiResponse | null>(null);  

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [priceView, setPriceView] = useState<PriceView>({
    fetchStatus: 'loading',
    usdValue: 0,
    priceSources: [],
  });
  const [tokenCategory, setTokenCategory] = useState<TokenCategory>('unknown');


  /* ------------------ SYMBOL RESOLUTION ------------------ */
  const [displaySymbol, setDisplaySymbol] = useState<string>(
    (token.symbol || token.mint.slice(0, 4)).toLocaleUpperCase('en-US')
  );

  // Nihai çözüm: önce /api/symbol (Jupiter→DexScreener→On-chain), yoksa tokenMeta
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const r = await fetch(`/api/symbol?mint=${encodeURIComponent(token.mint)}`, { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          const sym = (j?.symbol || '').toString().trim();
          if (!off && sym) {
            setDisplaySymbol(sym);
            return;
          }
        }
      } catch {}
      // Fallback: eski meta
      try {
        const meta = await getTokenMeta(token.mint, token.symbol);
        if (!off && meta?.symbol) setDisplaySymbol(meta.symbol);
      } catch {}
    })();
    return () => { off = true; };
  }, [token.mint, token.symbol]);

  /* ------------------ SOL CHECK & BALANCE ------------------ */
  const isSOLToken = useMemo(
    () => token.mint === 'SOL' || displaySymbol.toUpperCase() === 'SOL',
    [token.mint, displaySymbol]
  );

  const {
    balance: internalBalance,
    loading: balLoading,
    error: balError,
    isSOL: isSolFromHook,
  } = useInternalBalance(token.mint, { isSOL: isSOLToken });

  // ------------------ STATUS / VOTE INFO ------------------
  useEffect(() => {
    let abort = false;
    const mint = isSOLToken ? WSOL_MINT : token.mint;

    (async () => {
      const data = await fetchLatestTokenStatus(mint);
      if (abort) return;
      setStatusInfo(data);
    })();

    return () => {
      abort = true;
    };
  }, [token.mint, isSOLToken]);

  useEffect(() => {
    try {
      const addr = getDestAddress('solana');
      setDestSol(new PublicKey(addr));
      setDestErr(null);
    } catch (e: any) {
      setDestSol(null);
      setDestErr('Destination address is not configured. Please set NEXT_PUBLIC_DEST_SOL.');
      console.warn('NEXT_PUBLIC_DEST_SOL error:', e?.message || e);
    }
  }, []);

  /* ------------------ CONFIRM PREPARE (PRICING) ------------------ */
  const handlePrepareConfirm = async () => {
    if (!publicKey || !amountInput) return;
  
    setPrecheckMsg(null);
  
    const amountToSend = Number(String(amountInput).replace(',', '.'));
    if (!Number.isFinite(amountToSend) || amountToSend <= 0) return;
  
    try {
      // --- Precheck: SOL sufficiency (fees / ATA rent) ---
      const solLamports = await connection.getBalance(publicKey, 'processed');
  
      const FEE_BUF_LAMPORTS = 120_000; // ~0.00012 SOL
      const TOKEN_ACCOUNT_SIZE = 165;
  
      if (isSOLToken) {
        // For SOL transfer, user pays fee from SOL too
        const sendLamports = solToLamports(amountInput);
  
        if (solLamports < sendLamports + FEE_BUF_LAMPORTS) {
          setPrecheckMsg(
            'Not enough SOL to cover the transfer + network fee. Please add a little SOL (e.g., 0.0002 SOL).'
          );
          return;
        }
      } else {
        // SPL: may need ATA creation on destination
        if (!destSol) {
          setPrecheckMsg('Destination address is missing. Please set NEXT_PUBLIC_DEST_SOL.');
          return;
        }
  
        const mint = new PublicKey(token.mint);
  
        // which program? (Token2022 vs classic)
        const mintAcc = await connection.getAccountInfo(mint, 'confirmed');
        if (!mintAcc) {
          setPrecheckMsg('Token mint not found on this network.');
          return;
        }
        const is2022 = mintAcc.owner.equals(TOKEN_2022_PROGRAM_ID);
        const program = is2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  
        const toATA = getAssociatedTokenAddressSync(mint, destSol, false, program);
        const toAtaInfo = await connection.getAccountInfo(toATA, 'confirmed');
  
        if (!toAtaInfo) {
          const rentLamports = await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE);
          const need = rentLamports + FEE_BUF_LAMPORTS;
  
          if (solLamports < need) {
            setPrecheckMsg(
              `Not enough SOL to create the destination token account (ATA). Please add ~${(need / 1e9).toFixed(4)} SOL.`
            );
            return;
          }
        } else {
          if (solLamports < FEE_BUF_LAMPORTS) {
            setPrecheckMsg('Not enough SOL to pay transaction fees. Please add a little SOL.');
            return;
          }
        }
      }
  
      // --- Pricing fetch (only if precheck passes) ---
      setLoading(true);
      setPriceView({ fetchStatus: 'loading', usdValue: 0, priceSources: [] });
  
      const mint = isSOLToken ? WSOL_MINT : token.mint;
      const qs = new URLSearchParams({ mint, amount: String(amountToSend) });
  
      const res = await fetch(`/api/proxy/price?${qs.toString()}`, { cache: 'no-store' });
      const parsed = await readJsonSafe(res);

      console.log('🧪 /api/proxy/price response:', {
        status: parsed.status,
        contentType: parsed.contentType,
        data: parsed.data,
        rawPreview: parsed.raw.slice(0, 300),
      });

      if (!parsed.ok || !parsed.data) {
        throw new Error(
          `PRICE_API_NON_JSON_OR_HTTP_${parsed.status}: ${parsed.raw.slice(0, 120)}`
        );
      }

      const json = parsed.data;
      const ok = !!json?.ok || !!json?.success;

      if (!ok) {
        setPriceView({
          fetchStatus: json?.status === 'not_found' ? 'not_found' : 'error',
          usdValue: 0,
          priceSources: [],
        });
        setTokenCategory('deadcoin');
        setConfirmModalOpen(true);
        return;
      }

      const unit = Number(json?.priceUsd ?? 0);
      const summed = Number(json?.usdValue ?? 0);
      const total = summed > 0 ? summed : unit * amountToSend;
  
      const sources: { price: number; source: string }[] =
        Array.isArray(json?.sources) && json.sources.length
          ? json.sources
          : unit > 0 && json?.source
          ? [{ source: String(json.source), price: unit }]
          : [];
  
      setPriceView({
        fetchStatus: 'found',
        usdValue: Number.isFinite(total) ? total : 0,
        priceSources: sources,
      });
  
      setTokenCategory('healthy');
      setConfirmModalOpen(true);
    } catch (err: any) {
      console.error('❌ Error preparing confirmation:', err);
      alert(`❌ Prepare confirm failed: ${String(err?.message || err)}`);
      setPriceView({ fetchStatus: 'error', usdValue: 0, priceSources: [] });
      setTokenCategory('unknown');
      setConfirmModalOpen(true);
    } finally {
      setLoading(false);
    }
  };

  function explorerUrlForSig(sig: string) {
    const ep = (connection as any)?.rpcEndpoint || '';
    const isDevnet = ep.includes('devnet');
    const isTestnet = ep.includes('testnet');
  
    // Solscan mainnet default; devnet/testnet için param ekleyelim
    if (isDevnet) return `https://solscan.io/tx/${sig}?cluster=devnet`;
    if (isTestnet) return `https://solscan.io/tx/${sig}?cluster=testnet`;
    return `https://solscan.io/tx/${sig}`;
  }
  
  async function pollSigOrThrow(sig: string, timeoutMs = 35_000, intervalMs = 900) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const st = await connection.getSignatureStatuses([sig], {
        searchTransactionHistory: false, // ✅ daha hızlı
      });
      const s = st?.value?.[0];
  
      if (s?.err) throw new Error(`TX_FAILED:${JSON.stringify(s.err)}`);
  
      // ✅ processed bile gelirse “ağa düştü” diyebiliriz
      if (s?.confirmationStatus === 'processed' || s?.confirmationStatus === 'confirmed' || s?.confirmationStatus === 'finalized') {
        return true;
      }
  
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error('TX_NOT_CONFIRMED_TIMEOUT');
  }

  function humanizeTxError(e: any) {
    const msg = String(e?.message || e);
  
    if (msg.includes('LEAVE_SOL_FOR_FEES')) return 'Please leave a little SOL for network fees.';
    if (msg.includes('Invalid Arguments'))
      return 'Wallet/RPC rejected the request (invalid arguments). Please retry. If it continues, reconnect wallet.';
    if (msg.includes('INSUFFICIENT_SOL_FOR_ATA_RENT')) return 'Not enough SOL to create the destination token account (ATA). Add ~0.003 SOL.';
    if (msg.includes('INSUFFICIENT_SOL_FOR_TX_FEES')) return 'Not enough SOL to pay transaction fees. Add a little SOL.';
    if (msg.includes('SOURCE_ATA_MISSING'))
      return 'You do not have a token account for this asset (no balance / ATA missing).';
    if (msg.includes('AMOUNT_TOO_SMALL')) return 'Amount is too small.';
    if (msg.includes('SIMULATION_FAILED')) return 'Transaction simulation failed. (Check SOL balance / token accounts / amount.)';
    if (msg.includes('TX_NOT_CONFIRMED_TIMEOUT'))
      return 'Transaction was sent but not confirmed in time. Please check it on Explorer and try again if needed.';
    if (msg.includes('mint-not-found')) return 'Token mint not found on this network.';
    return msg;
  }

  async function readJsonSafe(res: Response) {
    const contentType = res.headers.get('content-type') || '';
    const raw = await res.text();
  
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = null;
    }
  
    return {
      ok: res.ok,
      status: res.status,
      contentType,
      data,
      raw,
    };
  }

  /* ------------------ SEND TX ------------------ */
  const handleSend = async () => {
    if (!publicKey || !amountInput) return;

    setLoading(true);

    try {
      const mintForStatus = isSOLToken ? WSOL_MINT : token.mint;

      // Final guard: always re-check latest token status before building/sending tx
      const latestStatusData = await fetchLatestTokenStatus(mintForStatus);
      const latestStatus = resolveLatestStatus(latestStatusData);

      // keep parent state fresh as well
      setStatusInfo(latestStatusData);

      if (latestStatus === 'redlist' || latestStatus === 'blacklist') {
        alert(
          latestStatus === 'blacklist'
            ? '⛔ This token is currently blacklisted. Coincarnation is blocked.'
            : '⚠️ This token is currently redlisted. Coincarnation is blocked.'
        );
        return;
      }

      const amountToSend = Number(String(amountInput).replace(',', '.'));
      if (isNaN(amountToSend) || amountToSend <= 0) return;

      if (isSOLToken && internalBalance) {
        const feeReserve = 0.0002; // safe buffer
        if (internalBalance.amount - amountToSend < feeReserve) {
          throw new Error('LEAVE_SOL_FOR_FEES');
        }
      }

      if (!destSol) {
        alert('❌ Destination address missing. Please set NEXT_PUBLIC_DEST_SOL.');
        return;
      }

      let signature: string;

      if (isSOLToken) {
        const lamports = solToLamports(amountInput);

        const tx = new Transaction();

        tx.add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2_000 }),
          ComputeBudgetProgram.setComputeUnitLimit({ units: 40_000 })
        );

        tx.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: destSol,
            lamports,
          })
        );

        tx.feePayer = publicKey;

        signature = await sendTransaction(tx, connection, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        });
      } else {
        const mint = new PublicKey(token.mint);

        // 1) Which token program?
        const mintAcc = await connection.getAccountInfo(mint, 'confirmed');
        if (!mintAcc) throw new Error('mint-not-found');

        const is2022 = mintAcc.owner.equals(TOKEN_2022_PROGRAM_ID);
        const program = is2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

        const solBal = await connection.getBalance(publicKey, 'processed');
        console.log('💰 SOL balance (lamports):', solBal);

        // 2) Decimals
        const mintInfo = await getMint(connection, mint, 'confirmed', program);
        const decimals = mintInfo.decimals ?? 0;

        // 3) ATA addresses
        const fromATA = getAssociatedTokenAddressSync(mint, publicKey, false, program);
        const toATA = getAssociatedTokenAddressSync(mint, destSol, false, program);

        const fromAtaInfo = await connection.getAccountInfo(fromATA, 'confirmed');
        if (!fromAtaInfo) {
          throw new Error('SOURCE_ATA_MISSING');
        }

        const ixs: any[] = [];

        const toAtaInfo = await connection.getAccountInfo(toATA, 'confirmed');
        console.log('🏦 toATA exists?:', !!toAtaInfo);

        const FEE_BUF_LAMPORTS = 120_000;
        const TOKEN_ACCOUNT_SIZE = 165;

        const rentLamports =
          await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE);

        const needIfAtaMissing = rentLamports + FEE_BUF_LAMPORTS;
        const needIfAtaExists = FEE_BUF_LAMPORTS;

        if (!toAtaInfo && solBal < needIfAtaMissing) {
          throw new Error('INSUFFICIENT_SOL_FOR_ATA_RENT');
        }

        if (toAtaInfo && solBal < needIfAtaExists) {
          throw new Error('INSUFFICIENT_SOL_FOR_TX_FEES');
        }

        if (!toAtaInfo) {
          ixs.push(
            createAssociatedTokenAccountIdempotentInstruction(
              publicKey,
              toATA,
              destSol,
              mint,
              program
            )
          );
        }

        const raw = BigInt(toU64(amountToSend, decimals));
        if (raw <= 0n) throw new Error('AMOUNT_TOO_SMALL');

        ixs.push(
          createTransferCheckedInstruction(
            fromATA,
            mint,
            toATA,
            publicKey,
            raw,
            decimals,
            [],
            program
          )
        );

        const tx = new Transaction();

        tx.add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 15_000 }),
          ComputeBudgetProgram.setComputeUnitLimit({ units: 120_000 })
        );

        tx.add(...ixs);
        tx.feePayer = publicKey;

        await simulateTxOrThrow(connection as any, tx);

        signature = await sendTransaction(tx, connection, {
          skipPreflight: false,
          preflightCommitment: 'processed',
          maxRetries: 5,
        });

        console.log('✅ sent signature:', signature);
        console.log('🔎 explorer:', explorerUrlForSig(signature));
      }

      console.log('🌐 rpc endpoint:', (connection as any)?.rpcEndpoint);
      console.log('✅ sent signature:', signature);
      console.log('🔎 explorer:', explorerUrlForSig(signature));

      await pollSigOrThrow(signature, 35_000);

      const referralFromUrl = getReferralFromUrl();

      const finalTokenCategory: TokenCategory =
        latestStatus === 'deadcoin'
          ? 'deadcoin'
          : latestStatus === 'healthy' || latestStatus === 'walking_dead'
          ? 'healthy'
          : tokenCategory ?? 'unknown';

      const res = await fetch('/api/coincarnation/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: publicKey.toBase58(),
          token_symbol: displaySymbol,
          token_contract: token.mint,
          network: 'solana',
          token_amount: amountToSend,
          usd_value: priceView.usdValue,
          transaction_signature: signature,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          token_category: finalTokenCategory,
          referral_code: referralFromUrl,
          ref: referralFromUrl,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error('❌ record API HTTP error:', txt);
        alert('❌ Coincarnation record failed. Please try again.');
        return;
      }

      const json = await res.json().catch(() => null);

      if (!json || !json.success) {
        console.error('❌ record API logical error:', json);
        alert('❌ Coincarnation record failed. Please try again.');
        return;
      }

      const userNumber: number = json.number ?? 0;
      const referralCode: string | null = json.referral_code ?? null;

      const stableTxId: string = String(
        json.transaction_signature ??
          json.tx_hash ??
          json.txId ??
          json.tx_id ??
          json.id ??
          signature
      );

      const finalStatusInfo = latestStatusData ?? statusInfo;
      const finalResolvedStatus = resolveLatestStatus(finalStatusInfo);

      setResultData({
        tokenFrom: displaySymbol,
        number: userNumber,
        referralCode,
        txId: stableTxId,
        voteEligible: !!finalStatusInfo?.decision?.voteEligible,
        tokenStatus: finalResolvedStatus,
      });

      setConfirmModalOpen(false);
      refetchTokens?.();

      try {
        await fetch('/api/lv/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mint: token.mint,
            category: finalTokenCategory,
          }),
        }).catch((err) => console.warn('⚠️ lv/apply error:', err));
      } catch (err) {
        console.warn('⚠️ lv/apply outer error:', err);
      }
    } catch (err: any) {
      console.error('❌ Transaction error full:', err);
      alert(`❌ Transaction failed: ${humanizeTxError(err)}`);
    } finally {
      setLoading(false);
    }
  };

  /* ------------------ PERCENT BUTTONS ------------------ */
  const handlePercentage = (percent: number) => {
    if (!internalBalance) return;
    let calculated = (internalBalance.amount * percent) / 100;

    if (isSolFromHook && percent === 100 && calculated > 0.001) {
      calculated -= 0.001;
    }

    calculated = quantize(calculated, internalBalance.decimals);
    setAmountInput(String(calculated));
  };

  useEffect(() => {
    if (resultData) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [resultData]);

  return (
    <>
      {confirmModalOpen && (
        <ConfirmModal
          isOpen={confirmModalOpen}
          onCancel={() => setConfirmModalOpen(false)}
          onConfirm={handleSend}
          usdValue={priceView.usdValue}
          tokenSymbol={displaySymbol}
          amount={parseFloat(amountInput)}
          tokenCategory={tokenCategory ?? 'unknown'}
          priceSources={priceView.priceSources}
          fetchStatus={priceView.fetchStatus}
          tokenMint={isSOLToken ? WSOL_MINT : token.mint}
          currentWallet={publicKey?.toBase58() ?? null}
          onDeadcoinVote={() => {}}
        />
      )}

      {/* 🔹 Ana Coincarne dialog */}
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogOverlay />
        <DialogContent className="z-50 bg-gradient-to-br from-black to-zinc-900 text-white rounded-2xl p-6 max-w-md w-full h-[90vh] overflow-y-auto flex flex-col justify-center">
          <DialogTitle className="sr-only">
            Coincarnate {displaySymbol}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Choose an amount and confirm to convert your token into $MEGY.
          </DialogDescription>

          {resultData ? (
            <CoincarnationResult
              tokenFrom={resultData.tokenFrom}
              number={resultData.number}
              txId={resultData.txId}
              referral={resultData.referralCode ?? undefined}
              voteEligible={resultData.voteEligible}
              tokenStatus={resultData.tokenStatus ?? undefined}
              onRecoincarnate={() => setResultData(null)}
              onGoToProfile={() => {
                onClose();
                onGoToProfileRequest?.();
              }}
            />
          ) : (
            <>
              <h2 className="text-2xl font-bold text-center mb-3">
                🔥 Coincarnate {displaySymbol}
              </h2>

              <p className="text-sm text-gray-400 text-center mb-2">
                {balLoading
                  ? 'Fetching balance…'
                  : balError
                  ? `Balance error: ${balError}`
                  : internalBalance
                  ? `Balance: ${internalBalance.amount.toFixed(4)} ${displaySymbol}`
                  : `Balance: ${token.amount.toFixed(4)} ${displaySymbol}`}
              </p>

              {destErr && (
                <p className="text-xs text-amber-400 text-center mb-2">
                  {destErr}
                </p>
              )}

              <div className="grid grid-cols-4 gap-2 mb-4">
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    className="bg-gradient-to-br from-purple-600 to-pink-500 hover:opacity-90 text-white font-semibold py-2 rounded-lg shadow"
                    onClick={() => handlePercentage(p)}
                    disabled={loading || balLoading || !internalBalance}
                  >
                    {p}%
                  </button>
                ))}
              </div>

              <input
                type="number"
                step="0.000001"
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                  setPrecheckMsg(null);
                }}
                placeholder="Enter amount"
                className="w-full bg-zinc-800 text-white p-3 rounded-lg border border-zinc-600 mb-4"
                disabled={loading}
              />

              <button
                onClick={handlePrepareConfirm}
                disabled={loading || !amountInput || !!destErr}
                className="w-full bg-gradient-to-r from-green-500 via-yellow-400 to-pink-500 text-black font-extrabold py-3 rounded-xl"
              >
                {loading ? '🔥 Coincarnating...' : `🚀 Coincarnate ${displaySymbol} Now`}
              </button>

              {precheckMsg && (
                <p className="mt-2 text-xs text-amber-300 text-center">
                  {precheckMsg}
                </p>
              )}

              <button
                onClick={onClose}
                className="mt-3 w-full text-sm text-red-500 hover:text-white"
                disabled={loading}
              >
                ❌ Not Interested in Global Synergy
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 🔹 ShareCenter'ı Dialog'un DIŞINA aldık */}
      {sharePayload && (
        <ShareCenter
          open={shareOpen && !!sharePayload}
          onOpenChange={setShareOpen}
          payload={sharePayload}
          context={shareContext}
          txId={shareTxId ?? undefined}
          walletBase58={publicKey?.toBase58() ?? null}
        />
      )}
    </>
  );
}
