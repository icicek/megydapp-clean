// app/api/share/record/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { awardShare, totalCorePoints } from '@/app/api/_lib/corepoints';

type Channel =
  | 'twitter'
  | 'telegram'
  | 'whatsapp'
  | 'email'
  | 'copy'
  | 'instagram'
  | 'tiktok'
  | 'discord'
  | 'system';

/* --------------------------------------------------
   Channel normalizer
-------------------------------------------------- */
function normalizeChannel(raw: any): Channel {
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

// tx tabanlı context (her kanal için ayrı)
function txContext(channel: Channel, txId: string): string {
  return `tx:${channel}:${txId}`;
}

// global paylaşım context’i (PVC, leaderboard vs)
function globalContext(prefix: string, key: string): string {
  return `${prefix}:${key}`;
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

    /* ---------------- Channel ---------------- */
    stage = 'channel';
    const channel = normalizeChannel(body.channel);

    /* ---------------- Context (ham) ---------------- */
    stage = 'context';
    const rawContext =
      typeof body.context === 'string' && body.context.trim().length > 0
        ? body.context.trim()
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
          Her (wallet + txId + channel) için SADECE 1 kez.
          Bunu context üzerinden encode ediyoruz:
            "tx:twitter:<txId>", "tx:copy:<txId>" vb.
       ====================================================== */
    if (txId) {
      const ctx = txContext(channel, txId);

      stage = 'tx_select_existing';
      const existing = await sql/* sql */`
        SELECT 1
        FROM corepoint_events
        WHERE wallet_address = ${wallet}
          AND type = 'share'
          AND context = ${ctx}
        LIMIT 1
      `;

      if (existing.length > 0) {
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
          context: ctx,
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
          context: ctx,
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
        context: ctx,
        txId,
        channel,
        mode: 'tx_based_per_channel',
        stage,
      });
    }

    /* ======================================================
       2) TX-ID YOKSA → GLOBAL PAYLAŞIM KURALLARI
          (PVC, Leaderboard, Referral v.b.)
       ====================================================== */

    /* ----------- A) COPY → her context (PVC, leaderboard, vs.) + anchor kombinasyonu için 1 kez ----------- */
        /* ----------- A) COPY → 
         - contribution: her tx için 1 kez
         - profile: cüzdan başına 1 kez
         - leaderboard: cüzdan başına 1 kez
       -------------------------------------------------- */
    if (channel === 'copy') {
      // rawContext: 'profile' | 'leaderboard' | 'contribution' | ...
      const base =
        typeof rawContext === 'string' && rawContext.trim().length > 0
          ? rawContext.trim()
          : 'global';

      let key: string;

      if (base === 'contribution' && anchor) {
        // Contribution History:
        // ClaimPanel'den gelen anchor: "contribution:<wallet>:<tx…>"
        // Burada 1 tx = 1 copy CP istiyoruz → anchor'ı kullan.
        key = anchor.startsWith('copy:') ? anchor : `copy:${anchor}`;
      } else {
        // PVC & Leaderboard (& diğer global contextler):
        // Anchor’ı hiç umursama, sadece context'e göre 1 kere.
        // profile → "copy:profile"
        // leaderboard → "copy:leaderboard"
        key = `copy:${base}`;
      }

      // Sadece channel='copy' kayıtlarına bak
      const existing = await sql/* sql */`
        SELECT 1
        FROM corepoint_events
        WHERE wallet_address = ${wallet}
          AND type = 'share'
          AND channel = 'copy'
          AND context = ${key}
        LIMIT 1
      `;

      if (existing.length > 0) {
        const total = await totalCorePoints(wallet);
        return NextResponse.json({
          success: true,
          awarded: 0,
          total,
          reason: 'copy_anchor_or_context_already_used',
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

      const awarded = res.awarded ?? 0;
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

    /* ----------- B) TWITTER → her anchor/context için 1 kez ----------- */
    if (channel === 'twitter') {
      // PVC: anchor = "profile:<wallet>"
      // Leaderboard: anchor = "lb:<wallet>"
      // Anchor yoksa rawContext kullan.
      const baseKey = anchor || rawContext;
      const ctx = globalContext('twitter', baseKey); // örn: "twitter:lb:<wallet>"

      stage = 'tw_select_existing';
      const existing = await sql/* sql */`
        SELECT 1
        FROM corepoint_events
        WHERE wallet_address = ${wallet}
          AND type = 'share'
          AND context = ${ctx}
        LIMIT 1
      `;

      if (existing.length > 0) {
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
          reason: 'twitter_context_once',
          context: ctx,
          day,
          stage,
        });
      }

      stage = 'tw_award';
      try {
        const res = await awardShare({
          wallet,
          channel: 'twitter',
          context: ctx,
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
        mode: 'twitter_once_per_context',
        context: ctx,
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
