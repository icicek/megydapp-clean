import {
    calculateClaimFeeQuote,
  } from '@/app/api/_lib/claim/fee';
  
  describe('claim fee calculation', () => {
    test('charges one base fee per uncredited touched phase', () => {
      const result =
        calculateClaimFeeQuote({
          touchedPhaseIds: [
            12,
            13,
            14,
          ],
          creditedPhaseIds: [],
          baseFeeLamports:
            3_000_000,
          ataCreationLamports: 0,
        });
  
      expect(
        result.feePhaseIds
      ).toEqual([
        12,
        13,
        14,
      ]);
  
      expect(
        result.protocolFeeLamports
      ).toBe(
        9_000_000
      );
  
      expect(
        result.requiredLamports
      ).toBe(
        9_000_000
      );
    });
  
    test('does not charge protocol fee again for credited phases', () => {
      const result =
        calculateClaimFeeQuote({
          touchedPhaseIds: [
            12,
            13,
            14,
          ],
          creditedPhaseIds: [
            12,
            14,
          ],
          baseFeeLamports:
            3_000_000,
          ataCreationLamports: 0,
        });
  
      expect(
        result.feePhaseIds
      ).toEqual([13]);
  
      expect(
        result.protocolFeeLamports
      ).toBe(
        3_000_000
      );
    });
  
    test('adds ATA creation cost once per destination', () => {
      const result =
        calculateClaimFeeQuote({
          touchedPhaseIds: [
            12,
            13,
          ],
          creditedPhaseIds: [],
          baseFeeLamports:
            3_000_000,
          ataCreationLamports:
            2_000_000,
        });
  
      expect(
        result.protocolFeeLamports
      ).toBe(
        6_000_000
      );
  
      expect(
        result.ataCreationLamports
      ).toBe(
        2_000_000
      );
  
      expect(
        result.requiredLamports
      ).toBe(
        8_000_000
      );
    });
  
    test('allows zero required payment when all phases are credited and ATA already exists', () => {
      const result =
        calculateClaimFeeQuote({
          touchedPhaseIds: [
            12,
            13,
          ],
          creditedPhaseIds: [
            12,
            13,
          ],
          baseFeeLamports:
            3_000_000,
          ataCreationLamports: 0,
        });
  
      expect(
        result.feeCreditCount
      ).toBe(0);
  
      expect(
        result.protocolFeeLamports
      ).toBe(0);
  
      expect(
        result.requiredLamports
      ).toBe(0);
    });
  
    test('ignores credited phases that are not touched by this claim', () => {
      const result =
        calculateClaimFeeQuote({
          touchedPhaseIds: [
            12,
            13,
          ],
          creditedPhaseIds: [
            12,
            99,
          ],
          baseFeeLamports:
            3_000_000,
          ataCreationLamports: 0,
        });
  
      expect(
        result.creditedPhaseIds
      ).toEqual([12]);
  
      expect(
        result.feePhaseIds
      ).toEqual([13]);
    });
  
    test('deduplicates phase ids', () => {
      const result =
        calculateClaimFeeQuote({
          touchedPhaseIds: [
            12,
            12,
            13,
          ],
          creditedPhaseIds: [],
          baseFeeLamports:
            3_000_000,
          ataCreationLamports: 0,
        });
  
      expect(
        result.touchedPhaseIds
      ).toEqual([
        12,
        13,
      ]);
  
      expect(
        result.protocolFeeLamports
      ).toBe(
        6_000_000
      );
    });
  
    test('rejects invalid lamport values', () => {
      expect(() =>
        calculateClaimFeeQuote({
          touchedPhaseIds: [12],
          creditedPhaseIds: [],
          baseFeeLamports: -1,
          ataCreationLamports: 0,
        })
      ).toThrow(
        'CLAIM_BASE_FEE_INVALID'
      );
  
      expect(() =>
        calculateClaimFeeQuote({
          touchedPhaseIds: [12],
          creditedPhaseIds: [],
          baseFeeLamports:
            3_000_000,
          ataCreationLamports: -1,
        })
      ).toThrow(
        'CLAIM_ATA_FEE_INVALID'
      );
    });
  });