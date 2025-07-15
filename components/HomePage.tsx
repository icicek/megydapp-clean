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
  const [globalStats, setGlobalStats] = useState({
    totalUsd: 0,
    totalParticipants: 0,
    uniqueDeadcoins: 0,
    mostPopularDeadcoin: '',
  });

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

    const fetchGlobalStats = async () => {
      try {
        const res = await fetch('/api/coincarnation/stats');
        const data = await res.json();
        if (data.success) {
          setGlobalStats({
            totalUsd: data.totalUsd,
            totalParticipants: data.totalParticipants,
            uniqueDeadcoins: data.uniqueDeadcoins,
            mostPopularDeadcoin: data.mostPopularDeadcoin,
          });
        }
      } catch (err) {
        console.error('❌ Failed to fetch stats:', err);
      }
    };

    fetchWalletTokens();
    fetchGlobalStats();
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
      {/* Other UI Elements */}

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
