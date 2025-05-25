'use client';

import { useEffect, useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import CoincarneModal from '@/components/CoincarneModal';
import { fetchSolanaTokenList } from '@/lib/utils';
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
  const { connection } = useConnection();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [showModal, setShowModal] = useState(false);

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
          const metadata = tokenMetadata.find((t: TokenMeta) => t.address === token.mint);
          return {
            ...token,
            symbol: metadata?.symbol || undefined,
            logoURI: metadata?.logoURI || undefined,
          };
        });

        setTokens(enriched);
      } catch (err) {
        console.error('Error fetching wallet tokens:', err);
      }
    };

    fetchWalletTokens();
  }, [publicKey, connected, connection]);

  const handleTokenClick = (token: TokenInfo) => {
    setSelectedToken(token);
    setShowModal(true);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-10">
      <h1 className="text-4xl font-bold mb-4">🚀 Coincarnation</h1>
      <WalletMultiButton />

      {/* ✅ İstatistik ekranı */}
      <div className="mt-6 w-full max-w-md">
        <StatsDisplay />
      </div>

      {/* ✅ From-To UI (her zaman görünür) */}
      <div className="mt-10 w-full max-w-md bg-gray-900 p-6 rounded-lg text-center">
        <h2 className="text-lg mb-2">You give</h2>
        <div
          onClick={() => {
            if (!connected) return;
          }}
          className="bg-gray-700 py-3 px-4 rounded cursor-pointer"
        >
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

      {/* ✅ Token listesi */}
      {publicKey && (
        <div className="mt-6 w-full max-w-md">
          <h2 className="text-xl mb-2">Your Tokens:</h2>
          <div className="bg-gray-800 rounded p-4 space-y-2">
            {tokens.length === 0 && <p className="text-sm text-gray-400">No tokens found</p>}
            {tokens.map((token, idx) => (
              <div
                key={idx}
                onClick={() => handleTokenClick(token)}
                className="cursor-pointer bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm flex justify-between items-center"
              >
                <div className="flex items-center space-x-2">
                  {token.logoURI && (
                    <img src={token.logoURI} alt={token.symbol} className="w-5 h-5 rounded-full" />
                  )}
                  <span>{token.symbol || token.mint.slice(0, 4) + '...'}</span>
                </div>
                <span>{token.amount.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ✅ Modal */}
      {showModal && selectedToken && (
        <CoincarneModal
          token={selectedToken}
          onClose={() => {
            setSelectedToken(null);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
