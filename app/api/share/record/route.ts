// app/api/share/record/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  awardShare,
  totalCorePoints,
} from '@/app/api/_lib/corepoints';

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
    const body = await req.json().catch(() => null) as any;

    // 🔹 Hem wallet hem wallet_address destekleniyor
    const rawWallet = body?.wallet ?? body?.wallet_address ?? '';
    const wallet = rawWallet ? String(rawWallet) : '';

    let channel = body?.channel ? String(body.channel).toLowerCase() : 'twitter';
    const context = body?.context ? String(body.context) : 'profile';

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

    // 1) Share event'i corepoint_events tablosuna yaz
    const { awarded } = await awardShare({
      wallet,
      channel: channel as any,
      context,
      day,
    });

    // 2) İstersen UI için güncel toplam CP
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
