// app/api/share/record/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  awardShare,
  totalCorePoints,
} from '@/app/api/_lib/corepoints';
import { sql } from '@/app/api/_lib/db';

// UI tarafında kullanacağımız kanal isimleri
const ALLOWED_CHANNELS = new Set([
  'twitter',
  'telegram',
  'whatsapp',
  'email',
  'copy',
  'instagram',
  'tiktok',
  'discord',
  'system',
]);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as any;

    // 🔹 Hem wallet hem wallet_address destekleniyor
    const rawWallet = body?.wallet ?? body?.wallet_address ?? '';
    const wallet = rawWallet ? String(rawWallet) : '';

    let channel = body?.channel ? String(body.channel).toLowerCase() : 'twitter';
    const rawContext = body?.context ? String(body.context) : 'profile';

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'wallet is required' },
        { status: 400 },
      );
    }

    // X / Twitter alias düzeltmesi
    if (channel === 'x') channel = 'twitter';

    // Beklenmeyen değer gelirse system olarak işaretle
    if (!ALLOWED_CHANNELS.has(channel)) {
      channel = 'system';
    }

    // Gün bilgisi: body.day varsa onu kullan, yoksa bugün
    const day: string =
      typeof body?.day === 'string' && body.day.length >= 10
        ? body.day.slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    let awarded = 0;

    // ------------- KURAL 1: X (Twitter) -------------
    if (channel === 'twitter') {
      const context = rawContext; // profile | contribution | leaderboard | success

      // Her context için 1 kere CP
      const already = await sql/* sql */`
        SELECT 1
        FROM corepoint_events
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
          day,
          reason: 'already_shared_this_context',
        });
      }

      const res = await awardShare({
        wallet,
        channel: 'twitter',
        context,
        day,
      });
      awarded = res.awarded ?? 0;
    }

    // ------------- KURAL 2: Copy Text (tüm sistemde 1 kez) -------------
    else if (channel === 'copy') {
      const copyContext = 'copy_global';

      const alreadyCopy = await sql/* sql */`
        SELECT 1
        FROM corepoint_events
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
          day,
          reason: 'copy_already_counted',
        });
      }

      const res = await awardShare({
        wallet,
        channel: 'copy',
        context: copyContext,
        day,
      });
      awarded = res.awarded ?? 0;
    }

    // ------------- KURAL 3: Diğer kanallar (şimdilik CP yok) -------------
    else {
      const total = await totalCorePoints(wallet);
      return NextResponse.json({
        success: true,
        awarded: 0,
        total,
        day,
        reason: 'channel_no_corepoint',
      });
    }

    const total = await totalCorePoints(wallet);

    return NextResponse.json({
      success: true,
      awarded,
      total,
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
