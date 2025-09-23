import { renderHook, waitFor } from '@testing-library/react';
import { useWalletTokens } from '../useWalletTokens';

jest.mock('@solana/spl-token', () => ({
  TOKEN_PROGRAM_ID: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  TOKEN_2022_PROGRAM_ID: 'TokenzQdBNbLqP5VE6cJow7Ypt53UFcYkuETMZioLhX',
}), { virtual: true });

jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/lib/solanaConnection', () => ({
  connection: {
    getParsedTokenAccountsByOwner: jest.fn(),
    getBalance: jest.fn(),
  },
}));

jest.mock('@/lib/utils', () => ({
  fetchSolanaTokenList: jest.fn(),
}));

jest.mock('@/lib/client/fetchTokenMetadataClient', () => ({
  fetchTokenMetadataClient: jest.fn(),
}));

const mockUseWallet = require('@solana/wallet-adapter-react').useWallet as jest.Mock;
const mockConn = require('@/lib/solanaConnection').connection as any;
const mockTokenList = require('@/lib/utils').fetchSolanaTokenList as jest.Mock;
const mockFetchMeta = require('@/lib/client/fetchTokenMetadataClient').fetchTokenMetadataClient as jest.Mock;

describe('useWalletTokens', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty when not connected', () => {
    mockUseWallet.mockReturnValue({ publicKey: null, connected: false });
    const { result } = renderHook(() => useWalletTokens());
    expect(result.current.tokens).toEqual([]);
  });

  it('collects tokens from Token Program & adds SOL', async () => {
    mockUseWallet.mockReturnValue({ publicKey: { toBase58: () => 'W' }, connected: true });

    // Program 1: one SPL with balance 5
    (mockConn.getParsedTokenAccountsByOwner as jest.Mock).mockResolvedValueOnce({
      value: [{
        account: {
          data: { parsed: { info: { mint: 'MINT_A', tokenAmount: { uiAmountString: '5', decimals: 6 } } } }
        }
      }]
    });
    // Program 2: zero balance token (filtered out)
    (mockConn.getParsedTokenAccountsByOwner as jest.Mock).mockResolvedValueOnce({ value: [] });

    // No SOL balance
    mockConn.getBalance.mockResolvedValueOnce(0);

    // Token list metadata
    mockTokenList.mockResolvedValueOnce([{ address: 'MINT_A', symbol: 'AAA', logoURI: 'x' }]);
    mockFetchMeta.mockResolvedValue(null);

    const { result } = renderHook(() => useWalletTokens());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tokens).toEqual([
      { mint: 'MINT_A', amount: 5, symbol: 'AAA', logoURI: 'x' },
    ]);
  });

  it('adds SOL when lamports > 0', async () => {
    mockUseWallet.mockReturnValue({ publicKey: { toBase58: () => 'W' }, connected: true });

    (mockConn.getParsedTokenAccountsByOwner as jest.Mock).mockResolvedValue({ value: [] });
    mockConn.getBalance.mockResolvedValueOnce(1.5e9); // 1.5 SOL
    mockTokenList.mockResolvedValueOnce([]);
    mockFetchMeta.mockResolvedValue(null);

    const { result } = renderHook(() => useWalletTokens());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tokens[0]).toEqual({ mint: 'SOL', amount: 1.5, symbol: 'SOL' });
  });
});
