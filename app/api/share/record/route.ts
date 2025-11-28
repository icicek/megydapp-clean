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
    let context: string =
      body.context && typeof body.context === 'string'
        ? body.context
        : 'profile';

    /* ---------------- Day ---------------- */
    const day =
      typeof body.day === 'string' && body.day.length >= 10
        ? body.day.slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    /* ---------------- TX ID (opsiyonel) ---------------- */
    const txIdRaw =
      body.txId ??
      body.tx_id ??
      body.tx_id_str ??
      null;
    const txId = txIdRaw ? String(txIdRaw) : null;

    /* ---------------- Anchor (opsiyonel) ---------------- */
    const rawAnchor = typeof body.anchor === 'string' ? body.anchor.trim() : '';
    const anchor = rawAnchor || null;

    let awarded = 0;

    /* ======================================================
       1) TX-ID VARSA → Coincarnation işlemine özel share CP
          Her (wallet, tx_id, channel) kombinasyonu için
          SADECE 1 kez CP verilir.
       ====================================================== */
    if (txId) {
      const already = await sql/* sql */`
        SELECT 1 FROM corepoint_events
        WHERE wallet_address = ${wallet}
          AND type = 'share'
          AND tx_id = ${txId}
          AND channel = ${channel}
        LIMIT 1
      `;

      if (already.length > 0) {
        const total = await totalCorePoints(wallet);
        return NextResponse.json({
          success: true,
          awarded: 0,
          total,
          reason: 'tx_already_shared_for_channel',
          txId,
          channel,
        });
      }

      const res = await awardShare({
        wallet,
        channel,
        context, // success / contribution vs.
        day,
        txId,
      });

      awarded = res.awarded ?? 0;

      const total = await totalCorePoints(wallet);
      return NextResponse.json({
        success: true,
        awarded,
        total,
        day,
        txId,
        mode: 'tx_based_per_channel',
      });
    }

    /* ======================================================
       2) TX-ID YOKSA → GLOBAL PAYLAŞIM KURALLARI
          (PVC, Leaderboard, Profil vb.)
       ====================================================== */

    /* ----------- A) COPY → cüzdan + anchor (varsa) + channel='copy' ----------- */
    if (channel === 'copy') {
      // Anchor verilmişse onu, yoksa context tabanlı bir key kullan
      const key = anchor || `copy:${context || 'global'}`;

      const alreadyCopy = await sql/* sql */`
        SELECT 1 FROM corepoint_events
        WHERE wallet_address = ${wallet}
          AND type = 'share'
          AND context = ${key}
          AND channel = 'copy'
        LIMIT 1
      `;

      if (alreadyCopy.length > 0) {
        const total = await totalCorePoints(wallet);
        return NextResponse.json({
          success: true,
          awarded: 0,
          total,
          reason: 'copy_anchor_or_context_already_used_for_copy',
          context: key,
          day,
        });
      }

      const res = await awardShare({
        wallet,
        channel: 'copy',
        context: key,
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
        mode: 'copy_once_per_anchor_or_context',
        context: key,
      });
    }

    /* ----------- B) TWITTER → anchor veya context başına 1 kez CP ----------- */
    if (channel === 'twitter') {
      // PVC / Leaderboard gibi durumlarda anchor varsa onu kullan
      const key = anchor || context || 'global';

      const alreadyTw = await sql/* sql */`
        SELECT 1 FROM corepoint_events
        WHERE wallet_address = ${wallet}
          AND type = 'share'
          AND context = ${key}
          AND channel = 'twitter'
        LIMIT 1
      `;

      if (alreadyTw.length > 0) {
        const total = await totalCorePoints(wallet);
        return NextResponse.json({
          success: true,
          awarded: 0,
          total,
          reason: 'twitter_anchor_or_context_shared_once',
          context: key,
          day,
        });
      }

      const res = await awardShare({
        wallet,
        channel: 'twitter',
        context: key,
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
        mode: 'twitter_once_per_anchor_or_context',
        context: key,
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
