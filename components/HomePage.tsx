'use client';

import { useEffect, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import CoincarneModal from '@/components/CoincarneModal';
import { fetchSolanaTokenList } from '@/lib/utils';
import { connection } from '@/lib/solanaConnection';
import StatsDisplay from '@/components/StatsDisplay';

interface TokenInfo {
  mint: string;
  amount: number;
  symbol?: string;
  logoURI?: string;
}

interface TokenMeta {
  address: string;
  symbol?: string;
  logoURI?: string;
}

export default function HomePage() {
  const { publicKey, connected } = useWallet();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref) {
        localStorage.setItem('referralCode', ref);
      }
    }
  }, []);

  useEffect(() => {
    if (!publicKey || !connected) return;

    const fetchWalletTokens = async () => {
      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: TOKEN_PROGRAM_ID,
        });

        const tokenListRaw: TokenInfo[] = [];

        for (const { account } of tokenAccounts.value) {
          const parsed = account.data.parsed;
          const mint = parsed.info.mint;
          const amount = parseFloat(parsed.info.tokenAmount.uiAmountString || '0');
          if (amount > 0) {
            tokenListRaw.push({ mint, amount });
          }
        }

        const solBalance = await connection.getBalance(publicKey);
        if (solBalance > 0) {
          tokenListRaw.unshift({ mint: 'SOL', amount: solBalance / 1e9, symbol: 'SOL' });
        }

        const tokenMetadata: TokenMeta[] = await fetchSolanaTokenList();

        const enriched = tokenListRaw.map((token) => {
          if (token.mint === 'SOL') return token;
          const metadata = tokenMetadata.find((t) => t.address === token.mint);
          return {
            ...token,
            symbol: metadata?.symbol || undefined,
            logoURI: metadata?.logoURI || undefined,
          };
        });

        setTokens(enriched);
      } catch (err) {
        console.error('❌ Error fetching wallet tokens:', err);
      }
    };

    fetchWalletTokens();
  }, [publicKey, connected]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mint = e.target.value;
    const token = tokens.find((t) => t.mint === mint || (mint === 'SOL' && t.mint === 'SOL'));
    if (token) {
      setSelectedToken(token);
      setShowModal(true);
    }
  };

  const handleGoToProfile = () => {
    window.location.href = '/profile';
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center p-6 space-y-12">

      {/* HERO SECTION */}
      <section className="text-center py-12 bg-gradient-to-br from-purple-800 via-black to-black w-full rounded-lg">
        <h1 className="text-5xl font-extrabold mb-4">
          Turn Deadcoins into a Fair Future.
        </h1>
        <p className="text-xl text-pink-400 mb-2">
          This is not a swap. This is reincarnation.
        </p>
        <p className="text-sm text-gray-300 max-w-xl mx-auto">
          Burning wealth inequality. One deadcoin at a time.
        </p>
      </section>

      {/* SWAP SECTION */}
      <div className="w-full max-w-md bg-gray-900 p-6 rounded-lg">
        <h2 className="text-lg mb-1 text-left">You give</h2>
        <p className="text-xs text-gray-400 text-left mb-2">
          Walking Deadcoins, Memecoins, deadcoins...
        </p>

        {publicKey ? (
          <select
            className="w-full bg-gray-800 text-white p-3 rounded mb-4"
            defaultValue=""
            onChange={handleSelectChange}
          >
            <option value="" disabled>
              👉 Select a token to Coincarnate
            </option>
            {tokens.map((token, idx) => (
              <option key={idx} value={token.mint}>
                {token.symbol || token.mint.slice(0, 4)} — {token.amount.toFixed(4)}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-gray-400">Connect your wallet to see your tokens.</p>
        )}

        <div className="text-2xl my-4 text-center">↔️</div>

        <h2 className="text-lg text-left mb-2">You receive</h2>
        <div className="bg-purple-700 text-white py-3 px-4 rounded text-center">
          $MEGY <span className="text-sm text-gray-300">(Future of Money)</span>
        </div>
      </div>

      {/* STATS SECTION */}
      <div className="w-full max-w-md">
        <StatsDisplay />
      </div>

      {/* MODAL */}
      {showModal && selectedToken && (
        <CoincarneModal
          token={selectedToken}
          onClose={() => {
            setSelectedToken(null);
            setShowModal(false);
          }}
          onGoToProfileRequest={handleGoToProfile}
        />
      )}

      {/* PROFILE BUTTON */}
      {publicKey && (
        <div>
          <button
            onClick={handleGoToProfile}
            className="bg-gradient-to-r from-green-500 to-teal-500 text-white font-semibold py-3 px-6 rounded-xl shadow hover:scale-105 transition-all duration-200"
          >
            🧾 Go to Profile
          </button>
        </div>
      )}
    </div>
  );
}
