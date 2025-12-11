// LEGACY: This file is not used by the main Coincarnation registry anymore.
// It operates on `token_status` table, while the live system uses `token_registry`.
// Kept only for potential LV/list experiments. Safe to delete when no longer needed.

// app/api/list/repo.ts
import { neon } from '@neondatabase/serverless';

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

export async function getStatus(mint: string): Promise<{ status: TokenStatus; statusAt: string | null }> {
  const res = await sql`
    SELECT status::text AS status, status_at
    FROM token_status
    WHERE mint = ${mint}
    LIMIT 1
  `;
  const rows = res as unknown as { status: string; status_at: string | null }[];
  if (rows.length) {
    return { status: rows[0].status as TokenStatus, statusAt: rows[0].status_at ?? null };
  }
  return { status: 'healthy', statusAt: null };
}

/**
 * Statüyü atomik olarak günceller.
 * Varsayılan: daha güçlü bir statü mevcutsa downgrade'e izin vermez (force ile aşılabilir).
 */
export async function setStatus(
  mint: string,
  newStatus: TokenStatus,
  opts?: { reason?: string | null; source?: Source; force?: boolean; meta?: any }
) {
  const reason = opts?.reason ?? null;
  const source = (opts?.source ?? 'engine') as Source;
  const force  = !!opts?.force;
  const meta = opts?.meta ?? {};

  const currentRows = await sql`
    SELECT status::text AS status
    FROM token_status
    WHERE mint = ${mint}
    LIMIT 1
  `;
  const current: TokenStatus | null = (currentRows as any[]).length ? (currentRows as any[])[0].status as TokenStatus : null;

  if (current && !force) {
    // blacklist/redlist gibi daha güçlü statüyü koru
    if (precedence[current] >= precedence[newStatus]) {
      return { skipped: true, currentStatus: current };
    }
  }

  await sql`
    INSERT INTO token_status (mint, status, status_reason, status_source, status_at, meta)
    VALUES (${mint}, ${newStatus}::token_status_enum, ${reason}, ${source}::token_status_source_enum, now(), ${JSON.stringify(meta)}::jsonb)
    ON CONFLICT (mint) DO UPDATE
      SET status        = EXCLUDED.status,
          status_reason = EXCLUDED.status_reason,
          status_source = EXCLUDED.status_source,
          status_at     = EXCLUDED.status_at,
          meta          = EXCLUDED.meta;
  `;

  const after = await getStatus(mint);
  return { skipped: false, currentStatus: after.status };
}

/** Oy kaydı + eşik geçilirse deadcoin’e terfi */
export async function recordVote(mint: string, voterWallet: string, voteYes: boolean, threshold = 3) {
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
  const no  = rows[0]?.no  ?? 0;

  let promoted = false;
  if (yes >= threshold) {
    await setStatus(mint, 'deadcoin', { source: 'vote', reason: 'vote' });
    promoted = true;
  }
  return { yes, no, promoted };
}

/** L/V kategorisini uygula (blacklist/redlist’e saygılı) */
export async function applyLvCategory(mint: string, category: 'healthy'|'walking_dead'|'deadcoin') {
  const current = await getStatus(mint);
  if (current.status === 'blacklist' || current.status === 'redlist') {
    return { skipped: true, currentStatus: current.status };
  }

  if (category === 'healthy') {
    // Kayıt dursun istiyorsan:
    await setStatus(mint, 'healthy', { source: 'engine' });
    // Ya da tamamen kaldırmak istersen: await sql`DELETE FROM token_status WHERE mint = ${mint}`;
  } else if (category === 'walking_dead') {
    await setStatus(mint, 'walking_dead', { source: 'engine' });
  } else if (category === 'deadcoin') {
    // Senin akış: önce WD, oy eşiği sonra deadcoin
    await setStatus(mint, 'walking_dead', { source: 'engine', reason: 'awaiting_votes' });
  }

  const after = await getStatus(mint);
  return { skipped: false, currentStatus: after.status };
}
