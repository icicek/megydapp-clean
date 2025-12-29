// components/CoincarneForm.tsx

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import DeadcoinVoteButton from '@/components/community/DeadcoinVoteButton';
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from '@solana/spl-token';

type ListStatus = 'healthy' | 'walking_dead' | 'deadcoin' | 'redlist' | 'blacklist';

interface TokenInfo {
  address: string; // mint
  symbol: string;
  name: string;
  logoURI?: string;
  decimals: number;
}

const TOKEN_LIST_URL =
  'https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const MIN_LAMPORT_BUFFER = 300_000n;

// Hazine adresi: mevcut isim -> fallback
const DEST_SOLANA =
  (process.env.NEXT_PUBLIC_DEST_SOL as string | undefined) ||
  (process.env.NEXT_PUBLIC_DEST_SOLANA as string | undefined);

export default function CoincarneForm() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [availableAmount, setAvailableAmount] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [participantNumber, setParticipantNumber] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  type StatusZone = 'healthy' | 'wd_gray' | 'wd_vote' | 'deadzone';

  interface StatusDecision {
    status: ListStatus;      // healthy / walking_dead / deadcoin / redlist / blacklist
    zone: StatusZone;        // resolveEffectiveStatus().decision.zone
    voteEligible: boolean;   // resolveEffectiveStatus().decision.voteEligible
  }

  const [statusDecision, setStatusDecision] = useState<StatusDecision | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // NEW: vote state
  const [voteEligible, setVoteEligible] = useState(false);
  const [lastMint, setLastMint] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<ListStatus | null>(null);

  const showDebug =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');

  const destKey = useMemo(() => {
    try {
      return DEST_SOLANA ? new PublicKey(DEST_SOLANA) : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(TOKEN_LIST_URL);
        const data = await res.json();
        setTokens((data?.tokens || []) as TokenInfo[]);
      } catch (e) {
        console.error('Token list fetch error:', e);
      }
    })();
  }, []);

  const fetchWalletBalance = async (token: TokenInfo) => {
    try {
      if (!publicKey) return;

      if (token.symbol === 'SOL') {
        const lamports = await connection.getBalance(publicKey);
        setAvailableAmount(lamports / 1e9);
      } else {
        const mint = new PublicKey(token.address);
        const ata = await getAssociatedTokenAddress(mint, publicKey);
        const info = await connection.getAccountInfo(ata);
        if (info) {
          const parsed = await getAccount(connection, ata);
          setAvailableAmount(Number(parsed.amount) / Math.pow(10, token.decimals || 6));
        } else {
          setAvailableAmount(0);
        }
      }
    } catch (err) {
      console.error('Failed to fetch token balance', err);
      setAvailableAmount(null);
    }
  };

  async function fetchStatusForToken(token: TokenInfo) {
    setStatusDecision(null);
    setStatusError(null);
  
    // SOL için WSOL mint kullanıyoruz
    const mint = token.symbol === 'SOL' ? WSOL_MINT : token.address;
    if (!mint) return;
  
    try {
      setStatusLoading(true);
      const res = await fetch(
        `/api/status?mint=${encodeURIComponent(mint)}&includeMetrics=1`,
        { cache: 'no-store' }
      );
  
      if (!res.ok) {
        const txt = await res.text();
        console.error('status fetch failed', res.status, txt);
        setStatusError('Status service unavailable');
        return;
      }
  
      const j = await res.json();
  
      const rawStatus = (j?.status ?? 'healthy') as ListStatus;
      const dec = j?.decision ?? {};
  
      setStatusDecision({
        status: rawStatus,
        zone: (dec.zone ?? 'healthy') as StatusZone,
        voteEligible: !!dec.voteEligible,
      });
    } catch (e: any) {
      console.error('status fetch error', e);
      setStatusError(e?.message || 'Status fetch error');
    } finally {
      setStatusLoading(false);
    }
  }  

  const handleSelect = (sym: string) => {
    let token = tokens.find((t) => t.symbol === sym) || null;
    if (!token && sym === 'SOL') {
      token = { symbol: 'SOL', name: 'Solana', address: WSOL_MINT, decimals: 9 };
    }
    if (token) {
      setSelectedToken(token);
      setAmount('');
      setConfirmed(false);
      setModalOpen(true);
      setVoteEligible(false);
      setLastMint(null);
      setLastStatus(null);
      fetchWalletBalance(token);
      fetchStatusForToken(token);
    }
  };

  const handleQuickSelect = (pct: number) => {
    if (!availableAmount) return;
    setAmount(((availableAmount * pct) / 100).toFixed(4));
  };

  async function ensureHasFeeBudget(owner: PublicKey, extraRentLamports: bigint = 0n) {
    const bal = BigInt(await connection.getBalance(owner));
    if (bal < MIN_LAMPORT_BUFFER + extraRentLamports) {
      throw new Error('Insufficient SOL for fees/rent. Please add a small amount of SOL and try again.');
    }
  }

  async function buildAndSendSolTransfer(amtSol: number) {
    if (!publicKey || !destKey) throw new Error('Wallet or destination not ready');
    const lamports = BigInt(Math.floor(amtSol * 1e9));
    if (lamports <= 0n) throw new Error('Invalid SOL amount');
    await ensureHasFeeBudget(publicKey);

    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: destKey, lamports: Number(lamports) })
    );
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    tx.recentBlockhash = blockhash;
    tx.feePayer = publicKey;

    const sig = await sendTransaction(tx, connection, { skipPreflight: false });
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    return sig;
  }

  async function buildAndSendSplTransfer(token: TokenInfo, amtUi: number) {
    if (!publicKey || !destKey) throw new Error('Wallet or destination not ready');
    if (!token.address) throw new Error('Invalid token (missing mint)');

    const mint = new PublicKey(token.address);
    const amountBn = BigInt(Math.floor(amtUi * Math.pow(10, token.decimals)));
    if (amountBn <= 0n) throw new Error('Invalid token amount');

    const fromAta = await getAssociatedTokenAddress(mint, publicKey);
    const toAta = await getAssociatedTokenAddress(mint, destKey);

    const ixes = [];
    const toInfo = await connection.getAccountInfo(toAta);

    if (!toInfo) {
      await ensureHasFeeBudget(publicKey, 2_200_000n);
      ixes.push(createAssociatedTokenAccountInstruction(publicKey, toAta, destKey, mint));
    } else {
      await ensureHasFeeBudget(publicKey);
    }

    ixes.push(createTransferInstruction(fromAta, toAta, publicKey, Number(amountBn)));

    const tx = new Transaction().add(...ixes);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    tx.recentBlockhash = blockhash;
    tx.feePayer = publicKey;

    const sig = await sendTransaction(tx, connection, { skipPreflight: false });
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    return sig;
  }

  // Yeni → kayıt: önce yeni endpoint, olmazsa legacy
  async function recordContribution(payload: any) {
    const idem = payload.idempotency_key;

    let res = await fetch('/api/coincarnation/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('[record] /api/coincarnation/record failed:', res.status, txt);

      const res2 = await fetch('/api/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem },
        body: JSON.stringify(payload),
      });
      if (!res2.ok) {
        const txt2 = await res2.text();
        console.error('[record] /api/record failed:', res2.status, txt2);
        throw new Error(
          `Record failed.\n/coincarnation/record: ${res.status} ${txt}\n/record: ${res2.status} ${txt2}`,
        );
      }
      return res2;
    }
    return res;
  }

  const handleConfirm = async () => {
    if (!amount || !selectedToken || !publicKey) return;

    if (!destKey) {
      alert('Destination wallet not configured. Set NEXT_PUBLIC_DEST_SOL.');
      return;
    }

    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;

    setIsProcessing(true);
    try {
      // 1) Status + vote info
      const mint = selectedToken.symbol === 'SOL' ? WSOL_MINT : selectedToken.address!;
      let listStatus: ListStatus | null = null;
      let decisionVoteEligible = false;

      try {
        const qs = new URLSearchParams({
          mint,
          includeMetrics: '1',
        });
        const stRes = await fetch(`/api/status?${qs.toString()}`, { cache: 'no-store' });
        if (stRes.ok) {
          const sj = await stRes.json();
          listStatus = (sj?.status ?? null) as ListStatus | null;
          decisionVoteEligible = Boolean(sj?.decision?.voteEligible);
        }
      } catch (err) {
        console.error('Status fetch failed', err);
      }

      setLastMint(mint);
      setLastStatus(listStatus);
      setVoteEligible(decisionVoteEligible);

      // Redlist/Blacklist blokajı
      if (listStatus === 'blacklist' || listStatus === 'redlist') {
        alert('⛔ This token is blocked (blacklist/redlist).');
        setIsProcessing(false);
        return;
      }

      const isDeadcoinForMegy = listStatus === 'deadcoin';

      // 2) USD (opsiyonel)
      let usdTotal = 0;
      try {
        const qs = new URLSearchParams({ mint, amount: String(amt) });
        const pr = await fetch(`/api/proxy/price?${qs}`, { cache: 'no-store' });
        const j = await pr.json();
        if (j?.ok || j?.success) {
          usdTotal = Number(j.usdValue ?? 0) || Number(j.priceUsd ?? 0) * amt || 0;
        }
      } catch (err) {
        console.error('Price fetch failed', err);
      }

      // 3) On-chain transfer
      let signature = '';
      let assetKind: 'sol' | 'spl';

      if (selectedToken.symbol === 'SOL') {
        assetKind = 'sol';
        signature = await buildAndSendSolTransfer(amt);
      } else {
        assetKind = 'spl';
        if (!selectedToken.address) {
          alert('Invalid token: missing mint address.');
          setIsProcessing(false);
          return;
        }
        signature = await buildAndSendSplTransfer(selectedToken, amt);
      }

      // 4) Record
      const idem =
        (typeof self !== 'undefined' && (self as any).crypto?.randomUUID?.()) ||
        `${Date.now()}-${Math.random()}`;

      const payload = {
        wallet_address: publicKey.toBase58(),
        token_symbol: selectedToken.symbol,
        token_contract: selectedToken.symbol === 'SOL' ? null : selectedToken.address,
        token_amount: amt,
        // NOTE: deadcoin için MEGY yok → usd_value backend’de CP ve dağıtım kurallarına göre kullanılacak
        usd_value: isDeadcoinForMegy ? 0 : (usdTotal || 0),
        network: 'solana',
        transaction_signature: signature,
        idempotency_key: idem,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        asset_kind: assetKind,
        token_category: isDeadcoinForMegy ? 'deadcoin' : 'healthy', // WD ayrımı backend’de status’e göre yapılacak
      };

      const rec = await recordContribution(payload);
      if (!rec.ok) {
        const txt = await rec.text();
        alert(`Record failed:\n${txt}`);
        setIsProcessing(false);
        return;
      }

      // 5) UI success
      const lastNum = parseInt(localStorage.getItem('lastCoincarnator') || '100', 10);
      const newNumber = lastNum + 1;
      setParticipantNumber(newNumber);
      localStorage.setItem('lastCoincarnator', String(newNumber));
      setConfirmed(true);
    } catch (e: any) {
      console.error('❌ Coincarnation failed:', e);
      alert(e?.message || 'Transaction or record step failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-gray-900 mt-10 p-6 rounded-xl w-full max-w-2xl border border-gray-700">
      <h2 className="text-2xl font-bold mb-4 text-white">🔥 Coincarne Your Tokens</h2>

      {!publicKey && <p className="text-yellow-400">Please connect your wallet to continue.</p>}

      {publicKey && (
        <div className="text-white space-y-4">
          <label className="block text-sm text-gray-400">Select a token:</label>
          <select
            onChange={(e) => handleSelect(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg p-2 text-white"
          >
            <option value="">-- Choose a token --</option>
            <option value="SOL">SOL (Native)</option>
            {tokens.slice(0, 100).map((token) => (
              <option key={token.address} value={token.symbol}>
                {token.symbol} - {token.name}
              </option>
            ))}
          </select>

          {modalOpen && selectedToken && (
            <div className="bg-gray-900 border border-white rounded-2xl p-6 w-full max-w-md text-center mx-auto">
              {isProcessing ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <img
                    src="/icons/hourglass.svg"
                    className="w-10 h-10 mb-4 animate-spin"
                    alt="Coincarnating..."
                  />
                  <p className="text-white text-lg font-semibold">🕒 Coincarnating...</p>
                </div>
              ) : !confirmed ? (
                <>
                  <h2 className="text-xl font-bold mb-1">
                    Coincarnate {selectedToken.symbol}
                  </h2>

                  {lastStatus && showDebug && (
                    <p className="text-xs text-cyan-400 mb-1">
                      Status: {lastStatus} • voteEligible: {String(voteEligible)}
                    </p>
                  )}

                  {availableAmount !== null && (
                    <p className="text-sm text-gray-400 mb-2">
                      Available: {availableAmount.toFixed(4)} {selectedToken.symbol}
                    </p>
                  )}

                  <div className="mt-2 space-x-2">
                    {[25, 50, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => handleQuickSelect(pct)}
                        className="bg-gray-700 px-3 py-1 rounded text-white"
                      >
                        %{pct}
                      </button>
                    ))}
                  </div>

                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="mt-4 w-full p-2 rounded bg-gray-800 border border-gray-600 text-white"
                  />

                  {/* 🆕 Status + vote info */}
                  <div className="mt-3 text-left space-y-1">
                    {statusLoading && (
                      <p className="text-xs text-gray-400">
                        Checking token health &amp; vote status…
                      </p>
                    )}

                    {!statusLoading && statusDecision && (
                      <div className="text-xs text-gray-300 space-y-1">
                        <p>
                          Current status:{' '}
                          <span className="font-semibold capitalize">
                            {statusDecision.status.replace('_', ' ')}
                          </span>
                        </p>
                        <p className="text-[11px] text-gray-400">
                          Zone: {statusDecision.zone}
                          {statusDecision.zone === 'wd_vote' && ' (community review zone)'}
                        </p>

                        {statusDecision.voteEligible && selectedToken && (
                          <div className="mt-2">
                            <DeadcoinVoteButton
                              mint={
                                selectedToken.symbol === 'SOL'
                                  ? WSOL_MINT
                                  : selectedToken.address
                              }
                              label="🗳️ Join the deadcoin vote"
                              onVoted={() => {
                                // Oy verildikten sonra statüyü tekrar çek
                                fetchStatusForToken(selectedToken);
                              }}
                              className="w-full justify-center"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {!statusLoading && statusError && (
                      <p className="text-xs text-rose-400">
                        {statusError}
                      </p>
                    )}
                  </div>

                  {showDebug && (
                    <p className="mt-3 text-xs text-yellow-400">
                      Records: tries /api/coincarnation/record then /api/record; errors shown verbosely.
                    </p>
                  )}

                  <button
                    onClick={handleConfirm}
                    className="mt-4 w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-xl font-bold"
                  >
                    Confirm Coincarnation
                  </button>

                  <button
                    onClick={() => {
                      setModalOpen(false);
                      setSelectedToken(null);
                      setAmount('');
                      setAvailableAmount(null);
                      setConfirmed(false);
                      setParticipantNumber(null);
                      setVoteEligible(false);
                      setLastMint(null);
                      setLastStatus(null);
                    }}
                    className="mt-2 w-full bg-gray-700 hover:bg-gray-600 py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold mb-4">🎉 Coincarnation Complete</h2>
                  <p className="text-sm text-yellow-400 mb-2">
                    ✅ {amount} {selectedToken?.symbol} registered successfully.
                  </p>
                  <p className="text-sm text-cyan-400 mb-4">
                    👻 Coincarnator #{participantNumber}
                  </p>

                  <div className="space-y-2 mt-4">
                    <button
                      onClick={() => {
                        setModalOpen(false);
                        setSelectedToken(null);
                        setAmount('');
                        setAvailableAmount(null);
                        setConfirmed(false);
                        setParticipantNumber(null);
                        setVoteEligible(false);
                        setLastMint(null);
                        setLastStatus(null);
                      }}
                      className="w-full py-2 rounded-xl bg-gray-700 hover:bg-gray-600"
                    >
                      🔁 Recoincarnate
                    </button>

                    <button
                      onClick={() => {
                        window.location.href = '/claim';
                      }}
                      className="w-full py-2 rounded-xl bg-blue-700 hover:bg-blue-600"
                    >
                      👤 Go to Profile
                    </button>

                    {voteEligible && lastMint && (
                      <button
                        onClick={() => {
                          // TODO: Bu route'u istediğin yapıya göre güncelleyebilirsin
                          window.location.href = `/vote/deadcoin?mint=${encodeURIComponent(
                            lastMint,
                          )}`;
                        }}
                        className="w-full py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600"
                      >
                        ⚖️ Join Deadcoin Vote for this token
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
