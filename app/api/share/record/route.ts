// app/api/share/record/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import {
  awardShare,
  totalCorePoints,
} from '@/app/api/_lib/corepoints';

/* --------------------------------------------------
   Allowed Channels + Normalizer
-------------------------------------------------- */
function normalizeChannel(raw: any):
  | 'twitter'
  | 'telegram'
  | 'whatsapp'
  | 'email'
  | 'copy'
  | 'instagram'
  | 'tiktok'
  | 'discord'
  | 'system'
{
  const c = typeof raw === 'string' ? raw.toLowerCase() : '';

  if (c === 'x') return 'twitter';

  switch (c) {
    case 'twitter':
    case 'telegram':
    case 'whatsapp':
    case 'email':
    case 'copy':
    case 'instagram':
    case 'tiktok':
    case 'discord':
      return c;
    default:
      return 'system';
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as any;

    if (!body) {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON' },
        { status: 400 },
      );
    }

    /* ---------------- Wallet ---------------- */
    const rawWallet = body.wallet ?? body.wallet_address ?? '';
    const wallet = rawWallet ? String(rawWallet) : '';

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'wallet is required' },
        { status: 400 },
      );
    }

    /* ---------------- Channel (normalized) ---------------- */
    const channel = normalizeChannel(body.channel);

    /* ---------------- Context ---------------- */
    const context =
      body.context && typeof body.context === 'string'
        ? body.context
        : 'profile';

    /* ---------------- Day ---------------- */
    const day =
      typeof body.day === 'string' && body.day.length >= 10
        ? body.day.slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    /* ---------------- TX ID (opsiyonel) ---------------- */
    const txId =
      body.txId ??
      body.tx_id ??
      body.tx_id_str ??
      null;

    let awarded = 0;

    /* ======================================================
       1) TX-ID VARSA → Coincarnation işlemine özel share CP
       ====================================================== */
    if (txId) {
      const txStr = String(txId);

      // Aynı işlem için ikinci kez CP verme
      const already = await sql/* sql */`
        SELECT 1 FROM corepoint_events
        WHERE wallet_address = ${wallet}
          AND type = 'share'
          AND tx_id = ${txStr}
        LIMIT 1
      `;

      if (already.length > 0) {
        const total = await totalCorePoints(wallet);
        return NextResponse.json({
          success: true,
          awarded: 0,
          total,
          reason: 'tx_already_shared',
          txId: txStr,
        });
      }

      // awardShare artık txId destekli
      const res = await awardShare({
        wallet,
        channel,
        context,
        day,
        txId: txStr,
      });

      awarded = res.awarded ?? 0;

      const total = await totalCorePoints(wallet);
      return NextResponse.json({
        success: true,
        awarded,
        total,
        day,
        txId: txStr,
        mode: 'tx_based',
      });
    }

    /* ======================================================
       2) TX-ID YOKSA → GLOBAL PAYLAŞIM KURALLARI
       ====================================================== */

    /* ----------- A) COPY → cüzdan başına 1 kez CP ----------- */
    if (channel === 'copy') {
      const copyContext = 'copy_global';

      const alreadyCopy = await sql/* sql */`
        SELECT 1 FROM corepoint_events
        WHERE wallet_address = ${wallet}
          AND type = 'share'
          AND context = ${copyContext}
        LIMIT 1
      `;

      if (alreadyCopy.length > 0) {
        const total = await totalCorePoints(wallet);
        return NextResponse.json({
          success: true,
          awarded: 0,
          total,
          reason: 'copy_already_used',
          day,
        });
      }

      const res = await awardShare({
        wallet,
        channel: 'copy',
        context: copyContext,
        day,
        txId: null,
      });

      awarded = res.awarded ?? 0;

      const total = await totalCorePoints(wallet);
      return NextResponse.json({
        success: true,
        awarded,
        total,
        day,
        mode: 'copy_once_global',
      });
    }

    /* ----------- B) TWITTER → context başına 1 kez CP ----------- */
    if (channel === 'twitter') {
      const already = await sql/* sql */`
        SELECT 1 FROM corepoint_events
        WHERE wallet_address = ${wallet}
          AND type = 'share'
          AND context = ${context}
        LIMIT 1
      `;

      if (already.length > 0) {
        const total = await totalCorePoints(wallet);
        return NextResponse.json({
          success: true,
          awarded: 0,
          total,
          reason: 'context_shared_once',
          context,
          day,
        });
      }

      const res = await awardShare({
        wallet,
        channel: 'twitter',
        context,
        day,
        txId: null,
      });

      awarded = res.awarded ?? 0;

      const total = await totalCorePoints(wallet);
      return NextResponse.json({
        success: true,
        awarded,
        total,
        day,
        mode: 'context_once',
      });
    }

    /* ----------- C) Diğer kanallar → şimdilik CP yok ----------- */
    const total = await totalCorePoints(wallet);
    return NextResponse.json({
      success: true,
      awarded: 0,
      total,
      reason: 'channel_no_cp',
      channel,
      day,
    });
  } catch (e: any) {
    console.error('❌ /api/share/record failed:', e?.message || e);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
