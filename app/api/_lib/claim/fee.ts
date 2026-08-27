// app/api/_lib/claim/fee.ts

export type ClaimFeeQuoteInput = {
    touchedPhaseIds: readonly number[];
    creditedPhaseIds: readonly number[];
    baseFeeLamports: number;
    ataCreationLamports: number;
  };
  
  export type ClaimFeeQuoteCalculation = {
    touchedPhaseIds: number[];
    creditedPhaseIds: number[];
    feePhaseIds: number[];
    feeCreditCount: number;
    protocolFeeLamports: number;
    ataCreationLamports: number;
    requiredLamports: number;
  };
  
  function uniquePositivePhaseIds(
    values: readonly number[]
  ): number[] {
    const seen = new Set<number>();
    const result: number[] = [];
  
    for (const value of values) {
      if (
        !Number.isInteger(value) ||
        value <= 0
      ) {
        throw new Error(
          'CLAIM_FEE_PHASE_INVALID'
        );
      }
  
      if (!seen.has(value)) {
        seen.add(value);
        result.push(value);
      }
    }
  
    return result;
  }
  
  function validateLamports(
    value: number,
    errorCode: string
  ): number {
    if (
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new Error(errorCode);
    }
  
    return value;
  }
  
  export function calculateClaimFeeQuote(
    input: ClaimFeeQuoteInput
  ): ClaimFeeQuoteCalculation {
    const touchedPhaseIds =
      uniquePositivePhaseIds(
        input.touchedPhaseIds
      );
  
    const creditedPhaseIdsRaw =
      uniquePositivePhaseIds(
        input.creditedPhaseIds
      );
  
    const baseFeeLamports =
      validateLamports(
        input.baseFeeLamports,
        'CLAIM_BASE_FEE_INVALID'
      );
  
    if (baseFeeLamports <= 0) {
      throw new Error(
        'CLAIM_BASE_FEE_INVALID'
      );
    }
  
    const ataCreationLamports =
      validateLamports(
        input.ataCreationLamports,
        'CLAIM_ATA_FEE_INVALID'
      );
  
    const touchedSet =
      new Set(touchedPhaseIds);
  
    const creditedPhaseIds =
      creditedPhaseIdsRaw.filter(
        (phaseId) =>
          touchedSet.has(phaseId)
      );
  
    const creditedSet =
      new Set(creditedPhaseIds);
  
    const feePhaseIds =
      touchedPhaseIds.filter(
        (phaseId) =>
          !creditedSet.has(phaseId)
      );
  
    const protocolFeeLamports =
      feePhaseIds.length *
      baseFeeLamports;
  
    if (
      !Number.isSafeInteger(
        protocolFeeLamports
      )
    ) {
      throw new Error(
        'CLAIM_PROTOCOL_FEE_OVERFLOW'
      );
    }
  
    const requiredLamports =
      protocolFeeLamports +
      ataCreationLamports;
  
    if (
      !Number.isSafeInteger(
        requiredLamports
      )
    ) {
      throw new Error(
        'CLAIM_REQUIRED_FEE_OVERFLOW'
      );
    }
  
    return {
      touchedPhaseIds,
      creditedPhaseIds,
      feePhaseIds,
      feeCreditCount:
        feePhaseIds.length,
      protocolFeeLamports,
      ataCreationLamports,
      requiredLamports,
    };
  }