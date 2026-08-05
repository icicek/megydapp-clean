import { renderHook, waitFor } from '@testing-library/react';
import { useInternalBalance } from '../useInternalBalance';

// --- Mocks ---
jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: jest.fn(),
  useConnection: jest.fn(),
}));

jest.mock('@solana/spl-token', () => ({
  getAssociatedTokenAddress: jest.fn(),
  unpackMint: jest.fn(),
  getAccount: jest.fn(),
  TOKEN_PROGRAM_ID: {
    toBase58: () =>
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  },
  TOKEN_2022_PROGRAM_ID: {
    toBase58: () =>
      'TokenzQdBNbLqP5VE6cJow7Ypt53UFcYkuETMZioLhX',
  },
}));

jest.mock('@solana/web3.js', () => {
  class MockPublicKey {
    private readonly value: string;

    constructor(value: string) {
      this.value = value;
    }

    toBase58(): string {
      return this.value;
    }

    toString(): string {
      return this.value;
    }
  }

  return {
    PublicKey: MockPublicKey,
  };
});

const mockUseWallet = require('@solana/wallet-adapter-react')
  .useWallet as jest.Mock;

const mockUseConnection = require('@solana/wallet-adapter-react')
  .useConnection as jest.Mock;

const mockConn = {
  getBalance: jest.fn(),
  getAccountInfo: jest.fn(),
};

const spl = require('@solana/spl-token') as {
  getAssociatedTokenAddress: jest.Mock;
  unpackMint: jest.Mock;
  getAccount: jest.Mock;
};

describe('useInternalBalance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  
    mockUseConnection.mockReturnValue({
      connection: mockConn,
    });
  });

  it('returns null when no wallet', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      connected: false,
    });

    const { result } = renderHook(() =>
      useInternalBalance('SOL', { isSOL: true })
    );

    expect(result.current.balance).toBeNull();
  });

  it('fetches SOL balance', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: { toBase58: () => 'WALLET' },
      connected: true,
    });

    mockConn.getBalance.mockResolvedValueOnce(2e9);

    const { result } = renderHook(() =>
      useInternalBalance('SOL', { isSOL: true })
    );

    await waitFor(() =>
      expect(result.current.loading).toBe(false)
    );

    expect(result.current.balance).toEqual({
      amount: 2,
      decimals: 9,
    });

    expect(result.current.error).toBeNull();
  });

  it('fetches SPL balance when ATA exists', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: { toBase58: () => 'WALLET' },
      connected: true,
    });

    mockConn.getAccountInfo.mockResolvedValueOnce({
      owner: {
        equals: jest.fn().mockReturnValue(false),
      },
    });

    spl.unpackMint.mockReturnValueOnce({
      decimals: 6,
    });

    spl.getAssociatedTokenAddress.mockResolvedValueOnce('ATA');

    spl.getAccount.mockResolvedValueOnce({
      amount: BigInt(1230000),
    });

    const { result } = renderHook(() =>
      useInternalBalance('MINT_X')
    );

    await waitFor(() =>
      expect(result.current.loading).toBe(false)
    );

    expect(result.current.error).toBeNull();

    expect(result.current.balance).toEqual({
      amount: 1.23,
      decimals: 6,
    });
  });

  it('returns zero when ATA is missing', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: { toBase58: () => 'WALLET' },
      connected: true,
    });

    mockConn.getAccountInfo.mockResolvedValueOnce({
      owner: {
        equals: jest.fn().mockReturnValue(false),
      },
    });

    spl.unpackMint.mockReturnValueOnce({
      decimals: 8,
    });

    spl.getAssociatedTokenAddress.mockResolvedValueOnce('ATA');

    spl.getAccount.mockRejectedValueOnce(
      new Error('Token account not found')
    );

    const { result } = renderHook(() =>
      useInternalBalance('MINT_Y')
    );

    await waitFor(() =>
      expect(result.current.loading).toBe(false)
    );

    expect(result.current.error).toBeNull();

    expect(result.current.balance).toEqual({
      amount: 0,
      decimals: 8,
    });
  });
});