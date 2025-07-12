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
        console.log('📣 Referral code stored:', ref);
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
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-10">
      <h1 className="text-4xl font-bold mb-4">🚀 Coincarnation</h1>
      <WalletMultiButton />

      <div className="mt-6 w-full max-w-md">
        <StatsDisplay />
      </div>

      <div className="mt-10 w-full max-w-md bg-gray-900 p-6 rounded-lg text-center">
        <h2 className="text-lg mb-2">You give</h2>
        <div className="bg-gray-700 py-3 px-4 rounded text-white">
          {selectedToken ? (
            <span>{selectedToken.symbol || selectedToken.mint.slice(0, 4)}</span>
          ) : (
            <span className="text-gray-400">Walking Deadcoins (memecoins, shitcoins...)</span>
          )}
        </div>

        <div className="text-2xl my-4">↔️</div>

        <h2 className="text-lg mb-2">You receive</h2>
        <div className="bg-purple-700 text-white py-3 px-4 rounded">
          $MEGY <span className="text-sm text-gray-300">(Future of Money)</span>
        </div>
      </div>

      {publicKey && (
        <div className="mt-6 w-full max-w-md">
          <h2 className="text-xl mb-2">Select a Token:</h2>
          {tokens.length === 0 && (
            <p className="text-red-500 mb-2">
              ❗ Token listesi boş. Cüzdanda token olmayabilir veya bir hata oluşmuş olabilir.
            </p>
          )}
          <select
            className="w-full bg-gray-800 text-white p-3 rounded"
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
        </div>
      )}

      {showModal && selectedToken && (
        <CoincarneModal
          token={selectedToken}
          onClose={() => {
            setSelectedToken(null);
            setShowModal(false);
          }}
          onGoToProfileRequest={handleGoToProfile} // ✅ burası eklendi
        />
      )}

      {publicKey && (
        <div className="mt-6">
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
