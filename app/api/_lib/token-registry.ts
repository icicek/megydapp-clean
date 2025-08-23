// app/api/_lib/token-registry.ts
import { sql } from '@/app/api/_lib/db';
import type { TokenStatus } from '@/app/api/_lib/types';

export async function getStatus(
  mint: string
): Promise<{ status: TokenStatus; statusAt: string | null }> {
  const rows = (await sql`
    SELECT status::text AS status, status_at
    FROM token_registry
    WHERE mint = ${mint}
    LIMIT 1
  `) as unknown as { status: TokenStatus; status_at: string }[];

  if (rows.length === 0) {
    return { status: 'healthy', statusAt: null };
  }
  return { status: rows[0].status, statusAt: rows[0].status_at };
}

export async function setStatus(params: {
  mint: string;
  newStatus: TokenStatus;
  changedBy: string;
  reason?: string | null;
  meta?: any;
}) {
  const { mint, newStatus, changedBy, reason, meta } = params;

  const prev = (await sql`
    SELECT status::text AS status FROM token_registry WHERE mint = ${mint}
  `) as unknown as { status: TokenStatus }[];

  const oldStatus: TokenStatus | null = prev[0]?.status ?? null;

  await sql`
    INSERT INTO token_registry (mint, status, status_at, updated_by, reason, meta)
    VALUES (${mint}, ${newStatus}::token_status_enum, NOW(), ${changedBy}, ${reason ?? null}, ${
      meta ? JSON.stringify(meta) : null
    })
    ON CONFLICT (mint)
    DO UPDATE SET
      status     = EXCLUDED.status,
      status_at  = EXCLUDED.status_at,
      updated_by = EXCLUDED.updated_by,
      reason     = EXCLUDED.reason,
      meta       = EXCLUDED.meta
  `;

  // history tabloyu kurmadıysan bu blok sessizce çalışmayabilir; try/catch ile sarmalıyoruz
  try {
    await sql`
      INSERT INTO token_status_history (mint, old_status, new_status, changed_by, reason)
      VALUES (
        ${mint},
        ${oldStatus}::token_status_enum,
        ${newStatus}::token_status_enum,
        ${changedBy},
        ${reason ?? null}
      )
    `;
  } catch (_) {}

  return { ok: true };
}
