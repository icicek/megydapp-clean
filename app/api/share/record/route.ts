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
  let stage = 'start';

  try {
    stage = 'parse_body';
    const body = (await req.json().catch(() => null)) as any;

    if (!body) {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON', stage },
        { status: 400 },
      );
    }

    /* ---------------- Wallet ---------------- */
    stage = 'wallet';
    const rawWallet = body.wallet ?? body.wallet_address ?? '';
    const wallet = rawWallet ? String(rawWallet) : '';

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'wallet is required', stage },
        { status: 400 },
      );
    }

    /* ---------------- Channel (normalized) ---------------- */
    stage = 'channel';
    const channel = normalizeChannel(body.channel);

    /* ---------------- Context ---------------- */
    stage = 'context';
    let context: string =
      body.context && typeof body.context === 'string'
        ? body.context
        : 'profile';

    /* ---------------- Day ---------------- */
    stage = 'day';
    const day =
      typeof body.day === 'string' && body.day.length >= 10
        ? body.day.slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    /* ---------------- TX ID (opsiyonel) ---------------- */
    stage = 'txId';
    const txIdRaw =
      body.txId ??
      body.tx_id ??
      body.tx_id_str ??
      null;
    const txId = txIdRaw ? String(txIdRaw) : null;

    /* ---------------- Anchor (opsiyonel) ---------------- */
    stage = 'anchor';
    const rawAnchor = typeof body.anchor === 'string' ? body.anchor.trim() : '';
    const anchor = rawAnchor || null;

    let awarded = 0;

    /* ======================================================
       1) TX-ID VARSA → Coincarnation işlemine özel share CP
          Her (wallet, tx_id, channel) kombinasyonu için
          SADECE 1 kez CP verilir.
       ====================================================== */
    if (txId) {
      stage = 'tx_select_existing';

      let already;
      try {
        already = await sql/* sql */`
          SELECT 1 FROM corepoint_events
          WHERE wallet_address = ${wallet}
            AND type = 'share'
            AND tx_id = ${txId}
            AND channel = ${channel}
          LIMIT 1
        `;
      } catch (e: any) {
        console.error('❌ SQL error at tx_select_existing:', e?.message || e);
        return NextResponse.json(
          {
            success: false,
            error: 'sql_error_tx_select_existing',
            stage,
            detail: String(e?.message || e),
          },
          { status: 500 },
        );
      }

      if (already.length > 0) {
        stage = 'tx_already';
        let total = 0;
        try {
          total = await totalCorePoints(wallet);
        } catch (e: any) {
          console.error('❌ totalCorePoints error at tx_already:', e?.message || e);
        }
        return NextResponse.json({
          success: true,
          awarded: 0,
          total,
          reason: 'tx_already_shared_for_channel',
          txId,
          channel,
          stage,
        });
      }

      stage = 'tx_award';
      try {
        const res = await awardShare({
          wallet,
          channel,
          context,
          day,
          txId,
        });

        awarded = res.awarded ?? 0;
      } catch (e: any) {
        console.error('❌ awardShare error at tx_award:', e?.message || e);
        return NextResponse.json(
          {
            success: false,
            error: 'award_share_failed_tx',
            stage,
            detail: String(e?.message || e),
          },
          { status: 500 },
        );
      }

      stage = 'tx_total';
      let total = 0;
      try {
        total = await totalCorePoints(wallet);
      } catch (e: any) {
        console.error('❌ totalCorePoints error at tx_total:', e?.message || e);
      }

      return NextResponse.json({
        success: true,
        awarded,
        total,
        day,
        txId,
        mode: 'tx_based_per_channel',
        stage,
      });
    }

    /* ======================================================
       2) TX-ID YOKSA → GLOBAL PAYLAŞIM KURALLARI
          (PVC, Leaderboard, Profil vb.)
       ====================================================== */

    /* ----------- A) COPY → cüzdan + anchor (varsa) + channel='copy' ----------- */
    if (channel === 'copy') {
      stage = 'copy_select_existing';
      const key = anchor || `copy:${context || 'global'}`;

      let alreadyCopy;
      try {
        alreadyCopy = await sql/* sql */`
          SELECT 1 FROM corepoint_events
          WHERE wallet_address = ${wallet}
            AND type = 'share'
            AND context = ${key}
            AND channel = 'copy'
          LIMIT 1
        `;
      } catch (e: any) {
        console.error('❌ SQL error at copy_select_existing:', e?.message || e);
        return NextResponse.json(
          {
            success: false,
            error: 'sql_error_copy_select_existing',
            stage,
            detail: String(e?.message || e),
          },
          { status: 500 },
        );
      }

      if (alreadyCopy.length > 0) {
        stage = 'copy_already';
        let total = 0;
        try {
          total = await totalCorePoints(wallet);
        } catch (e: any) {
          console.error('❌ totalCorePoints error at copy_already:', e?.message || e);
        }
        return NextResponse.json({
          success: true,
          awarded: 0,
          total,
          reason: 'copy_anchor_or_context_already_used_for_copy',
          context: key,
          day,
          stage,
        });
      }

      stage = 'copy_award';
      try {
        const res = await awardShare({
          wallet,
          channel: 'copy',
          context: key,
          day,
          txId: null,
        });
        awarded = res.awarded ?? 0;
      } catch (e: any) {
        console.error('❌ awardShare error at copy_award:', e?.message || e);
        return NextResponse.json(
          {
            success: false,
            error: 'award_share_failed_copy',
            stage,
            detail: String(e?.message || e),
          },
          { status: 500 },
        );
      }

      stage = 'copy_total';
      let total = 0;
      try {
        total = await totalCorePoints(wallet);
      } catch (e: any) {
        console.error('❌ totalCorePoints error at copy_total:', e?.message || e);
      }

      return NextResponse.json({
        success: true,
        awarded,
        total,
        day,
        mode: 'copy_once_per_anchor_or_context',
        context: key,
        stage,
      });
    }

    /* ----------- B) TWITTER → anchor veya context başına 1 kez CP ----------- */
    if (channel === 'twitter') {
      stage = 'tw_select_existing';
      const key = anchor || context || 'global';

      let alreadyTw;
      try {
        alreadyTw = await sql/* sql */`
          SELECT 1 FROM corepoint_events
          WHERE wallet_address = ${wallet}
            AND type = 'share'
            AND context = ${key}
            AND channel = 'twitter'
          LIMIT 1
        `;
      } catch (e: any) {
        console.error('❌ SQL error at tw_select_existing:', e?.message || e);
        return NextResponse.json(
          {
            success: false,
            error: 'sql_error_tw_select_existing',
            stage,
            detail: String(e?.message || e),
          },
          { status: 500 },
        );
      }

      if (alreadyTw.length > 0) {
        stage = 'tw_already';
        let total = 0;
        try {
          total = await totalCorePoints(wallet);
        } catch (e: any) {
          console.error('❌ totalCorePoints error at tw_already:', e?.message || e);
        }
        return NextResponse.json({
          success: true,
          awarded: 0,
          total,
          reason: 'twitter_anchor_or_context_shared_once',
          context: key,
          day,
          stage,
        });
      }

      stage = 'tw_award';
      try {
        const res = await awardShare({
          wallet,
          channel: 'twitter',
          context: key,
          day,
          txId: null,
        });
        awarded = res.awarded ?? 0;
      } catch (e: any) {
        console.error('❌ awardShare error at tw_award:', e?.message || e);
        return NextResponse.json(
          {
            success: false,
            error: 'award_share_failed_tw',
            stage,
            detail: String(e?.message || e),
          },
          { status: 500 },
        );
      }

      stage = 'tw_total';
      let total = 0;
      try {
        total = await totalCorePoints(wallet);
      } catch (e: any) {
        console.error('❌ totalCorePoints error at tw_total:', e?.message || e);
      }

      return NextResponse.json({
        success: true,
        awarded,
        total,
        day,
        mode: 'twitter_once_per_anchor_or_context',
        context: key,
        stage,
      });
    }

    /* ----------- C) Diğer kanallar → şimdilik CP yok ----------- */
    stage = 'other_channels';
    let total = 0;
    try {
      total = await totalCorePoints(wallet);
    } catch (e: any) {
      console.error('❌ totalCorePoints error at other_channels:', e?.message || e);
    }

    return NextResponse.json({
      success: true,
      awarded: 0,
      total,
      reason: 'channel_no_cp',
      channel,
      day,
      stage,
    });
  } catch (e: any) {
    console.error('❌ /api/share/record failed (outer):', e?.message || e, 'at stage', stage);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        stage,
        detail: String(e?.message || e),
      },
      { status: 500 },
    );
  }
}
