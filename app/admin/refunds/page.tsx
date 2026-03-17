//app/admin/refunds/page.tsx

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getMint,
} from '@solana/spl-token';

type RefundRow = {
  id: number;
  contribution_id: number;
  wallet_address: string;
  mint: string;
  invalidated_token_amount: string | number | null;
  reason: string | null;
  refund_status: string | null;
  requested_at: string | null;
  refunded_at: string | null;
  refund_fee_paid: boolean | null;
  refund_fee_lamports: string | number | null;
  refund_fee_tx_signature: string | null;
  refund_tx_signature: string | null;
  executed_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  token_symbol: string | null;
  network: string | null;
  transaction_signature: string | null;
};

type ExecutePrepareResponse = {
  success: boolean;
  refund?: {
    contribution_id: number;
    wallet_address: string;
    mint: string;
    token_symbol: string | null;
    invalidated_token_amount: string | number | null;
    treasury_wallet: string;
    network: 'solana';
  };
  error?: string;
};

const CARD =
  'rounded-2xl border border-white/10 bg-[#0b0f18] p-5 shadow-sm hover:shadow transition-shadow';

function shorten(v: unknown) {
  const s = String(v ?? '').trim();
  if (!s) return '-';
  if (s.length <= 14) return s;
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

function formatDate(v: string | null | undefined) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function formatLamports(v: unknown) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '-';
  return `${(n / 1e9).toFixed(6)} SOL`;
}

