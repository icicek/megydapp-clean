// app/api/_lib/claim/allocation.ts

/**
 * A single claimable balance bucket.
 *
 * IMPORTANT:
 * The order of the supplied buckets is economically meaningful.
 * allocateClaimAmount() consumes buckets in the exact order received.
 *
 * For identity-wide claims, callers should therefore provide buckets in the
 * same deterministic order used by the claim execution path, currently:
 *
 *   phase_id ASC, wallet_address ASC
 */
export type ClaimableBucket = {
    walletAddress: string;
    phaseId: number;
    phaseNo?: number | null;
    phaseName?: string | null;
    claimableBase: bigint;
  };
  
  /**
   * The part of a claim request allocated to one wallet + phase bucket.
   */
  export type ClaimAllocation = {
    walletAddress: string;
    phaseId: number;
    phaseNo?: number | null;
    phaseName?: string | null;
    amountBase: bigint;
  };
  
  /**
   * Full deterministic allocation result.
   */
  export type ClaimAllocationResult = {
    requestedBase: bigint;
    totalClaimableBase: bigint;
    allocatedBase: bigint;
    remainingRequestBase: bigint;
    allocations: ClaimAllocation[];
  };
  
  /**
   * Normalizes and validates one claimable bucket.
   *
   * This helper deliberately does not:
   * - query the database,
   * - check identity ownership,
   * - calculate MEGY decimals,
   * - calculate claim fees,
   * - mutate caller-owned input objects.
   *
   * Those responsibilities belong to their respective layers.
   */
  function normalizeBucket(
    bucket: ClaimableBucket
  ): ClaimableBucket {
    const walletAddress = String(
      bucket.walletAddress ?? ''
    ).trim();
  
    if (!walletAddress) {
      throw new Error(
        'CLAIM_BUCKET_WALLET_REQUIRED'
      );
    }
  
    if (
      !Number.isInteger(bucket.phaseId) ||
      bucket.phaseId <= 0
    ) {
      throw new Error(
        'CLAIM_BUCKET_PHASE_INVALID'
      );
    }
  
    if (
      typeof bucket.claimableBase !== 'bigint'
    ) {
      throw new Error(
        'CLAIM_BUCKET_AMOUNT_INVALID'
      );
    }
  
    return {
      walletAddress,
      phaseId: bucket.phaseId,
      phaseNo:
        bucket.phaseNo == null
          ? null
          : bucket.phaseNo,
      phaseName:
        bucket.phaseName == null
          ? null
          : String(bucket.phaseName),
      claimableBase:
        bucket.claimableBase > 0n
          ? bucket.claimableBase
          : 0n,
    };
  }
  
  /**
   * Deterministically allocates a requested MEGY amount across claimable
   * wallet + phase buckets.
   *
   * Buckets are consumed in the exact order supplied by the caller.
   *
   * Example:
   *
   *   P12 / Wallet A -> 100 MEGY
   *   P13 / Wallet A -> 100 MEGY
   *   P14 / Wallet B -> 100 MEGY
   *
   * Requested: 150 MEGY
   *
   * Result:
   *
   *   P12 / Wallet A -> 100
   *   P13 / Wallet A -> 50
   *   P14 / Wallet B -> untouched
   *
   * All amounts are base units (bigint), so no floating-point arithmetic is
   * introduced into the economic allocation path.
   */
  export function allocateClaimAmount(
    buckets: readonly ClaimableBucket[],
    requestedBase: bigint
  ): ClaimAllocationResult {
    if (
      typeof requestedBase !== 'bigint' ||
      requestedBase <= 0n
    ) {
      throw new Error(
        'CLAIM_REQUEST_AMOUNT_INVALID'
      );
    }
  
    const normalizedBuckets =
      buckets.map(normalizeBucket);
  
    const totalClaimableBase =
      normalizedBuckets.reduce(
        (sum, bucket) =>
          sum + bucket.claimableBase,
        0n
      );
  
    let remainingRequestBase =
      requestedBase;
  
    const allocations: ClaimAllocation[] =
      [];
  
    for (const bucket of normalizedBuckets) {
      if (remainingRequestBase <= 0n) {
        break;
      }
  
      if (bucket.claimableBase <= 0n) {
        continue;
      }
  
      const amountBase =
        remainingRequestBase <=
        bucket.claimableBase
          ? remainingRequestBase
          : bucket.claimableBase;
  
      if (amountBase <= 0n) {
        continue;
      }
  
      allocations.push({
        walletAddress:
          bucket.walletAddress,
        phaseId:
          bucket.phaseId,
        phaseNo:
          bucket.phaseNo ?? null,
        phaseName:
          bucket.phaseName ?? null,
        amountBase,
      });
  
      remainingRequestBase -= amountBase;
    }
  
    const allocatedBase =
      requestedBase -
      remainingRequestBase;
  
    return {
      requestedBase,
      totalClaimableBase,
      allocatedBase,
      remainingRequestBase,
      allocations,
    };
  }
  
  /**
   * Convenience wrapper for execution paths where the whole requested amount
   * must be allocatable.
   *
   * Throws instead of returning a partial result when the requested amount
   * exceeds the available claimable balance.
   */
  export function allocateClaimAmountOrThrow(
    buckets: readonly ClaimableBucket[],
    requestedBase: bigint
  ): ClaimAllocationResult {
    const result =
      allocateClaimAmount(
        buckets,
        requestedBase
      );
  
    if (
      result.remainingRequestBase !== 0n
    ) {
      throw new Error(
        'CLAIM_AMOUNT_EXCEEDS_AVAILABLE'
      );
    }
  
    return result;
  }
  
  /**
   * Returns unique phase IDs actually touched by an allocation.
   *
   * This is intentionally phase-based rather than wallet-based because the
   * economic claim-fee unit is:
   *
   *   Identity + Phase + Destination
   *
   * Multiple linked wallets contributing MEGY from the same phase therefore
   * produce only one phase fee unit.
   */
  export function getTouchedPhaseIds(
    allocations: readonly ClaimAllocation[]
  ): number[] {
    const seen = new Set<number>();
    const phaseIds: number[] = [];
  
    for (const allocation of allocations) {
      if (
        !Number.isInteger(
          allocation.phaseId
        ) ||
        allocation.phaseId <= 0
      ) {
        throw new Error(
          'CLAIM_ALLOCATION_PHASE_INVALID'
        );
      }
  
      if (
        allocation.amountBase <= 0n
      ) {
        continue;
      }
  
      if (!seen.has(allocation.phaseId)) {
        seen.add(allocation.phaseId);
        phaseIds.push(
          allocation.phaseId
        );
      }
    }
  
    return phaseIds;
  }