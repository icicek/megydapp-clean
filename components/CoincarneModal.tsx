// components/CoincarneModal.tsx
'use client';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import dynamic from 'next/dynamic';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getMint,
} from '@solana/spl-token';
import { PublicKey, Transaction, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';
import { useInternalBalance, quantize } from '@/hooks/useInternalBalance';
import { getDestAddress, __dest_debug__ } from '@/lib/chain/env';
import { getTokenMeta } from '@/lib/solana/tokenMeta';

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
  amount?: number;
  usdValue?: number;
  explorerUrl?: string;
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
  errorMessage?: string | null;
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

async function fetchLatestTokenStatus(mint: string): Promise<StatusApiResponse | null> {
  const url = `/api/status?mint=${encodeURIComponent(mint)}&includeMetrics=1&_ts=${Date.now()}`;

  async function readJsonSafeLocal(res: Response) {
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

  try {
    const res = await fetch(url, { cache: 'no-store' });
    const parsed = await readJsonSafeLocal(res);

    if (!parsed.ok || !parsed.data) {
      throw new Error(
        `STATUS_ENDPOINT_NON_JSON_OR_HTTP_${parsed.status}: ${url} :: ${parsed.raw.slice(0, 160)}`
      );
    }

    return parsed.data as StatusApiResponse;
  } catch (e) {
    console.warn('⚠️ latest token status fetch failed:', (e as any)?.message || e);
    throw e;
  }
}

export default function CoincarneModal({
  token,
  onClose,
  refetchTokens,
  onGoToProfileRequest,
}: CoincarneModalProps) {
  const { publicKey, sendTransaction, signTransaction, wallet } = useWallet();
  const { connection } = useConnection();

  const [txStage, setTxStage] = useState<
    'idle' | 'preparing' | 'awaiting_wallet' | 'broadcasting' | 'confirming' | 'recording' | 'success' | 'error'
  >('idle');

  const [txError, setTxError] = useState<string | null>(null);
  const [uiNotice, setUiNotice] = useState<{
    type: 'error' | 'warning' | 'info';
    message: string;
  } | null>(null);

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
    amount?: number;
    usdValue?: number;
    explorerUrl?: string;
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
    setTxError(null);
    setTxStage('preparing');

    const amountToSend = Number(String(amountInput).replace(',', '.'));
    if (!Number.isFinite(amountToSend) || amountToSend <= 0) {
      setTxStage('idle');
      return;
    }

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
          setTxStage('idle');
          return;
        }
      } else {
        // SPL: may need ATA creation on destination
        if (!destSol) {
          setPrecheckMsg('Destination address is missing. Please set NEXT_PUBLIC_DEST_SOL.');
          setTxStage('idle');
          return;
        }

        const mint = new PublicKey(token.mint);

        // which program? (Token2022 vs classic)
        const mintAcc = await connection.getAccountInfo(mint, 'confirmed');
        if (!mintAcc) {
          setPrecheckMsg('Token mint not found on this network.');
          setTxStage('idle');
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
            setTxStage('idle');
            return;
          }
        } else {
          if (solLamports < FEE_BUF_LAMPORTS) {
            setPrecheckMsg('Not enough SOL to pay transaction fees. Please add a little SOL.');
            setTxStage('idle');
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
        setTxStage('idle');
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
      setTxStage('idle');
    } catch (err: any) {
      const friendly = humanizeTxError(err);
      console.error('❌ Error preparing confirmation:', err);
    
      setTxStage('error');
      setTxError(friendly);
      setUiNotice({
        type: 'error',
        message: friendly,
      });
    
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
        searchTransactionHistory: true,
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

  async function confirmSignatureOrThrow(params: {
    signature: string;
    blockhash?: string;
    lastValidBlockHeight?: number;
  }) {
    const { signature, blockhash, lastValidBlockHeight } = params;
  
    try {
      if (blockhash && typeof lastValidBlockHeight === 'number') {
        await connection.confirmTransaction(
          {
            signature,
            blockhash,
            lastValidBlockHeight,
          },
          'confirmed'
        );
        return true;
      }
    } catch (e) {
      console.warn('[confirmSignatureOrThrow] confirmTransaction failed, falling back to polling:', e);
    }
  
    await pollSigOrThrow(signature, 25_000);
    return true;
  }

  function getTxStageLabel(
    stage: 'idle' | 'preparing' | 'awaiting_wallet' | 'broadcasting' | 'confirming' | 'recording' | 'success' | 'error'
  ) {
    switch (stage) {
      case 'preparing':
        return 'Preparing transaction...';
        case 'awaiting_wallet':
          return getWalletName().includes('backpack')
            ? 'Waiting for Backpack approval... Please keep the Backpack popup open.'
            : 'Waiting for wallet approval...';
      case 'broadcasting':
        return 'Broadcasting transaction...';
      case 'confirming':
        return 'Transaction sent. Waiting for blockchain confirmation...';
      case 'recording':
        return 'Recording your Coincarnation...';
      case 'success':
        return 'Coincarnation completed.';
      case 'error':
        return 'Something went wrong.';
      default:
        return '';
    }
  }

  function humanizeTxError(e: any) {
    const msg = String(e?.message || e);
  
    if (msg.includes('STATUS_NON_JSON_OR_HTTP_')) {
      return 'Token status endpoint returned invalid JSON/HTML. Please retry and check server response.';
    }
    if (msg.includes('STATUS_ENDPOINT_NON_JSON_OR_HTTP_')) {
      return 'The /api/status endpoint returned HTML instead of JSON.';
    }
    if (msg.includes('PRICE_API_NON_JSON_OR_HTTP_')) {
      return 'The /api/proxy/price endpoint returned HTML instead of JSON.';
    }
    // Most specific combined/fallback cases first
    if (msg.includes('[wallet-send]') && msg.includes('[wallet-sign-raw]') && msg.includes('[backpack-provider]')) {
      return 'All wallet transaction paths failed. Please reconnect Backpack, reopen the wallet, and try again.';
    }
    if (msg.includes('[wallet-send]') && msg.includes('[wallet-sign-raw]')) {
      return 'Wallet adapter send failed, and raw transaction fallback also failed. Please reconnect your wallet and try again.';
    }
    if (msg.includes('BACKPACK_SIGN_TRANSACTION_UNAVAILABLE')) {
      return 'Backpack does not expose signTransaction in this session. Please reconnect Backpack and try again.';
    }
    if (msg.includes('[backpack-send-retry]') && (msg.includes('Window closed') || msg.includes('Popup closed'))) {
      return 'Backpack popup was closed twice before the transaction completed. Please reopen Backpack and try again.';
    }
    if (msg.includes('[backpack-send]') && (msg.includes('Window closed') || msg.includes('Popup closed'))) {
      return 'Backpack popup was closed before the transaction completed. Please reopen Backpack and try again.';
    }
    if (msg.includes('[backpack-sign-raw]')) {
      return 'Backpack failed while signing or broadcasting the transaction. Please reopen Backpack and try again.';
    }
    if (msg.includes('[backpack-send-retry]') && msg.includes('Plugin Closed')) {
      return 'Backpack closed the signing popup twice. Please reopen Backpack and try again.';
    }
    if (msg.includes('[backpack-send]') && msg.includes('Plugin Closed')) {
      return 'Backpack closed the signing popup before the transaction completed. Please reopen Backpack and try again.';
    }
    if (msg.includes('[wallet-sign-raw]')) {
      return 'Wallet signed, but raw transaction send failed. Please retry.';
    }
    if (msg.includes('NO_SUPPORTED_TX_PATH')) {
      return 'No supported wallet transaction path was available. Please reconnect your wallet and try again.';
    }
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
    if (msg.includes('block height exceeded')) {
      return 'The transaction appears to have been sent, but confirmation took too long. Please check the wallet and Explorer before retrying.';
    }
  
    return msg;
  }

  function getWalletName() {
    return String(wallet?.adapter?.name || '').toLowerCase();
  }
  
  function getInjectedBackpackProvider(): any {
    if (typeof window === 'undefined') return null;
  
    const w = window as any;
  
    return (
      w?.backpack?.solana ||
      w?.backpack ||
      (wallet as any)?.adapter?._wallet?.provider ||
      (wallet as any)?.adapter?._wallet ||
      (wallet as any)?.adapter?.provider ||
      (wallet as any)?.adapter?._provider ||
      null
    );
  }
  
  function extractSignature(out: any): string | null {
    if (!out) return null;
    if (typeof out === 'string') return out;
    if (typeof out?.signature === 'string') return out.signature;
    if (typeof out?.txid === 'string') return out.txid;
    if (typeof out?.hash === 'string') return out.hash;
    return null;
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  
  async function submitTx(
    buildTx: () => Transaction,
    commitment: 'processed' | 'confirmed' = 'processed',
    maxRetries = 5
  ) {
    if (!publicKey) throw new Error('WALLET_NOT_CONNECTED');
  
    const walletName = getWalletName();
    const isBackpack = walletName.includes('backpack');
  
    const sendOnce = async () => {
      const tx = buildTx(); // ✅ her denemede fresh tx
  
      tx.feePayer = publicKey;
  
      const latest = await connection.getLatestBlockhash(commitment);
      tx.recentBlockhash = latest.blockhash;
  
      const sig = await sendTransaction(tx, connection, {
        skipPreflight: false,
        preflightCommitment: commitment,
        maxRetries,
      });
  
      return {
        signature: sig,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      };
    };
  
    console.log('[submitTx]', {
      walletName,
      isBackpack,
      commitment,
    });
  
    if (isBackpack) {
      try {
        console.log('[submitTx] Backpack -> sendTransaction attempt #1');
        return await sendOnce();
      } catch (e: any) {
        const msg = String(e?.message || e);
        const lowerMsg = msg.toLowerCase();
        console.warn('[submitTx] Backpack attempt #1 failed:', msg);
  
        if (
          lowerMsg.includes('plugin closed') ||
          lowerMsg.includes('window closed') ||
          lowerMsg.includes('popup closed')
        ) {
          await sleep(700);
  
          try {
            console.log('[submitTx] Backpack -> sendTransaction attempt #2 after close/interruption');
            return await sendOnce();
          } catch (e2: any) {
            throw new Error(`[backpack-send-retry] ${String(e2?.message || e2)}`);
          }
        }
  
        throw new Error(`[backpack-send] ${msg}`);
      }
    }
  
    // Other wallets: adapter path first
    try {
      return await sendOnce();
    } catch (e: any) {
      console.warn('[submitTx] adapter failed:', e);
    }
  
    // Fallback for non-Backpack wallets only
    if (signTransaction) {
      try {
        const tx = buildTx(); // ✅ fallback'te de fresh tx
        tx.feePayer = publicKey;
  
        const latest2 = await connection.getLatestBlockhash(commitment);
        tx.recentBlockhash = latest2.blockhash;
  
        const signed = await signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          maxRetries,
        });
  
        return {
          signature: sig,
          blockhash: latest2.blockhash,
          lastValidBlockHeight: latest2.lastValidBlockHeight,
        };
      } catch (e: any) {
        throw new Error(`[wallet-sign-raw] ${String(e?.message || e)}`);
      }
    }
  
    throw new Error('NO_SUPPORTED_TX_PATH');
  }

  /* ------------------ SEND TX ------------------ */
  const handleSend = async () => {
    if (loading || txStage !== 'idle') return;
    if (!publicKey || !amountInput) return;

    setLoading(true);
    setTxError(null);
    setUiNotice(null);
    setTxStage('awaiting_wallet');

    try {
      const mintForStatus = isSOLToken ? WSOL_MINT : token.mint;

      // Final guard: always re-check latest token status before building/sending tx
      let latestStatusData: StatusApiResponse | null = null;
      try {
        latestStatusData = await fetchLatestTokenStatus(mintForStatus);
      } catch (e: any) {
        const friendly = humanizeTxError(e);
      
        console.error('❌ Latest token status fetch failed:', e);
      
        setTxStage('error');
        setTxError(friendly);
        setUiNotice({
          type: 'error',
          message: friendly,
        });
      
        return;
      }
      const latestStatus = resolveLatestStatus(latestStatusData);

      // keep parent state fresh as well
      setStatusInfo(latestStatusData);

      if (latestStatus === 'redlist' || latestStatus === 'blacklist') {
        setUiNotice({
          type: latestStatus === 'blacklist' ? 'error' : 'warning',
          message:
            latestStatus === 'blacklist'
              ? 'This token is currently blacklisted. Coincarnation is blocked.'
              : 'This token is currently redlisted. Coincarnation is blocked.',
        });
        setTxStage('idle');
        return;
      }

      const amountToSend = Number(String(amountInput).replace(',', '.'));
      if (isNaN(amountToSend) || amountToSend <= 0) {
        setTxStage('idle');
        return;
      }

      if (isSOLToken && internalBalance) {
        const feeReserve = 0.0002; // safe buffer
        if (internalBalance.amount - amountToSend < feeReserve) {
          throw new Error('LEAVE_SOL_FOR_FEES');
        }
      }

      if (!destSol) {
        setUiNotice({
          type: 'error',
          message: 'Destination address missing. Please set NEXT_PUBLIC_DEST_SOL.',
        });
        setTxStage('idle');
        return;
      }

      let signature: string;
      let explorerUrl = '';
      let sendMeta:
        | { signature: string; blockhash: string; lastValidBlockHeight: number }
        | undefined;

      if (isSOLToken) {
        const lamports = solToLamports(amountInput);

        const buildSolTx = () => {
          const tx = new Transaction();
        
          tx.add(
            SystemProgram.transfer({
              fromPubkey: publicKey,
              toPubkey: destSol,
              lamports,
            })
          );
        
          return tx;
        };
        
        try {
          setTxStage('awaiting_wallet');
          sendMeta = await submitTx(buildSolTx, 'processed', 5);
          signature = sendMeta.signature;
          explorerUrl = explorerUrlForSig(signature);
          setTxStage('broadcasting');
        } catch (e: any) {
          throw new Error(`[wallet-send-sol] ${String(e?.message || e)}`);
        }
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

        const buildSplTx = () => {
          const tx = new Transaction();
        
          tx.add(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 15_000 }),
            ComputeBudgetProgram.setComputeUnitLimit({ units: 120_000 })
          );
        
          tx.add(...ixs);
        
          return tx;
        };
        
        try {
          setTxStage('awaiting_wallet');
          sendMeta = await submitTx(buildSplTx, 'processed', 5);
          signature = sendMeta.signature;
          explorerUrl = explorerUrlForSig(signature);
          setTxStage('broadcasting');
        } catch (e: any) {
          throw new Error(`[wallet-send-spl] ${String(e?.message || e)}`);
        }

        console.log('✅ sent signature:', signature);
        console.log('🔎 explorer:', explorerUrl);
      }

      console.log('🌐 rpc endpoint:', (connection as any)?.rpcEndpoint);
      console.log('✅ sent signature:', signature);
      console.log('🔎 explorer:', explorerUrl);

      try {
        setTxStage('confirming');
      
        await confirmSignatureOrThrow({
          signature,
          blockhash: sendMeta?.blockhash,
          lastValidBlockHeight: sendMeta?.lastValidBlockHeight,
        });
      } catch (e: any) {
        throw new Error(`[tx-confirm] ${String(e?.message || e)}`);
      }

      const referralFromUrl = getReferralFromUrl();

      const finalTokenCategory: TokenCategory =
        latestStatus === 'deadcoin'
          ? 'deadcoin'
          : latestStatus === 'healthy' || latestStatus === 'walking_dead'
          ? 'healthy'
          : tokenCategory ?? 'unknown';

      setTxStage('recording');

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

      const parsedRecord = await readJsonSafe(res);

      if (!parsedRecord.ok || !parsedRecord.data) {
        throw new Error(
          `[record-post] RECORD_NON_JSON_OR_HTTP_${parsedRecord.status}: ${parsedRecord.raw.slice(0, 160)}`
        );
      }

      const json = parsedRecord.data;

      if (!json || !json.success) {
        throw new Error(
          `[record-post] RECORD_LOGICAL_ERROR: ${JSON.stringify(json).slice(0, 160)}`
        );
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
        amount: amountToSend,
        usdValue: priceView.usdValue,
        explorerUrl,
      });

      setConfirmModalOpen(false);
      setTxStage('success');
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
      const rawMsg = String(err?.message || err || 'UNKNOWN_ERROR');
      console.error('❌ Transaction error full:', err);
      console.error('❌ Transaction raw message:', rawMsg);
    
      if (rawMsg.includes('STATUS_ENDPOINT_NON_JSON_OR_HTTP_')) {
        console.error('❌ Failing endpoint appears to be /api/status');
      }
    
      setTxStage('error');
      setTxError(humanizeTxError(err));
    
      if (rawMsg.includes('[record-post]')) {
        setUiNotice({
          type: 'warning',
          message:
            'Blockchain transaction may have succeeded, but backend recording failed. Please check Explorer before retrying.',
        });
      } else {
        setUiNotice({
          type: 'error',
          message: humanizeTxError(err),
        });
      }
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
      {uiNotice && (
        <div
          className={[
            'mb-4 rounded-xl border px-4 py-3 text-sm',
            uiNotice.type === 'error'
              ? 'border-red-500/40 bg-red-500/10 text-red-100'
              : uiNotice.type === 'warning'
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
              : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100',
          ].join(' ')}
        >
          <div className="font-semibold mb-1">
            {uiNotice.type === 'error'
              ? 'Transaction issue'
              : uiNotice.type === 'warning'
              ? 'Please review'
              : 'Notice'}
          </div>
          <div className="text-xs opacity-90">{uiNotice.message}</div>
        </div>
      )}

      {confirmModalOpen && (
        <ConfirmModal
          isOpen={confirmModalOpen}
          onCancel={() => setConfirmModalOpen(false)}
          onConfirm={handleSend}
          usdValue={priceView.usdValue}
          tokenSymbol={displaySymbol}
          amount={Number(amountInput) || 0}
          tokenCategory={tokenCategory ?? 'unknown'}
          priceSources={priceView.priceSources}
          fetchStatus={priceView.fetchStatus}
          tokenMint={isSOLToken ? WSOL_MINT : token.mint}
          currentWallet={publicKey?.toBase58() ?? null}
          onDeadcoinVote={() => {}}
          confirmBusy={loading || txStage !== 'idle'}
          errorMessage={txError}
          confirmLabel={getTxStageLabel(txStage) || 'Confirm Coincarnation'}
        />
      )}

      {/* 🔹 Ana Coincarne dialog */}
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !loading && txStage === 'idle') onClose();
        }}
      >
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
            amount={resultData.amount}
            usdValue={resultData.usdValue}
            explorerUrl={resultData.explorerUrl}
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
                className="w-full bg-gradient-to-r from-green-500 via-yellow-400 to-pink-500 text-black font-extrabold py-3 rounded-xl transition hover:scale-105 active:scale-95"
              >
                {loading
                  ? getTxStageLabel(txStage) || 'Processing...'
                  : `🚀 Coincarnate ${displaySymbol} Now`}
              </button>

              {txStage !== 'idle' && (
                <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-3 text-center">
                  <p className="text-sm text-zinc-200">{getTxStageLabel(txStage)}</p>
                  {txStage !== 'success' && txStage !== 'error' && (
                    <p className="mt-1 text-xs text-zinc-400">
                      Please keep this window open until the process finishes.
                    </p>
                  )}
                  {txError && (
                    <p className="mt-2 text-xs text-red-400">{txError}</p>
                  )}
                </div>
              )}

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
    </>
  );
}