function statusBadge(status: string | null | undefined) {
  const s = String(status ?? '').toLowerCase();

  if (s === 'requested') {
    return (
      <span className="inline-flex rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-1 text-xs font-medium text-yellow-200">
        requested
      </span>
    );
  }

  if (s === 'available') {
    return (
      <span className="inline-flex rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-200">
        available
      </span>
    );
  }

  if (s === 'refunded') {
    return (
      <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-200">
        refunded
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-white/70">
      {s || '-'}
    </span>
  );
}

function toRawAmount(ui: string | number, decimals: number): bigint {
  const s = String(ui ?? '0').replace(/[^0-9.]/g, '');
  const [i = '0', f = ''] = s.split('.');
  const frac = (f + '0'.repeat(decimals)).slice(0, decimals);
  const joined = `${i}${frac}`.replace(/^0+/, '');
  return BigInt(joined.length ? joined : '0');
}

export default function AdminRefundsPage() {
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [rows, setRows] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'requested' | 'available' | 'refunded'>('requested');
  const [executingId, setExecutingId] = useState<number | null>(null);

  async function load() {
    try {
      setLoading(true);

      const r = await fetch('/api/admin/refunds/list', {
        credentials: 'include',
        cache: 'no-store',
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.success) {
        throw new Error(j?.error || `HTTP ${r.status}`);
      }

      setRows(Array.isArray(j.refunds) ? j.refunds : []);
    } catch (e: any) {
      setRows([]);
      setMsg(`❌ ${humanizeRefundAdminError(String(e?.message || 'FAILED_TO_LOAD_REFUNDS'))}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => String(r.refund_status ?? '').toLowerCase() === filter);
  }, [rows, filter]);

  const counts = useMemo(() => {
    const out = {
      all: rows.length,
      requested: 0,
      available: 0,
      refunded: 0,
    };

    for (const r of rows) {
      const s = String(r.refund_status ?? '').toLowerCase();
      if (s === 'requested') out.requested++;
      else if (s === 'available') out.available++;
      else if (s === 'refunded') out.refunded++;
    }

    return out;
  }, [rows]);

  async function handleExecuteRefund(row: RefundRow) {
    if (!connected || !publicKey || !sendTransaction || !connection) {
      setMsg('❌ Wallet connection is not ready.');
      return;
    }

    try {
      setExecutingId(row.id);
      setMsg(null);

      const prepRes = await fetch('/api/admin/refunds/execute', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invalidation_id: row.id,
          contribution_id: row.contribution_id,
        }),
      });

      const prepJson = (await prepRes.json().catch(() => ({}))) as ExecutePrepareResponse;

      if (!prepRes.ok || !prepJson?.success || !prepJson?.refund) {
        throw new Error(prepJson?.error || `EXECUTE_PREPARE_FAILED (${prepRes.status})`);
      }

      const refund = prepJson.refund;
      const treasuryWallet = String(refund.treasury_wallet || '').trim();
      const connectedWallet = publicKey.toBase58();

      if (!treasuryWallet) {
        throw new Error('TREASURY_WALLET_MISSING');
      }

      if (connectedWallet !== treasuryWallet) {
        throw new Error('TREASURY_WALLET_REQUIRED');
      }

      let destinationWallet: PublicKey;
      try {
        destinationWallet = new PublicKey(refund.wallet_address);
      } catch {
        throw new Error('INVALID_DESTINATION_WALLET');
      }

      let signature: string;

      let mintPk: PublicKey;
      try {
        mintPk = new PublicKey(refund.mint);
      } catch {
        throw new Error('INVALID_MINT_ADDRESS');
      }

      const mintAcc = await connection.getAccountInfo(mintPk, 'confirmed');
      if (!mintAcc) throw new Error('MINT_NOT_FOUND');

      const is2022 = mintAcc.owner.equals(TOKEN_2022_PROGRAM_ID);
      const program = is2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

      const mintInfo = await getMint(connection, mintPk, 'confirmed', program);
      const decimals = mintInfo.decimals ?? 0;

      const fromAta = getAssociatedTokenAddressSync(
        mintPk,
        publicKey,
        false,
        program
      );

      const toAta = getAssociatedTokenAddressSync(
        mintPk,
        destinationWallet,
        false,
        program
      );

      const fromAtaInfo = await connection.getAccountInfo(fromAta, 'confirmed');
      if (!fromAtaInfo) throw new Error('TREASURY_TOKEN_ACCOUNT_MISSING');

      const toAtaInfo = await connection.getAccountInfo(toAta, 'confirmed');

      const raw = toRawAmount(refund.invalidated_token_amount ?? 0, decimals);
      if (raw <= 0n) throw new Error('INVALID_REFUND_AMOUNT');

      const tx = new Transaction();

      if (!toAtaInfo) {
        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            toAta,
            destinationWallet,
            mintPk,
            program
          )
        );
      }

      tx.add(
        createTransferCheckedInstruction(
          fromAta,
          mintPk,
          toAta,
          publicKey,
          raw,
          decimals,
          [],
          program
        )
      );

      tx.feePayer = publicKey;

      signature = await sendTransaction(tx, connection, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 5,
      });

      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      if (confirmation?.value?.err) {
        throw new Error('REFUND_TX_FAILED');
      }

      const finalizeRes = await fetch('/api/admin/refunds/finalize', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invalidation_id: row.id,
          contribution_id: row.contribution_id,
          refund_tx_signature: signature,
          executed_by: publicKey.toBase58(),
        }),
      });

      const finalizeJson = await finalizeRes.json().catch(() => ({} as any));

      if (!finalizeRes.ok || !finalizeJson?.success) {
        throw new Error(finalizeJson?.error || `REFUND_FINALIZE_FAILED (${finalizeRes.status})`);
      }

      setMsg(`✅ Refund executed successfully. Tx: ${signature}`);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${humanizeRefundAdminError(String(e?.message || 'REFUND_EXECUTE_FAILED'))}`);
    } finally {
      setExecutingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#090d15] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Refund Requests</h1>
            <p className="text-xs text-white/60 mt-1">
              Review blacklist-based refund requests and execute on-chain refunds
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/control"
              className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
            >
              Control
            </Link>
            <Link
              href="/admin/tokens"
              className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
            >
              Tokens
            </Link>
            <button
              onClick={load}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm"
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {msg && <div className={`${CARD} text-sm whitespace-pre-line`}>{msg}</div>}

        <section className={CARD}>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFilter('requested')}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                filter === 'requested' ? 'bg-yellow-600' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              Requested ({counts.requested})
            </button>

            <button
              onClick={() => setFilter('available')}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                filter === 'available' ? 'bg-blue-600' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              Available ({counts.available})
            </button>

            <button
              onClick={() => setFilter('refunded')}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                filter === 'refunded' ? 'bg-emerald-600' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              Refunded ({counts.refunded})
            </button>

            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                filter === 'all' ? 'bg-zinc-600' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              All ({counts.all})
            </button>
          </div>
        </section>

        <section className={CARD}>
          {loading ? (
            <div className="text-sm text-white/70">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-white/60">No refund records found for this filter.</div>
          ) : (
            <div className="w-full overflow-x-auto rounded-xl border border-white/10">
              <table className="min-w-[1200px] w-full text-sm text-left bg-[#0b0f18]">
                <thead className="bg-white/5 text-white/70">
                  <tr>
                    <th className="px-4 py-3">Contribution</th>
                    <th className="px-4 py-3">Asset</th>
                    <th className="px-4 py-3">Wallet</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Fee</th>
                    <th className="px-4 py-3">Requested</th>
                    <th className="px-4 py-3">Refunded</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const reason = String(row.reason ?? '').toLowerCase();
                    const network = String(row.network ?? '').toLowerCase();

                    const mint = String(row.mint ?? '').trim();
                    
                    const canExecute =
                      String(row.refund_status ?? '').toLowerCase() === 'requested' &&
                      Boolean(row.refund_fee_paid) &&
                      network === 'solana' &&
                      reason.includes('blacklist') &&
                      mint !== 'SOL';

                    return (
                      <tr key={row.id} className="border-t border-white/10 hover:bg-white/[0.03] align-top">
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs">{row.contribution_id}</div>
                          {row.transaction_signature ? (
                            <div className="text-[11px] text-white/50 mt-1">
                              tx: {shorten(row.transaction_signature)}
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-semibold">{row.token_symbol || '-'}</div>
                          <div className="text-[11px] text-white/50 mt-1">{shorten(row.mint)}</div>
                        </td>

                        <td className="px-4 py-3 font-mono text-xs">
                          {shorten(row.wallet_address)}
                        </td>

                        <td className="px-4 py-3">
                          {row.invalidated_token_amount ?? '-'}
                        </td>

                        <td className="px-4 py-3">
                          {row.reason || '-'}
                        </td>

                        <td className="px-4 py-3">
                          {statusBadge(row.refund_status)}
                        </td>

                        <td className="px-4 py-3">
                          <div>{row.refund_fee_paid ? 'paid' : 'not paid'}</div>
                          <div className="text-[11px] text-white/50 mt-1">
                            {formatLamports(row.refund_fee_lamports)}
                          </div>
                          {row.refund_fee_tx_signature ? (
                            <div className="text-[11px] text-white/50 mt-1">
                              fee tx: {shorten(row.refund_fee_tx_signature)}
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-3 text-[12px]">
                          {formatDate(row.requested_at)}
                        </td>

                        <td className="px-4 py-3 text-[12px]">
                          {formatDate(row.refunded_at)}
                          {row.refund_tx_signature ? (
                            <div className="text-[11px] text-white/50 mt-1">
                              refund tx: {shorten(row.refund_tx_signature)}
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-3">
                          {canExecute ? (
                            <button
                                onClick={() => handleExecuteRefund(row)}
                                disabled={executingId === row.id}
                                className="px-3 py-2 rounded-lg bg-fuchsia-700 hover:bg-fuchsia-600 text-white text-xs disabled:opacity-50"
                            >
                                {executingId === row.id ? 'Executing...' : 'Execute Refund'}
                            </button>
                            ) : (
                            <div className="text-[11px] text-white/50 space-y-1">
                                {String(row.refund_status ?? '').toLowerCase() === 'available' && (
                                <div>Waiting for user request</div>
                                )}
                                {String(row.refund_status ?? '').toLowerCase() === 'requested' && !row.refund_fee_paid && (
                                <div>Waiting for fee payment</div>
                                )}
                                {String(row.refund_status ?? '').toLowerCase() === 'refunded' && (
                                <div>Completed</div>
                                )}
                                {String(row.refund_status ?? '').toLowerCase() !== 'available' &&
                                !(String(row.refund_status ?? '').toLowerCase() === 'requested' && !row.refund_fee_paid) &&
                                String(row.refund_status ?? '').toLowerCase() !== 'refunded' && (
                                    <div>—</div>
                                )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function humanizeRefundAdminError(msg: string) {
  const m = String(msg || '').trim();

  if (m === 'BAD_CONTRIBUTION_ID') return 'Invalid contribution ID.';
  if (m === 'REFUND_NOT_FOUND') return 'Refund record was not found.';
  if (m === 'REFUND_ONLY_FOR_BLACKLIST') return 'Only blacklist-based invalidations can be refunded.';
  if (m === 'REFUND_NOT_REQUESTED') return 'This refund is not in requested state.';
  if (m === 'REFUND_FEE_NOT_PAID') return 'Refund fee has not been paid by the user.';
  if (m === 'TREASURY_WALLET_MISSING') return 'Coincarnation treasury wallet is not configured.';
  if (m === 'TREASURY_WALLET_INVALID') return 'Coincarnation treasury wallet is invalid.';
  if (m === 'TREASURY_WALLET_REQUIRED') return 'Please connect the Coincarnation treasury wallet to execute this refund.';
  if (m === 'TREASURY_TOKEN_ACCOUNT_MISSING') return 'Coincarnation treasury token account does not exist for this asset.';
  if (m === 'SOL_REFUND_NOT_SUPPORTED') return 'Native SOL refunds are not supported in this blacklist refund flow.';
  if (m === 'UNSUPPORTED_REFUND_NETWORK') return 'This refund network is not supported yet.';
  if (m === 'MINT_NOT_FOUND') return 'Token mint could not be found on this network.';
  if (m === 'INVALID_REFUND_AMOUNT') return 'Refund amount is invalid.';
  if (m === 'INVALID_DESTINATION_WALLET') return 'Destination wallet address is invalid.';
  if (m === 'INVALID_MINT_ADDRESS') return 'Token mint address is invalid.';
  if (m === 'REFUND_TX_NOT_FOUND') return 'Refund transaction could not be found yet.';
  if (m === 'REFUND_TX_EXECUTOR_MISMATCH') return 'Refund transaction signer does not match the Coincarnation treasury wallet.';
  if (m === 'REFUND_TX_TREASURY_MISMATCH') return 'Refund transaction source does not match the configured Coincarnation treasury wallet.';
  if (m === 'REFUND_TX_NOT_VALID') return 'Refund transaction could not be verified.';
  if (m === 'REFUND_TX_FAILED') return 'Refund transaction failed on-chain.';
  if (m === 'ALREADY_REFUNDED') return 'This contribution has already been refunded.';
  if (m === 'REFUND_FINALIZE_RACE_LOST') return 'This refund was already finalized by another process.';
  if (m === 'FAILED_TO_LOAD_REFUNDS') return 'Refund records could not be loaded.';
  if (m.startsWith('EXECUTE_PREPARE_FAILED')) return 'Refund execution could not be prepared.';
  if (m.startsWith('REFUND_FINALIZE_FAILED')) return 'Refund could not be finalized.';
  if (m === 'BAD_REQUEST') return 'Request payload is invalid.';
  if (m === 'REFUND_TX_SIGNATURE_ALREADY_USED') return 'This refund transaction signature is already linked to another refund.';
  if (m === 'INTERNAL_ERROR') return 'Internal server error.';
  if (m.includes('User rejected') || m.includes('rejected the request')) {
    return 'Transaction was cancelled in the wallet.';
  }
  if (m.includes('Network request failed')) {
    return 'Network request failed. Please try again.';
  }

  return m || 'Unexpected error.';
}