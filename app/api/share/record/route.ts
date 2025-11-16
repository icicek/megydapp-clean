// app/api/share/record/route.ts
export const dynamic = 'force-dynamic';

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { awardShare, totalCorePoints } from '@/app/api/_lib/corepoints'; // ← yeni helper (ledger)
import { getCfgNumber } from '@/app/api/_lib/corepoints';                // ← admin_config'ten sayı okur

const sql = neon(process.env.DATABASE_URL!);

const LEGACY_POINTS: Record<string, number> = {
  twitter: 30,
  telegram: 15,
  whatsapp: 12,
  discord: 12,
  email: 10,
  'copy-link': 5,
  copy: 5,
  'download-image': 0,
  system: 0,
};

type LegacyChannel = keyof typeof LEGACY_POINTS;
const legacyPoints = (ch: string) =>
  LEGACY_POINTS[(ch as LegacyChannel)] ?? 10; // default 10

type Body = {
  wallet_address: string;
  channel?: string;         // 'twitter' | 'telegram' | 'whatsapp' | 'email' | 'copy' | 'instagram' | 'tiktok' | ...
  context?: 'profile' | 'contribution' | 'leaderboard' | 'success' | string;
  txId?: string | null;
  imageId?: string | null;
};

const nz = (v?: string | null) => (v ?? '');

function normChannel(raw: string): string {
  const c = (raw || '').trim().toLowerCase();
  if (c === 'x') return 'twitter';          // senkronizasyon
  if (c === 'copy-text' || c === 'copy_link') return 'copy';
  return c;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const wallet = (body.wallet_address || '').trim();
    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Missing wallet address' }, { status: 400 });
    }

    const channel = normChannel(body.channel || '');
    const context = (body.context || '').trim().toLowerCase();
    const txId = body.txId ? String(body.txId) : '';
    const imageId = body.imageId ? String(body.imageId) : '';

    // 1) Idempotent share kaydı (mevcut davranış)
    const inserted = await sql/* sql */`
      INSERT INTO shares (wallet_address, channel, context, tx_id, image_id)
      VALUES (${wallet}, ${nz(channel)}, ${nz(context)}, ${nz(txId)}, ${nz(imageId)})
      ON CONFLICT ON CONSTRAINT uq_shares_identity DO NOTHING
      RETURNING wallet_address;
    `;
    const firstTime = inserted.length > 0;
    if (!firstTime) {
      // zaten vardı → puan tekrar verilmez
      return NextResponse.json({ success: true, message: 'Already recorded', awarded: 0 });
    }

    // 2) Puan değeri (config → fallback legacy)
    //    twitter: cp_share_twitter, others: cp_share_other ve multiplier cp_mult_share
    const base =
      channel === 'twitter'
        ? await getCfgNumber('cp_share_twitter', LEGACY_POINTS.twitter)
        : await getCfgNumber('cp_share_other',   (LEGACY_POINTS as Record<string, number>)[channel] ?? 10);

    const mult = await getCfgNumber('cp_mult_share', 1.0);

    const points = Math.max(0, Math.floor(base * mult));

    // 3) Ledger’a da yaz (raporlama için) — günlük idempotency:
    //    NOT: awardShare() conflict durumunda 0 puan dönebilir (aynı gün aynı context/kanal tekrar)
    let ledgerAwarded = 0;
    try {
      const res = await awardShare({
        wallet,
        channel: (channel as any) || 'copy',
        context: context || 'unknown',
        day: todayISO(),
      });
      ledgerAwarded = res.awarded || 0;
    } catch (e) {
      // ledger opsiyonel — sessiz geç
      console.warn('[share/record] ledger award skipped:', (e as any)?.message || e);
    }

    // 4) participants toplamını ve breakdown’ı da güncelle (mevcut davranış)
    if (points > 0) {
      const rows = await sql/* sql */`
        SELECT core_point, core_point_breakdown
        FROM participants
        WHERE wallet_address = ${wallet};
      `;
      if (rows.length > 0) {
        const currentPoint = Number(rows[0].core_point || 0);
        const breakdown = (rows[0].core_point_breakdown as any) || {};

        const newBreakdown = {
          ...breakdown,
          shares: (breakdown.shares || 0) + points,
          by_channel: {
            ...(breakdown.by_channel || {}),
            [channel || 'unknown']: ((breakdown.by_channel?.[channel] || 0) + points),
          },
        };
        const newCorePoint = currentPoint + points;

        await sql/* sql */`
          UPDATE participants
          SET core_point = ${newCorePoint},
              core_point_breakdown = ${JSON.stringify(newBreakdown)}::jsonb
          WHERE wallet_address = ${wallet};
        `;
      }
    }

    // 5) opsiyonel: toplam puanı ledger’dan oku (varsa)
    let totalFromLedger: number | null = null;
    try {
      totalFromLedger = await totalCorePoints(wallet);
    } catch {}

    return NextResponse.json({
      success: true,
      awarded: points,
      firstTime,
      ledgerAwarded,
      total_ledger: totalFromLedger,
    });
  } catch (error) {
    console.error('❌ Share record error:', error);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
