'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
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

  const showDebug =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');

  const destKey = useMemo(() => {
    try { return DEST_SOLANA ? new PublicKey(DEST_SOLANA) : null; } catch { return null; }
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
      fetchWalletBalance(token);
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

  // 🔁 Record helper: önce yeni endpoint, olmazsa legacy endpoint
  async function recordContribution(payload: any) {
    const idem = payload.idempotency_key;

    // 1) Yeni endpoint
    let res = await fetch('/api/coincarnation/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('[record] /api/coincarnation/record failed:', res.status, txt);

      // 2) Legacy fallback
      const res2 = await fetch('/api/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem },
        body: JSON.stringify(payload),
      });
      if (!res2.ok) {
        const txt2 = await res2.text();
        console.error('[record] /api/record failed:', res2.status, txt2);
        throw new Error(`Record failed.\n/coincarnation/record: ${res.status} ${txt}\n/record: ${res2.status} ${txt2}`);
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
      // 1) Redlist/Blacklist
      const mint = selectedToken.symbol === 'SOL' ? WSOL_MINT : selectedToken.address!;
      let listStatus: ListStatus | null = null;
      try {
        const stRes = await fetch(`/api/status?mint=${encodeURIComponent(mint)}`, { cache: 'no-store' });
        if (stRes.ok) listStatus = (await stRes.json())?.status ?? null;
      } catch {}
      if (listStatus === 'blacklist' || listStatus === 'redlist') {
        alert('⛔ This token is blocked (blacklist/redlist).');
        setIsProcessing(false);
        return;
      }

      // 2) USD (opsiyonel)
      let usdTotal = 0;
      try {
        const qs = new URLSearchParams({ mint, amount: String(amt) });
        const pr = await fetch(`/api/proxy/price?${qs}`, { cache: 'no-store' });
        const j = await pr.json();
        if (j?.ok || j?.success) {
          usdTotal = Number(j.usdValue ?? 0) || Number(j.priceUsd ?? 0) * amt || 0;
        }
      } catch {}

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

      // 4) Record — after chain confirm
      const idem =
        (typeof self !== 'undefined' && (self as any).crypto?.randomUUID?.()) ||
        `${Date.now()}-${Math.random()}`;

      const payload = {
        wallet_address: publicKey.toBase58(),
        token_symbol: selectedToken.symbol,
        token_contract: selectedToken.symbol === 'SOL' ? null : selectedToken.address,
        token_amount: amt,
        usd_value: usdTotal || 0,
        network: 'solana',
        transaction_signature: signature,
        idempotency_key: idem,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        asset_kind: assetKind,
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
                  <img src="/icons/hourglass.svg" className="w-10 h-10 mb-4 animate-spin" alt="Coincarnating..." />
                  <p className="text-white text-lg font-semibold">🕒 Coincarnating...</p>
                </div>
              ) : !confirmed ? (
                <>
                  <h2 className="text-xl font-bold mb-4">Coincarnate {selectedToken.symbol}</h2>
                  {availableAmount !== null && (
                    <p className="text-sm text-gray-400 mb-2">
                      Available: {availableAmount.toFixed(4)} {selectedToken.symbol}
                    </p>
                  )}

                  <div className="mt-2 space-x-2">
                    {[25, 50, 75, 100].map((pct) => (
                      <button key={pct} onClick={() => handleQuickSelect(pct)} className="bg-gray-700 px-3 py-1 rounded text-white">
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

                  {showDebug && (
                    <p className="mt-3 text-xs text-yellow-400">
                      Records: tries /api/coincarnation/record then falls back to /api/record. Errors shown verbosely.
                    </p>
                  )}

                  <button
                    onClick={handleConfirm}
                    className="mt-4 w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-xl font-bold"
                  >
                    Confirm Coincarnation
                  </button>

                  <button
                    onClick={() => { setModalOpen(false); setSelectedToken(null); setAmount(''); }}
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
                  <p className="text-sm text-cyan-400 mb-4">👻 Coincarnator #{participantNumber}</p>

                  <div className="space-y-2 mt-4">
                    <button
                      onClick={() => {
                        setModalOpen(false);
                        setSelectedToken(null);
                        setAmount('');
                        setAvailableAmount(null);
                        setConfirmed(false);
                        setParticipantNumber(null);
                      }}
                      className="w-full py-2 rounded-xl bg-gray-700 hover:bg-gray-600"
                    >
                      🔁 Recoincarnate
                    </button>

                    <button
                      onClick={() => { window.location.href = '/claim'; }}
                      className="w-full py-2 rounded-xl bg-blue-700 hover:bg-blue-600"
                    >
                      👤 Go to Profile
                    </button>
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
