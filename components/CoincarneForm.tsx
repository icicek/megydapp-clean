'use client';

import React, { useEffect, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
} from '@solana/spl-token';
import {
  Dialog,
  DialogContent,
} from '@radix-ui/react-dialog';

interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  logoURI?: string;
  decimals: number;
}

type ListStatus = 'healthy' | 'walking_dead' | 'deadcoin' | 'redlist' | 'blacklist';

const TOKEN_LIST_URL =
  'https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export default function CoincarneForm() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();

  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [availableAmount, setAvailableAmount] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [participantNumber, setParticipantNumber] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // (Opsiyonel) pre-flight sonucu debug göstermek istersek:
  const [preflightInfo, setPreflightInfo] = useState<{
    status?: ListStatus | null;
    usdTotal?: number;
    source?: string;
    isDeadcoin?: boolean;
  } | null>(null);

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const res = await fetch(TOKEN_LIST_URL);
        const data = await res.json();
        setTokens(data.tokens as TokenInfo[]);
      } catch (err) {
        console.error('Token list fetch error:', err);
      }
    };

    fetchTokens();
  }, []);

  const fetchWalletBalance = async (token: TokenInfo) => {
    try {
      if (!publicKey) return;

      if (token.symbol === 'SOL') {
        const lamports = await connection.getBalance(publicKey);
        const solAmount = lamports / 1e9;
        setAvailableAmount(solAmount);
      } else {
        const tokenAddress = new PublicKey(token.address);
        const ata = await getAssociatedTokenAddress(tokenAddress, publicKey);
        const tokenAccount = await connection.getAccountInfo(ata);

        if (tokenAccount) {
          const parsed = await getAccount(connection, ata);
          const raw = parsed.amount;
          const decimals = token.decimals || 6;
          const realAmount = Number(raw) / Math.pow(10, decimals);
          setAvailableAmount(realAmount);
        } else {
          setAvailableAmount(0);
        }
      }
    } catch (err) {
      console.error('Failed to fetch token balance', err);
      setAvailableAmount(null);
    }
  };

  const handleSelect = (tokenSymbol: string) => {
    const token = tokens.find((t) => t.symbol === tokenSymbol);
    if (token) {
      setSelectedToken(token);
      setAmount('');
      setConfirmed(false);
      setModalOpen(true);
      setPreflightInfo(null);
      fetchWalletBalance(token);
    } else if (tokenSymbol === 'SOL') {
      const solToken: TokenInfo = {
        symbol: 'SOL',
        name: 'Solana',
        address: '',
        decimals: 9,
        logoURI: '',
      };
      setSelectedToken(solToken);
      setAmount('');
      setConfirmed(false);
      setModalOpen(true);
      setPreflightInfo(null);
      fetchWalletBalance(solToken);
    }
  };

  const handleQuickSelect = (pct: number) => {
    if (!availableAmount) return;
    const val = ((availableAmount * pct) / 100).toFixed(4);
    setAmount(val);
  };

  const handleConfirm = async () => {
    if (!amount || !selectedToken || !publicKey) return;

    const amt = parseFloat(amount);
    if (Number.isNaN(amt) || !(amt > 0)) return;

    setIsProcessing(true);

    try {
      // 0) Mint'i normalize et (SOL → WSOL)
      const mint =
        selectedToken.symbol === 'SOL' || !selectedToken.address
          ? WSOL_MINT
          : selectedToken.address;

      // 1) Liste durumu — blacklist/redlist engeli
      let listStatus: ListStatus | null = null;
      try {
        const stRes = await fetch(`/api/status?mint=${encodeURIComponent(mint)}`, { cache: 'no-store' });
        if (stRes.ok) {
          const stJson = await stRes.json();
          listStatus = (stJson?.status as ListStatus) ?? null;
        }
      } catch {
        // sessiz geç (server sorunları işlemi engellemesin; ama aşağıda price ile deadcoin path'i kontrol ederiz)
      }

      if (listStatus === 'blacklist' || listStatus === 'redlist') {
        setPreflightInfo({ status: listStatus });
        alert('⛔ This token is blocked (blacklist/redlist). Coincarnation is not allowed.');
        setIsProcessing(false);
        return; // ❌ sert engel
      }

      // 2) Fiyat kontrolü — deadcoin akışına izin ver
      let usdTotal = 0;
      let sourceName: string | undefined;
      let isDeadcoin = false;
      try {
        const qs = new URLSearchParams({ mint, amount: String(amt) });
        const prRes = await fetch(`/api/proxy/price?${qs}`, { cache: 'no-store' });
        const prJson = await prRes.json();

        const ok = !!prJson?.ok || !!prJson?.success;
        const unit = Number(prJson?.priceUsd ?? 0);
        const summed = Number(prJson?.usdValue ?? 0);
        usdTotal = ok ? (summed > 0 ? summed : unit * amt) : 0;

        if (ok) {
          if (Array.isArray(prJson?.sources) && prJson.sources.length) {
            sourceName = prJson.sources[0]?.source;
          } else if (prJson?.source) {
            sourceName = String(prJson.source);
          }
        }

        isDeadcoin = !ok || !(usdTotal > 0);
      } catch {
        // price alınamadı → deadcoin kabul et
        isDeadcoin = true;
      }

      setPreflightInfo({
        status: listStatus,
        usdTotal,
        source: sourceName,
        isDeadcoin,
      });

      // 3) (Bu form akışında) kayıt — mevcut payload'ı BOZMADAN bırakıyoruz
      const lastNum = parseInt(localStorage.getItem('lastCoincarnator') || '100', 10);
      const newNumber = lastNum + 1;
      setParticipantNumber(newNumber);

      const tx = {
        wallet: publicKey.toBase58(),
        token: selectedToken.symbol,
        amount: amt,
        number: newNumber,
        timestamp: new Date().toISOString(),
        // Not: /api/record payload’ını değiştirmiyoruz
        // (Gerekirse server tarafı /api/record → /api/coincarnation/record'a yönlendirilebilir)
      };

      await fetch('/api/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx),
      });

      localStorage.setItem('lastCoincarnation', JSON.stringify(tx));
      localStorage.setItem('lastCoincarnator', newNumber.toString());
      setConfirmed(true);
    } catch (err) {
      console.error('❌ Error sending to backend:', err);
      alert('❌ Failed to record your coincarnation.');
    } finally {
      setIsProcessing(false);
    }
  };

  const generateTweetText = () => {
    return encodeURIComponent(
      `🚀 I just Coincarne'd my $${selectedToken?.symbol} for $MEGY.\n` +
      `👻 Coincarnator #${participantNumber} reporting in.\n\n` +
      `💥 Reviving deadcoins for a better future.\n` +
      `🔗 Join us: https://coincarnation.com`
    );
  };

  // Debug paneli URL parametresiyle aç/kapat (opsiyonel)
  const showDebug =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');

  return (
    <div className="bg-gray-900 mt-10 p-6 rounded-xl w-full max-w-2xl border border-gray-700">
      <h2 className="text-2xl font-bold mb-4 text-white">🔥 Coincarne Your Tokens</h2>

      {!publicKey && (
        <p className="text-yellow-400">Please connect your wallet to continue.</p>
      )}

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

          <Dialog open={modalOpen} onOpenChange={setModalOpen}>
            <DialogContent className="bg-gray-900 border border-white rounded-2xl p-6 w-full max-w-md text-center">
              {isProcessing ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <img src="/icons/hourglass.svg" className="w-10 h-10 mb-4 animate-spin" alt="Coincarnating..." />
                  <p className="text-white text-lg font-semibold">🕒 Coincarnating...</p>
                </div>
              ) : selectedToken && !confirmed ? (
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

                  {/* (opsiyonel) debug / küçük preflight etiketi */}
                  {showDebug && preflightInfo && (
                    <div className="text-xs text-left bg-gray-800/60 rounded p-2 mt-3">
                      <div>listStatus: <b>{preflightInfo.status ?? '—'}</b></div>
                      <div>usdTotal: <b>{preflightInfo.usdTotal ?? 0}</b></div>
                      <div>source: <b>{preflightInfo.source ?? '—'}</b></div>
                      <div>isDeadcoin: <b>{String(preflightInfo.isDeadcoin ?? false)}</b></div>
                    </div>
                  )}

                  <button
                    onClick={handleConfirm}
                    className="mt-4 w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-xl font-bold"
                  >
                    Confirm Coincarnation
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
                        setPreflightInfo(null);
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

                    <a
                      href={`https://twitter.com/intent/tweet?text=${generateTweetText()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <button className="w-full py-2 rounded-xl bg-green-700 hover:bg-green-600">
                        🐦 Share on X
                      </button>
                    </a>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
