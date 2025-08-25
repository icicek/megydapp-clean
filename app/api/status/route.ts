import { NextRequest, NextResponse } from 'next/server';
import {
  getStatus as getTokenStatus,
  setStatus as upsertTokenStatus,
} from '@/app/api/_lib/token-registry';
import { cache, statusKey, STATUS_TTL } from '@/app/api/_lib/cache';
import type { TokenStatus } from '@/app/api/_lib/types';
import { verifyCsrf } from '@/app/api/_lib/csrf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/status?mint=...
 * - Tek tablodan (token_registry) statüyü okur.
 * - Kayıt yoksa healthy kabul eder.
 * - Node-cache ile kısa süreli cache (STATUS_TTL) uygular.
 */
export async function GET(req: NextRequest) {
  try {
    const mint = req.nextUrl.searchParams.get('mint');
    if (!mint) {
      return NextResponse.json({ success: false, error: 'mint is required' }, { status: 400 });
    }

    // 1) cache dene
    const key = statusKey(mint);
    const cached = cache.get<{ status: TokenStatus; statusAt: string | null }>(key);
    if (cached) {
      return NextResponse.json(
        { success: true, mint, status: cached.status, statusAt: cached.statusAt },
        { headers: { 'Cache-Control': `public, max-age=0, s-maxage=${STATUS_TTL}` } }
      );
    }

    // 2) DB'den çek
    const s = await getTokenStatus(mint);

    // 3) cache'e yaz + dön
    cache.set(key, { status: s.status, statusAt: s.statusAt });
    return NextResponse.json(
      { success: true, mint, status: s.status, statusAt: s.statusAt },
      { headers: { 'Cache-Control': `public, max-age=0, s-maxage=${STATUS_TTL}` } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/status
 * Body: { mint, status, reason?, source?="manual", force?=false, meta?={}, changedBy? }
 * - Eski sözleşmeyle uyumlu (reason/source/force/meta desteklenir).
 * - upsert sonrası token-registry.setStatus zaten cache invalidation yapar.
 */
export async function PUT(req: NextRequest) {
  try {
    verifyCsrf(req);
    const body = await req.json();
    const {
      mint,
      status,
      reason = null,
      source = 'manual',
      force = false,
      meta = {},
      changedBy, // opsiyonel: isteyen doğrudan gönderebilir
    } = body || {};

    const allowed: TokenStatus[] = ['healthy', 'walking_dead', 'deadcoin', 'redlist', 'blacklist'];
    if (!mint || !status || !allowed.includes(status as TokenStatus)) {
      return NextResponse.json(
        { success: false, error: 'mint and valid status required' },
        { status: 400 },
      );
    }

    // upsert öncesi mevcut durumu oku (compat için)
    const prev = await getTokenStatus(mint);

    // changedBy: body.changedBy → yoksa source → yoksa 'manual'
    const actor = (changedBy as string) || (source as string) || 'manual';

    // meta içine source/force’u da iliştirerek saklıyoruz (geriye dönük uyumluluk)
    const mergedMeta = {
      ...((typeof meta === 'object' && meta) || {}),
      source,
      force: !!force,
    };

    // upsert + audit + cache invalidation (token-registry.setStatus içinde)
    const after = await upsertTokenStatus({
      mint,
      newStatus: status as TokenStatus,
      changedBy: actor,
      reason,
      meta: mergedMeta,
    });

    // Sade ve doğru zaman damgası ile yanıt
    return NextResponse.json({
      success: true,
      mint,
      previous: prev.status,
      status: after.status,
      statusAt: after.statusAt,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 },
    );
  }
}
