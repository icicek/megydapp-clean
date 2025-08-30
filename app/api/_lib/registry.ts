// app/api/_lib/registry.ts
import { sql } from '@/app/api/_lib/db';
import { cache, statusKey } from '@/app/api/_lib/cache';

export type TokenStatus = 'healthy'|'walking_dead'|'deadcoin'|'redlist'|'blacklist';

export async function getStatusRow(mint: string) {
  const rows = await sql`
    SELECT mint, status::text AS status, status_at, updated_by, reason, meta
    FROM token_registry
    WHERE mint = ${mint}
    LIMIT 1
  `;
  return (rows as any[])[0] || null;
}

/**
 * İlk kez görülen mint için kayıt oluşturur (idempotent).
 * suggestedStatus verilmezse default 'walking_dead' ile başlatır.
 * Not: INSERT tetikleyiciniz zaten audit yazıyorsa alttaki writeAudit çağrısını kaldırın.
 */
export async function ensureFirstSeenRegistry(
  mint: string,
  opts: {
    suggestedStatus?: TokenStatus;
    actorWallet?: string | null;
    reason?: string | null;
    meta?: any;
  } = {}
) {
  const status: TokenStatus = opts.suggestedStatus ?? 'walking_dead';
  const reason = opts.reason ?? 'first_coincarnation';
  const meta = opts.meta ?? { source: 'coincarnation_flow' };
  const updated_by = opts.actorWallet ?? null;

  const inserted = await sql`
    INSERT INTO token_registry (mint, status, status_at, updated_by, reason, meta)
    VALUES (${mint}, ${status}::token_status_enum, NOW(), ${updated_by}, ${reason}, ${meta})
    ON CONFLICT (mint) DO NOTHING
    RETURNING mint, status::text AS status, status_at
  ` as unknown as { mint: string; status: TokenStatus; status_at: string }[];

  if (inserted.length > 0) {
    // cache invalidation
    cache.del(statusKey(mint));

    // (Opsiyonel) Audit’e de düşelim — TRIGGER varsa KALDIRIN ki çift kayıt olmasın.
    await writeAuditSafe({
      mint,
      new_status: status,
      reason,
      updated_by,
      meta,
    });

    return { created: true, status: inserted[0].status };
  }
  return { created: false };
}

/** token_audit’e güvenli yazım (tablo yoksa veya şema farklıysa sessiz geçer) */
async function writeAuditSafe(args: {
  mint: string;
  new_status: TokenStatus;
  reason: string | null;
  updated_by: string | null;
  meta: any;
}) {
  try {
    await sql`
      INSERT INTO token_audit (mint, old_status, new_status, reason, updated_by, changed_at, meta)
      VALUES (
        ${args.mint},
        NULL,
        ${args.new_status}::token_status_enum,
        ${args.reason},
        ${args.updated_by},
        NOW(),
        ${args.meta}
      )
    `;
  } catch (e) {
    // Tablo/enum ismi uymuyorsa veya trigger zaten yazıyorsa burada sessizce geçiyoruz.
  }
}
