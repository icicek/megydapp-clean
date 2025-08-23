// app/api/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  getStatus as getTokenStatus,
  setStatus as upsertTokenStatus,
} from '@/app/api/_lib/token-registry';
import type { TokenStatus } from '@/app/api/_lib/types';

/**
 * GET /api/status?mint=...
 * - Tek tablodan (token_registry) statüyü okur.
 * - Kayıt yoksa healthy kabul eder.
 */
export async function GET(req: NextRequest) {
  try {
    const mint = req.nextUrl.searchParams.get('mint');
    if (!mint) {
      return NextResponse.json({ success: false, error: 'mint is required' }, { status: 400 });
    }

    const s = await getTokenStatus(mint);
    // Eski davranışla uyumlu, yalın cevap
    return NextResponse.json({ success: true, mint, status: s.status, statusAt: s.statusAt });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/status
 * Body: { mint, status, reason?, source?="manual", force?=false, meta?={} }
 * - Eski sözleşmeyle uyumlu (reason/source/force/meta desteklenir).
 * - Güvenlik notu: Bu uç şu an açık; sonradan admin JWT ile sınırlandıracağız.
 */
export async function PUT(req: NextRequest) {
  try {
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

    // Güncel durum (compat için önceki değeri döndürmek isteyebiliriz)
    const prev = await getTokenStatus(mint);

    // changedBy: önce body.changedBy → yoksa source → yoksa 'manual'
    const actor = (changedBy as string) || (source as string) || 'manual';

    // meta içine source/force’u da iliştirerek saklıyoruz (geriye dönük uyumluluk)
    const mergedMeta = {
      ...((typeof meta === 'object' && meta) || {}),
      source,
      force: !!force,
    };

    await upsertTokenStatus({
      mint,
      newStatus: status as TokenStatus,
      changedBy: actor,
      reason,
      meta: mergedMeta,
    });

    // Eski akışlarla uyumlu, sade bir yanıt
    return NextResponse.json({
      success: true,
      mint,
      previous: prev.status,
      status,
      statusAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 },
    );
  }
}
