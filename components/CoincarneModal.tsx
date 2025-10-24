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
import { useWallet } from '@solana/wallet-adapter-react';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getMint,
} from '@solana/spl-token';
  // web3
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { connection } from '@/lib/solanaConnection';
import { useInternalBalance, quantize } from '@/hooks/useInternalBalance';
import { getDestAddress, __dest_debug__ } from '@/lib/chain/env';
// token meta (fallback için)
import { getTokenMeta } from '@/lib/solana/tokenMeta';

/* -------- Dynamic imports (default export + cast) -------- */

type CoincarnationResultProps = {
  tokenFrom: string;
  number: number;
  imageUrl: string;
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
const ConfirmModal = dynamic(
  () => import('@/components/ConfirmModal'),
  { ssr: false }
) as React.ComponentType<ConfirmModalProps>;

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

export default function CoincarneModal({
  token,
  onClose,
  refetchTokens,
  onGoToProfileRequest,
}: CoincarneModalProps) {
  const { publicKey, sendTransaction } = useWallet();

  /* ------------------ DEST DEBUG + DEST ADDRESS ------------------ */
  const [destSol, setDestSol] = useState<PublicKey | null>(null);
  const [destErr, setDestErr] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('[DEST DEBUG]', __dest_debug__());
    }
  }, []);

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

  /* ------------------ LOCAL UI STATE ------------------ */
  const [loading, setLoading] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [resultData, setResultData] = useState<{
    tokenFrom: string;
    number: number;
    imageUrl: string;
  } | null>(null);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [priceView, setPriceView] = useState<PriceView>({
    fetchStatus: 'loading',
    usdValue: 0,
    priceSources: [],
  });
  const [tokenCategory, setTokenCategory] = useState<TokenCategory>('unknown');
  const [priceStatus, setPriceStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  /* ------------------ SYMBOL RESOLUTION ------------------ */
  // 1) Başlangıç: token.symbol varsa onu, yoksa mint'in ilk 4 hanesini EN-US upper
  const [displaySymbol, setDisplaySymbol] = useState<string>(
    (token.symbol || token.mint.slice(0, 4)).toLocaleUpperCase('en-US')
  );

  // 2) Nihai çözüm: Önce /api/tokenlist → yoksa getTokenMeta fallback
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        // a) Tokenlist (strict+all birleşik, server-side)
        const res = await fetch('/api/tokenlist', { cache: 'force-cache' });
        const json = await res.json();
        const sym: string | null = json?.data?.[token.mint]?.symbol ?? null;
        if (!off && sym) {
          setDisplaySymbol(sym);
          return;
        }
        // b) Fallback: on-chain / eski yoldan meta
        const meta = await getTokenMeta(token.mint, token.symbol);
        if (!off && meta?.symbol) {
          setDisplaySymbol(meta.symbol);
        }
      } catch {
        // sessiz geç
      }
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

  /* ------------------ CONFIRM PREPARE (PRICING) ------------------ */
  const handlePrepareConfirm = async () => {
    if (!publicKey || !amountInput) return;
    const amountToSend = parseFloat(amountInput);
    if (isNaN(amountToSend) || amountToSend <= 0) return;

    try {
      setLoading(true);
      setPriceStatus('loading');
      setPriceView({ fetchStatus: 'loading', usdValue: 0, priceSources: [] });

      // Normalize mint: SOL → WSOL
      const mint = isSOLToken ? WSOL_MINT : token.mint;

      const qs = new URLSearchParams({ mint, amount: String(amountToSend) });
      const res = await fetch(`/api/proxy/price?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();

      const ok = !!json?.ok || !!json?.success;
      if (!ok) {
        setPriceView({
          fetchStatus: json?.status === 'not_found' ? 'not_found' : 'error',
          usdValue: 0,
          priceSources: [],
        });
        setTokenCategory('deadcoin');
        setConfirmModalOpen(true);
        setPriceStatus('ready');
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
      setPriceStatus('ready');
    } catch (err) {
      console.error('❌ Error preparing confirmation:', err);
      setPriceView({ fetchStatus: 'error', usdValue: 0, priceSources: [] });
      setPriceStatus('error');
      setConfirmModalOpen(true);
    } finally {
      setLoading(false);
    }
  };

  /* ------------------ SEND TX ------------------ */
  const handleSend = async () => {
    if (!publicKey || !amountInput) return;
    const amountToSend = parseFloat(amountInput);
    if (isNaN(amountToSend) || amountToSend <= 0) return;

    if (!destSol) {
      alert('❌ Destination address missing. Please set NEXT_PUBLIC_DEST_SOL.');
      return;
    }

    try {
      setLoading(true);
      let signature: string;

      if (isSOLToken) {
        // SOL transfer
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: destSol,
            lamports: Math.floor(amountToSend * 1e9),
          })
        );
        signature = await sendTransaction(tx, connection);
      } else {
        // SPL token transfer (Token v1 veya Token-2022)
        const mint = new PublicKey(token.mint);

        // 1) Mint hangi programda?
        const mintAcc = await connection.getAccountInfo(mint, 'confirmed');
        if (!mintAcc) throw new Error('mint-not-found');
        const is2022 = mintAcc.owner.equals(TOKEN_2022_PROGRAM_ID);
        const program = is2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

        // 2) Decimals
        const mintInfo = await getMint(connection, mint, 'confirmed', program);
        const decimals = mintInfo.decimals ?? 0;

        // 3) ATA’lar (programa göre!)
        const fromATA = getAssociatedTokenAddressSync(mint, publicKey, false, program);
        const toATA   = getAssociatedTokenAddressSync(mint, destSol,   false, program);

        // 4) İxs (idempotent ATA create + checked transfer)
        const ixs: any[] = [];

        const toAtaInfo = await connection.getAccountInfo(toATA, 'confirmed');
        if (!toAtaInfo) {
          ixs.push(
            createAssociatedTokenAccountIdempotentInstruction(
              publicKey,  // payer
              toATA,      // ata
              destSol,    // owner
              mint,       // mint
              program     // 🔑 doğru program
            )
          );
        }

        const raw = Number(toU64(amountToSend, decimals));
        ixs.push(
          createTransferCheckedInstruction(
            fromATA,
            mint,
            toATA,
            publicKey, // owner
            raw,
            decimals,
            [],        // multisig signer yok
            program    // 🔑 doğru program
          )
        );

        const tx = new Transaction().add(...ixs);
        signature = await sendTransaction(tx, connection);
      }

      // Backend kayıt — sembol olarak displaySymbol gönder
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
          token_category: tokenCategory ?? 'unknown',
        }),
      });

      const json = await res.json();
      const userNumber = json?.number ?? 0;
      const tokenSymbolForImage = displaySymbol;
      const imageUrl = `/generated/coincarnator-${userNumber}-${tokenSymbolForImage}.png`;

      setResultData({ tokenFrom: tokenSymbolForImage, number: userNumber, imageUrl });
      setConfirmModalOpen(false);
      refetchTokens?.();

      // (opsiyonel) post-tx tetik
      try {
        await fetch('/api/lv/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mint: token.mint, category: tokenCategory }),
        }).catch((err) => console.warn('⚠️ lv/apply error:', err));
      } catch {}
    } catch (err) {
      console.error('❌ Transaction error:', err);
      alert('❌ Transaction failed.');
    } finally {
      setLoading(false);
    }
  };

  /* ------------------ PERCENT BUTTONS ------------------ */
  const handlePercentage = (percent: number) => {
    if (!internalBalance) return;
    let calculated = (internalBalance.amount * percent) / 100;

    // SOL için %100'te küçük fee tamponu
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

  /* ------------------ RENDER ------------------ */
  return (
    <>
      {priceStatus === 'ready' && confirmModalOpen && (
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
              imageUrl={resultData.imageUrl}
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
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="Enter amount"
                className="w-full bg-zinc-800 text-white p-3 rounded-lg border border-zinc-600 mb-4"
                disabled={loading}
              />

              <button
                onClick={handlePrepareConfirm}
                disabled={loading || !amountInput || !!destErr}
                className="w-full bg-gradient-to-r from-green-500 via-yellow-400 to-pink-500 text-black font-extrabold py-3 rounded-xl"
              >
                {loading ? '🔥 Coincarnating...' : `🚀 Coincarnate {displaySymbol} Now`.replace('{displaySymbol}', displaySymbol)}
              </button>

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
