// app/api/utils/__tests__/classifyToken.test.ts

import classifyToken from '../classifyToken';

// --- Mocks ---
import getUsdValue from '../getUsdValue';
import { checkTokenLiquidityAndVolume } from '../checkTokenLiquidityAndVolume';
import { getEffectiveStatus } from '@/app/api/_lib/registry';

jest.mock('../getUsdValue', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../checkTokenLiquidityAndVolume', () => ({
  __esModule: true,
  checkTokenLiquidityAndVolume: jest.fn(),
}));

jest.mock('@/app/api/_lib/registry', () => ({
  __esModule: true,
  getEffectiveStatus: jest.fn(),
}));

const mockGetUsdValue = getUsdValue as jest.MockedFunction<typeof getUsdValue>;
const mockCheckTokenLiquidityAndVolume =
  checkTokenLiquidityAndVolume as jest.MockedFunction<
    typeof checkTokenLiquidityAndVolume
  >;
const mockGetEffectiveStatus =
  getEffectiveStatus as jest.MockedFunction<typeof getEffectiveStatus>;

function makeLiquidityResult(partial: Partial<import('../checkTokenLiquidityAndVolume').LiquidityResult> = {}) {
  return {
    volume: partial.volume ?? 0,
    dexVolume: partial.dexVolume ?? 0,
    cexVolume: partial.cexVolume ?? 0,
    liquidity: partial.liquidity ?? 0,
    category: partial.category ?? 'deadcoin',
    reason: partial.reason ?? 'no_data',
    sources:
      partial.sources ??
      ({
        dex: 'none',
        cex: 'none',
      } as any),
  } as import('../checkTokenLiquidityAndVolume').LiquidityResult;
}

describe('classifyToken', () => {
  const token = { mint: 'TEST_MINT', symbol: 'TEST' };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  // 1) Registry hard overrides
  it('returns blacklist when registry status is blacklist (no pricing or liquidity needed)', async () => {
    mockGetEffectiveStatus.mockResolvedValue('blacklist' as any);

    const res = await classifyToken(token, 100);

    expect(res.category).toBe('blacklist');
    expect(res.status).toBe('ok');
    expect(mockGetUsdValue).not.toHaveBeenCalled();
    expect(mockCheckTokenLiquidityAndVolume).not.toHaveBeenCalled();
  });

  it('returns redlist when registry status is redlist', async () => {
    mockGetEffectiveStatus.mockResolvedValue('redlist' as any);

    const res = await classifyToken(token, 50);

    expect(res.category).toBe('redlist');
    expect(res.status).toBe('ok');
    expect(mockGetUsdValue).not.toHaveBeenCalled();
    expect(mockCheckTokenLiquidityAndVolume).not.toHaveBeenCalled();
  });

  it('returns deadcoin when registry status is deadcoin', async () => {
    mockGetEffectiveStatus.mockResolvedValue('deadcoin' as any);

    const res = await classifyToken(token, 10);

    expect(res.category).toBe('deadcoin');
    expect(res.status).toBe('ok');
    expect(mockGetUsdValue).not.toHaveBeenCalled();
    expect(mockCheckTokenLiquidityAndVolume).not.toHaveBeenCalled();
  });

  // 2) Price layer: error / not_found
  it('returns unknown when price pipeline returns error', async () => {
    mockGetEffectiveStatus.mockResolvedValue(null as any);

    mockGetUsdValue.mockResolvedValue({
      status: 'error',
      usdValue: 0,
      sources: [],
    } as any);

    const res = await classifyToken(token, 100);

    expect(res.category).toBe('unknown');
    expect(res.status).toBe('error');
    expect(res.usdValue).toBe(0);
    expect(mockCheckTokenLiquidityAndVolume).not.toHaveBeenCalled();
  });

  it('returns deadcoin when price not found or usdValue <= 0', async () => {
    mockGetEffectiveStatus.mockResolvedValue(null as any);

    mockGetUsdValue.mockResolvedValue({
      status: 'not_found',
      usdValue: 0,
      sources: [{ source: 'coingecko', price: 0 }],
    } as any);

    const res = await classifyToken(token, 100);

    expect(res.category).toBe('deadcoin');
    expect(res.status).toBe('not_found');
    expect(res.usdValue).toBe(0);
    expect(mockCheckTokenLiquidityAndVolume).not.toHaveBeenCalled();
  });

  // 3) Happy path: price OK → metrics layer (healthy)
  it('returns healthy when price is OK and liquidity classification is healthy', async () => {
    mockGetEffectiveStatus.mockResolvedValue(null as any);

    mockGetUsdValue.mockResolvedValue({
      status: 'ok',
      usdValue: 123.45,
      sources: [{ source: 'coingecko', price: 1.23 }],
    } as any);

    mockCheckTokenLiquidityAndVolume.mockResolvedValue(
      makeLiquidityResult({
        category: 'healthy',
        volume: 5000,
        dexVolume: 3000,
        cexVolume: 2000,
        liquidity: 200_000,
        reason: 'healthy',
      }),
    );

    const res = await classifyToken(token, 100);

    expect(res.category).toBe('healthy');
    expect(res.status).toBe('ok');
    expect(res.usdValue).toBeCloseTo(123.45);
    expect(res.volume).toBe(5000);
    expect(res.liquidity).toBe(200_000);
    expect(res.volumeBreakdown).toEqual({
      dexVolumeUSD: 3000,
      cexVolumeUSD: 2000,
      totalVolumeUSD: 5000,
    });
  });

  // 4) Happy path: price OK → metrics layer (walking_dead)
  it('returns walking_dead when price is OK but metrics layer marks as walking_dead', async () => {
    mockGetEffectiveStatus.mockResolvedValue(null as any);

    mockGetUsdValue.mockResolvedValue({
      status: 'ok',
      usdValue: 42,
      sources: [{ source: 'raydium', price: 0.42 }],
    } as any);

    mockCheckTokenLiquidityAndVolume.mockResolvedValue(
      makeLiquidityResult({
        category: 'walking_dead',
        volume: 80,
        dexVolume: 80,
        cexVolume: 0,
        liquidity: 1500,
        reason: 'illiquid',
      }),
    );

    const res = await classifyToken(token, 100);

    expect(res.category).toBe('walking_dead');
    expect(res.status).toBe('ok');
    expect(res.usdValue).toBe(42);
    expect(res.volume).toBe(80);
    expect(res.liquidity).toBe(1500);
  });

  // 5) Defensive: registry call fails → still rely on price + metrics
  it('falls back to pricing & metrics when getEffectiveStatus throws', async () => {
    mockGetEffectiveStatus.mockRejectedValue(new Error('registry error'));

    mockGetUsdValue.mockResolvedValue({
      status: 'ok',
      usdValue: 10,
      sources: [{ source: 'coingecko', price: 0.1 }],
    } as any);

    mockCheckTokenLiquidityAndVolume.mockResolvedValue(
      makeLiquidityResult({
        category: 'healthy',
        volume: 100,
        dexVolume: 100,
        liquidity: 10_000,
        reason: 'healthy',
      }),
    );

    const res = await classifyToken(token, 100);

    expect(res.category).toBe('healthy');
    expect(res.status).toBe('ok');
  });
});
