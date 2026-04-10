// app/api/admin/tokens/bulk/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { cache, statusKey } from '@/app/api/_lib/cache';
import { verifyCsrf } from '@/app/api/_lib/csrf';
import { httpErrorFrom } from '@/app/api/_lib/http';
import { logAdminAudit } from '@/app/api/admin/_lib/audit';
import { applyBlacklistInvalidation } from '@/app/api/_lib/blacklist/applyBlacklistInvalidation';
import { validateMintAddress } from '@/app/api/_lib/solana/validateMint';

type TokenStatus = 'healthy' | 'walking_dead' | 'deadcoin' | 'redlist' | 'blacklist';
const ALLOWED: TokenStatus[] = ['healthy', 'walking_dead', 'deadcoin', 'redlist', 'blacklist'];

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeMints(input: unknown): string[] {
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((s) => String(s || '').trim())
          .filter(Boolean)
      )
    );
  }

  if (typeof input === 'string') {
    return Array.from(
      new Set(
        input
          .split(/[\s,;]+/g)
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
  }

  return [];
}

export async function POST(req: Request) {
  try {
    verifyCsrf(req as any);
    const admin = await requireAdmin(req as any);

    const body = await req.json();
    let { mints, status, reason = null, meta = {} } = body || {};

    const uniq = normalizeMints(mints);

    if (uniq.length === 0) {
      return NextResponse.json(
        { success: false, error: 'mints array is required' },
        { status: 400 }
      );
    }

    if (!status || !ALLOWED.includes(status)) {
      return NextResponse.json(
        { success: false, error: 'valid status is required' },
        { status: 400 }
      );
    }

    let metaObj: any = {};
    if (typeof meta === 'string') {
      try {
        metaObj = meta.trim() ? JSON.parse(meta) : {};
      } catch {
        return NextResponse.json(
          { success: false, error: 'meta must be valid JSON' },
          { status: 400 }
        );
      }
    } else if (meta && typeof meta === 'object') {
      metaObj = meta;
    }

    const MAX = 200;
    if (uniq.length > MAX) {
      return NextResponse.json(
        { success: false, error: `too many mints (max ${MAX})` },
        { status: 400 }
      );
    }

    const ok: Array<{
      mint: string;
      status: TokenStatus;
      statusAt: string;
      invalidation?: any;
    }> = [];

    const fail: Array<{
      mint: string;
      error: string;
    }> = [];

    for (const mint of uniq) {
      try {
        const validation = await validateMintAddress(mint);
        if (!validation.ok) {
          fail.push({
            mint,
            error: validation.error || 'Invalid mint',
          });
          continue;
        }
    
        await sql`BEGIN`;

        const prev = (await sql`
          SELECT status::text AS status
          FROM token_registry
          WHERE mint = ${mint}
        `) as unknown as { status: TokenStatus }[];

        const oldStatus: TokenStatus | null = prev[0]?.status ?? null;

        const rows = (await sql`
          INSERT INTO token_registry (mint, status, status_at, updated_by, reason, meta)
          VALUES (
            ${mint},
            ${status}::token_status_enum,
            NOW(),
            ${admin},
            ${reason},
            ${JSON.stringify(metaObj)}::jsonb
          )
          ON CONFLICT (mint) DO UPDATE
          SET status = ${status}::token_status_enum,
              status_at = NOW(),
              updated_by = ${admin},
              reason = ${reason},
              meta = ${JSON.stringify(metaObj)}::jsonb,
              updated_at = NOW()
          RETURNING mint, status::text AS status, status_at
        `) as unknown as { mint: string; status: TokenStatus; status_at: string }[];

        const r = rows[0];

        await sql`
          INSERT INTO token_audit (mint, old_status, new_status, reason, meta, updated_by, changed_at)
          VALUES (
            ${mint},
            ${oldStatus},
            ${status}::token_status_enum,
            ${reason},
            ${JSON.stringify(metaObj)}::jsonb,
            ${admin},
            NOW()
          )
        `;

        let invalidation: any = null;

        if (status === 'blacklist') {
          invalidation = await applyBlacklistInvalidation({
            mint,
            changedBy: admin,
            reason: 'invalidated:blacklist',
          });
        }

        await logAdminAudit({
          req,
          adminWallet: admin,
          action: 'bulk_set_status',
          targetMint: mint,
          prevStatus: oldStatus,
          newStatus: status,
          extra: { reason, meta: metaObj },
        });

        await sql`COMMIT`;

        cache.del(statusKey(mint));

        ok.push({
          mint: r.mint,
          status: r.status,
          statusAt: r.status_at,
          invalidation,
        });
      } catch (e: any) {
        try {
          await sql`ROLLBACK`;
        } catch {}

        fail.push({
          mint,
          error: String(e?.message || e || 'error'),
        });
      }
    }

    return NextResponse.json({
      success: true,
      okCount: ok.length,
      failCount: fail.length,
      ok,
      fail,
    });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}