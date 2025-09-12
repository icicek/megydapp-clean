import { renderHook, waitFor } from '@testing-library/react';
import { useInternalBalance } from '../useInternalBalance';

// --- Mocks ---
jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: jest.fn(),
}));

jest.mock('@/lib/solanaConnection', () => ({
  connection: {
    getBalance: jest.fn(),
    getAccountInfo: jest.fn(),
  },
}));

jest.mock('@solana/spl-token', () => ({
  getAssociatedTokenAddress: jest.fn(),
  getMint: jest.fn(),
  getAccount: jest.fn(),
}));

jest.mock('@solana/web3.js', () => ({
  PublicKey: function (x: string) {
    this.value = x;
    this.toBase58 = () => String(x);
  },
}));

const mockUseWallet = require('@solana/wallet-adapter-react').useWallet as jest.Mock;
const mockConn = require('@/lib/solanaConnection').connection as any;
const spl = require('@solana/spl-token');

describe('useInternalBalance', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no wallet', async () => {
    mockUseWallet.mockReturnValue({ publicKey: null, connected: false });
    const { result } = renderHook(() => useInternalBalance('SOL', { isSOL: true }));
    expect(result.current.balance).toBeNull();
  });

  it('fetches SOL balance', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: { toBase58: () => 'WALLET' },
      connected: true,
    });
    mockConn.getBalance.mockResolvedValueOnce(2e9); // 2 SOL

    const { result } = renderHook(() => useInternalBalance('SOL', { isSOL: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.balance).toEqual({ amount: 2, decimals: 9 });
    expect(result.current.error).toBeNull();
  });

  it('fetches SPL balance (ATA exists)', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: { toBase58: () => 'WALLET' },
      connected: true,
    });

    // Mint & ATA
    (spl.getAssociatedTokenAddress as jest.Mock).mockResolvedValueOnce('ATA');
    mockConn.getAccountInfo.mockResolvedValueOnce({}); // ATA exists
    (spl.getMint as jest.Mock).mockResolvedValueOnce({ decimals: 6 });
    (spl.getAccount as jest.Mock).mockResolvedValueOnce({ amount: BigInt(1230000) }); // 1.23

    const { result } = renderHook(() => useInternalBalance('MINT_X'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.balance).toEqual({ amount: 1.23, decimals: 6 });
  });

  it('returns zero when ATA missing', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: { toBase58: () => 'WALLET' },
      connected: true,
    });

    (spl.getAssociatedTokenAddress as jest.Mock).mockResolvedValueOnce('ATA');
    mockConn.getAccountInfo.mockResolvedValueOnce(null); // no ATA
    (spl.getMint as jest.Mock).mockResolvedValueOnce({ decimals: 8 });

    const { result } = renderHook(() => useInternalBalance('MINT_Y'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.balance).toEqual({ amount: 0, decimals: 8 });
  });
});
