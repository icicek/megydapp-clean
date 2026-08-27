// app/api/_lib/claim/__tests__/allocation.test.ts

import {
    allocateClaimAmount,
    allocateClaimAmountOrThrow,
    getTouchedPhaseIds,
    type ClaimableBucket,
  } from '@/app/api/_lib/claim/allocation';
  
  describe('claim allocation', () => {
    test('allocates a claim from a single bucket', () => {
      const buckets: ClaimableBucket[] = [
        {
          walletAddress: 'wallet-a',
          phaseId: 12,
          phaseNo: 12,
          phaseName: 'Phase 12',
          claimableBase: 100n,
        },
      ];
  
      const result =
        allocateClaimAmountOrThrow(
          buckets,
          40n
        );
  
      expect(result.requestedBase).toBe(40n);
      expect(result.totalClaimableBase).toBe(
        100n
      );
      expect(result.allocatedBase).toBe(40n);
      expect(
        result.remainingRequestBase
      ).toBe(0n);
  
      expect(result.allocations).toEqual([
        {
          walletAddress: 'wallet-a',
          phaseId: 12,
          phaseNo: 12,
          phaseName: 'Phase 12',
          amountBase: 40n,
        },
      ]);
    });
  
    test('allocates across phases in supplied order', () => {
      const buckets: ClaimableBucket[] = [
        {
          walletAddress: 'wallet-a',
          phaseId: 12,
          claimableBase: 100n,
        },
        {
          walletAddress: 'wallet-a',
          phaseId: 13,
          claimableBase: 100n,
        },
        {
          walletAddress: 'wallet-a',
          phaseId: 14,
          claimableBase: 100n,
        },
      ];
  
      const result =
        allocateClaimAmountOrThrow(
          buckets,
          150n
        );
  
      expect(result.allocations).toEqual([
        {
          walletAddress: 'wallet-a',
          phaseId: 12,
          phaseNo: null,
          phaseName: null,
          amountBase: 100n,
        },
        {
          walletAddress: 'wallet-a',
          phaseId: 13,
          phaseNo: null,
          phaseName: null,
          amountBase: 50n,
        },
      ]);
  
      expect(
        getTouchedPhaseIds(
          result.allocations
        )
      ).toEqual([12, 13]);
    });
  
    test('counts one fee phase when multiple wallets contribute from the same phase', () => {
      const buckets: ClaimableBucket[] = [
        {
          walletAddress: 'wallet-a',
          phaseId: 12,
          claimableBase: 40n,
        },
        {
          walletAddress: 'wallet-b',
          phaseId: 12,
          claimableBase: 60n,
        },
        {
          walletAddress: 'wallet-b',
          phaseId: 13,
          claimableBase: 100n,
        },
      ];
  
      const result =
        allocateClaimAmountOrThrow(
          buckets,
          150n
        );
  
      expect(result.allocations).toEqual([
        {
          walletAddress: 'wallet-a',
          phaseId: 12,
          phaseNo: null,
          phaseName: null,
          amountBase: 40n,
        },
        {
          walletAddress: 'wallet-b',
          phaseId: 12,
          phaseNo: null,
          phaseName: null,
          amountBase: 60n,
        },
        {
          walletAddress: 'wallet-b',
          phaseId: 13,
          phaseNo: null,
          phaseName: null,
          amountBase: 50n,
        },
      ]);
  
      expect(
        getTouchedPhaseIds(
          result.allocations
        )
      ).toEqual([12, 13]);
    });
  
    test('returns remaining request amount when requested amount exceeds available balance', () => {
      const buckets: ClaimableBucket[] = [
        {
          walletAddress: 'wallet-a',
          phaseId: 12,
          claimableBase: 40n,
        },
        {
          walletAddress: 'wallet-b',
          phaseId: 13,
          claimableBase: 60n,
        },
      ];
  
      const result =
        allocateClaimAmount(
          buckets,
          150n
        );
  
      expect(result.totalClaimableBase).toBe(
        100n
      );
      expect(result.allocatedBase).toBe(
        100n
      );
      expect(
        result.remainingRequestBase
      ).toBe(50n);
    });
  
    test('throws when requested amount exceeds available balance in strict mode', () => {
      const buckets: ClaimableBucket[] = [
        {
          walletAddress: 'wallet-a',
          phaseId: 12,
          claimableBase: 100n,
        },
      ];
  
      expect(() =>
        allocateClaimAmountOrThrow(
          buckets,
          101n
        )
      ).toThrow(
        'CLAIM_AMOUNT_EXCEEDS_AVAILABLE'
      );
    });
  
    test('throws for zero or negative claim request', () => {
      const buckets: ClaimableBucket[] = [
        {
          walletAddress: 'wallet-a',
          phaseId: 12,
          claimableBase: 100n,
        },
      ];
  
      expect(() =>
        allocateClaimAmount(
          buckets,
          0n
        )
      ).toThrow(
        'CLAIM_REQUEST_AMOUNT_INVALID'
      );
  
      expect(() =>
        allocateClaimAmount(
          buckets,
          -1n
        )
      ).toThrow(
        'CLAIM_REQUEST_AMOUNT_INVALID'
      );
    });
  
    test('ignores zero-value buckets without changing order', () => {
      const buckets: ClaimableBucket[] = [
        {
          walletAddress: 'wallet-a',
          phaseId: 12,
          claimableBase: 0n,
        },
        {
          walletAddress: 'wallet-b',
          phaseId: 13,
          claimableBase: 100n,
        },
      ];
  
      const result =
        allocateClaimAmountOrThrow(
          buckets,
          50n
        );
  
      expect(result.allocations).toEqual([
        {
          walletAddress: 'wallet-b',
          phaseId: 13,
          phaseNo: null,
          phaseName: null,
          amountBase: 50n,
        },
      ]);
  
      expect(
        getTouchedPhaseIds(
          result.allocations
        )
      ).toEqual([13]);
    });
  });