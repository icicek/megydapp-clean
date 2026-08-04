import { renderHook, waitFor } from '@testing-library/react';
import { useWalletTokens } from '../useWalletTokens';

jest.mock(
  '@solana/spl-token',
  () => ({
    TOKEN_PROGRAM_ID:
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    TOKEN_2022_PROGRAM_ID:
      'TokenzQdBNbLqP5VE6cJow7Ypt53UFcYkuETMZioLhX',
  }),
  { virtual: true }
);

jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: jest.fn(),
  useConnection: jest.fn(),
}));

const mockUseWallet =
  require('@solana/wallet-adapter-react')
    .useWallet as jest.Mock;

const mockUseConnection =
  require('@solana/wallet-adapter-react')
    .useConnection as jest.Mock;

const mockConn = {
  getParsedTokenAccountsByOwner: jest.fn(),
  getBalance: jest.fn(),
};

describe('useWalletTokens', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    mockUseConnection.mockReturnValue({
      connection: mockConn,
    });

    /*
     * Force the hook through its client-RPC fallback path.
     */
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn(),
    }) as jest.Mock;
  });

  it('returns empty when not connected', () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      connected: false,
    });

    const { result } = renderHook(() =>
      useWalletTokens()
    );

    expect(result.current.tokens).toEqual([]);
  });

  it('collects tokens from Token Program and adds SOL', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: {
        toBase58: () => 'W',
      },
      connected: true,
    });

    mockConn.getParsedTokenAccountsByOwner
      .mockResolvedValueOnce({
        value: [
          {
            account: {
              data: {
                parsed: {
                  info: {
                    mint: 'MINT_A',
                    tokenAmount: {
                      uiAmountString: '5',
                      decimals: 6,
                    },
                  },
                },
              },
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        value: [],
      });

    mockConn.getBalance.mockResolvedValueOnce(0);

    const { result } = renderHook(() =>
      useWalletTokens()
    );

    await waitFor(() =>
      expect(result.current.loading).toBe(false)
    );

    expect(result.current.tokens).toEqual([
      expect.objectContaining({
        mint: 'MINT_A',
        amount: 5,
        uiAmountString: '5',
        decimals: 6,
        symbol: 'MINT_A',
        name: 'MINT_A',
      }),
    ]);
  });

  it('adds SOL when lamports are greater than zero', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: {
        toBase58: () => 'W',
      },
      connected: true,
    });

    mockConn.getParsedTokenAccountsByOwner.mockResolvedValue({
      value: [],
    });

    mockConn.getBalance.mockResolvedValueOnce(1.5e9);

    const { result } = renderHook(() =>
      useWalletTokens()
    );

    await waitFor(() =>
      expect(result.current.loading).toBe(false)
    );

    expect(result.current.tokens[0]).toEqual(
      expect.objectContaining({
        mint: 'So11111111111111111111111111111111111111112',
        amount: 1.5,
        symbol: 'SOL',
        name: 'Solana',
        decimals: 9,
      })
    );
  });
});