// app/api/utils/computeRewards.ts

import type { TokenCategory } from './classifyToken';

export type RewardInput = {
  category: TokenCategory;
  usdValue: number;
};

export type RewardDecision = {
  /** Should this contribution earn MEGY from the phase pool? */
  allowMegy: boolean;

  /** Should this contribution earn Coincarnation Contribution CorePoints? */
  allowCp: boolean;

  /** Is this contribution eligible for Deadcoin Bonus (subject to DB checks)? */
  allowDeadcoinBonus: boolean;

  /** Short debug string for logs / analytics. */
  reason: string;
};

/**
 * Pure reward matrix:
 *   (category, usdValue) -> which reward channels are allowed.
 *
 * NOTE:
 * - Actual MEGY amount, CP amount, and "first-time" checks for Deadcoin Bonus
 *   are handled in higher layers (routes/services), not here.
 */
export function computeRewards(input: RewardInput): RewardDecision {
  const { category, usdValue } = input;
  const hasValue = usdValue > 0;

  // 1) Hard stop: blacklist
  if (category === 'blacklist') {
    return {
      allowMegy: false,
      allowCp: false,
      allowDeadcoinBonus: false,
      reason: 'blacklist_no_rewards',
    };
  }

  // 2) Deadcoin rules
  if (category === 'deadcoin') {
    if (hasValue) {
      // Admin / community decided this is a Deadcoin, but still some historical value.
      // → No MEGY. CP allowed (contribution), plus Deadcoin Bonus.
      return {
        allowMegy: false,
        allowCp: true,
        allowDeadcoinBonus: true,
        reason: 'deadcoin_with_usd_value',
      };
    }

    // usdValue <= 0 → pure deadcoin, no MEGY, no CP, only Deadcoin Bonus
    return {
      allowMegy: false,
      allowCp: false,
      allowDeadcoinBonus: true,
      reason: 'deadcoin_zero_value',
    };
  }

  // 3) Non-deadcoin statuses (healthy, walking_dead, redlist, unknown)
  if (!hasValue) {
    // This "should not happen" in normal flows, but if it does,
    // safest is to avoid MEGY / CP and only allow Deadcoin Bonus semantics.
    return {
      allowMegy: false,
      allowCp: false,
      allowDeadcoinBonus: true,
      reason: 'non_deadcoin_zero_value_treated_as_deadcoin',
    };
  }

  // 4) Normal case: some USD value and not marked as deadcoin/blacklist
  // - healthy → MEGY + CP
  // - walking_dead → MEGY + CP (under observation)
  // - redlist → typically no new intake, but historical contributions still MEGY + CP
  // - unknown → conservative, treat like healthy for rewards (while it’s allowed in intake)
  return {
    allowMegy: true,
    allowCp: true,
    allowDeadcoinBonus: false,
    reason: `value_positive_${category}`,
  };
}

export default computeRewards;
