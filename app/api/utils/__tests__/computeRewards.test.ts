// app/api/utils/__tests__/computeRewards.test.ts

import { computeRewards } from '../computeRewards';
import type { TokenCategory } from '../classifyToken';

function decide(category: TokenCategory, usdValue: number) {
  return computeRewards({ category, usdValue });
}

describe('computeRewards', () => {
  test('blacklist → no rewards at all', () => {
    const r = decide('blacklist', 123);
    expect(r.allowMegy).toBe(false);
    expect(r.allowCp).toBe(false);
    expect(r.allowDeadcoinBonus).toBe(false);
  });

  test('deadcoin with zero value → only Deadcoin Bonus', () => {
    const r = decide('deadcoin', 0);
    expect(r.allowMegy).toBe(false);
    expect(r.allowCp).toBe(false);
    expect(r.allowDeadcoinBonus).toBe(true);
  });

  test('deadcoin with positive value → CP + Deadcoin Bonus, no MEGY', () => {
    const r = decide('deadcoin', 100);
    expect(r.allowMegy).toBe(false);
    expect(r.allowCp).toBe(true);
    expect(r.allowDeadcoinBonus).toBe(true);
  });

  test('healthy with positive value → MEGY + CP, no Deadcoin Bonus', () => {
    const r = decide('healthy', 50);
    expect(r.allowMegy).toBe(true);
    expect(r.allowCp).toBe(true);
    expect(r.allowDeadcoinBonus).toBe(false);
  });

  test('walking_dead with positive value → MEGY + CP, no Deadcoin Bonus', () => {
    const r = decide('walking_dead', 25);
    expect(r.allowMegy).toBe(true);
    expect(r.allowCp).toBe(true);
    expect(r.allowDeadcoinBonus).toBe(false);
  });

  test('redlist with positive value (historical contrib) → MEGY + CP', () => {
    const r = decide('redlist', 10);
    expect(r.allowMegy).toBe(true);
    expect(r.allowCp).toBe(true);
    expect(r.allowDeadcoinBonus).toBe(false);
  });

  test('unknown with positive value → treat like healthy', () => {
    const r = decide('unknown', 5);
    expect(r.allowMegy).toBe(true);
    expect(r.allowCp).toBe(true);
    expect(r.allowDeadcoinBonus).toBe(false);
  });

  test('non-deadcoin with zero value → no MEGY/CP, only Deadcoin Bonus as safety', () => {
    const r = decide('healthy', 0);
    expect(r.allowMegy).toBe(false);
    expect(r.allowCp).toBe(false);
    expect(r.allowDeadcoinBonus).toBe(true);
  });
});
