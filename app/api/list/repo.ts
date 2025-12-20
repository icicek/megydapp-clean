// app/api/list/repo.ts
//
// LEGACY: kept for potential LV/list experiments.
// IMPORTANT: Single source of truth is token_registry.
// This file now PROXIES status read/write to token_registry,
// which also keeps token_status in sync via compat upsert.
//
// deadcoin_votes table stays as-is.

import { neon } from '@neondatabase/serverless';
import type { TokenStatus as RegistryStatus } from '@/app/api/_lib/types';
import {
  getStatus as getRegistryStatus,
  setStatus as setRegistryStatus,
} from '@/app/api/_lib/token-registry';

// Keep a local sql ONLY for deadcoin_votes reads/writes.
const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL!);

export type TokenStatus = 'healthy' | 'walking_dead' | 'deadcoin' | 'redlist' | 'blacklist';
type Source = 'engine' | 'vote' | 'manual' | 'external';

const precedence: Record<TokenStatus, number> = {
  healthy: 1,
  walking_dead: 2,
  deadcoin: 3,
  redlist: 4,
  blacklist: 5,
};

function toRegistryStatus(s: TokenStatus): RegistryStatus {
  return s as RegistryStatus;
}

function toLocalStatus(s: RegistryStatus): TokenStatus {
  return s as TokenStatus;
}

function legacyChangedBy(source: Source): string {
  switch (source) {
    case 'engine':
      return 'legacy:list_repo:engine';
    case 'vote':
      return 'legacy:list_repo:vote';
    case 'manual':
      return 'legacy:list_repo:manual';
    default:
      return 'legacy:list_repo:external';
  }
}

export async function getStatus(
  mint: string
): Promise<{ status: TokenStatus; statusAt: string | null }> {
  // ✅ Read from token_registry (single source of truth)
  const r = await getRegistryStatus(mint);
  return { status: toLocalStatus(r.status), statusAt: r.statusAt };
}

/**
 * Atomically updates status.
 * Default: if a stronger status already exists, it won't downgrade (unless force=true).
 *
 * NOTE: This now writes to token_registry.
 * token_status will be synced via compat upsert in token-registry.setStatus.
 */
export async function setStatus(
  mint: string,
  newStatus: TokenStatus,
  opts?: { reason?: string | null; source?: Source; force?: boolean; meta?: any }
) {
  const reason = opts?.reason ?? null;
  const source = (opts?.source ?? 'engine') as Source;
  const force = !!opts?.force;
  const meta = opts?.meta ?? {};

  const current = await getStatus(mint);
  if (current.status && !force) {
    if (precedence[current.status] >= precedence[newStatus]) {
      return { skipped: true, currentStatus: current.status };
    }
  }

  await setRegistryStatus({
    mint,
    newStatus: toRegistryStatus(newStatus),
    changedBy: legacyChangedBy(source),
    reason,
    meta: { ...meta, source: 'legacy' },
  });

  const after = await getStatus(mint);
  return { skipped: false, currentStatus: after.status };
}

/** Vote record + promote to deadcoin if threshold met */
export async function recordVote(
  mint: string,
  voterWallet: string,
  voteYes: boolean,
  threshold = 3
) {
  // ✅ keep votes table as legacy-compatible
  await sql`
    INSERT INTO deadcoin_votes (mint, voter_wallet, vote)
    VALUES (${mint}, ${voterWallet}, ${voteYes})
    ON CONFLICT (mint, voter_wallet) DO NOTHING
  `;

  const res = await sql`
    SELECT
      COALESCE(SUM(CASE WHEN vote = true  THEN 1 ELSE 0 END), 0)::int AS yes,
      COALESCE(SUM(CASE WHEN vote = false THEN 1 ELSE 0 END), 0)::int AS no
    FROM deadcoin_votes
    WHERE mint = ${mint}
  `;
  const rows = res as unknown as { yes: number; no: number }[];
  const yes = rows[0]?.yes ?? 0;
  const no = rows[0]?.no ?? 0;

  let promoted = false;
  if (yes >= threshold) {
    await setStatus(mint, 'deadcoin', { source: 'vote', reason: 'vote' });
    promoted = true;
  }
  return { yes, no, promoted };
}

/** Apply L/V category (respects blacklist/redlist) */
export async function applyLvCategory(
  mint: string,
  category: 'healthy' | 'walking_dead' | 'deadcoin'
) {
  const current = await getStatus(mint);
  if (current.status === 'blacklist' || current.status === 'redlist') {
    return { skipped: true, currentStatus: current.status };
  }

  if (category === 'healthy') {
    await setStatus(mint, 'healthy', { source: 'engine' });
  } else if (category === 'walking_dead') {
    await setStatus(mint, 'walking_dead', { source: 'engine' });
  } else if (category === 'deadcoin') {
    // legacy flow: first WD awaiting_votes
    await setStatus(mint, 'walking_dead', { source: 'engine', reason: 'awaiting_votes' });
  }

  const after = await getStatus(mint);
  return { skipped: false, currentStatus: after.status };
}
