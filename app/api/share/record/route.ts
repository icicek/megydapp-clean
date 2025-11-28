// app/api/share/record/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { awardShare, totalCorePoints } from '@/app/api/_lib/corepoints';

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
    const contextRaw =
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

    /* ---------------- Anchor (opsiyonel) ---------------- */
    // Özellikle COPY + txsiz share'ler için buton bazlı unique anahtar
    // Örn: "profile:<wallet>", "leaderboard:<wallet>"
    const rawAnchor = typeof body.anchor === 'string' ? body.anchor.trim() : '';
    const anchor = rawAnchor || null;

    let awarded = 0;

    /* ======================================================
       1) TX-ID VARSA → Coincarnation işlemine özel share CP
          (Her tx_id + channel için sadece 1 kere)
       ====================================================== */
    if (txIdRaw) {
      const txStr = String(txIdRaw);

      // Kanal bazlı tekil context anahtarı:
      // Örn: "tx:x:<txhash>" veya "tx:copy:<txhash>"
      const chanKey =
        channel === 'twitter'
          ? 'x'
          : channel === 'copy'
          ? 'copy'
          : channel;
      const txContextKey = `tx:${chanKey}:${txStr}`;

      try {
        const already = await sql/* sql */`
          SELECT 1 FROM corepoint_events
          WHERE wallet_address = ${wallet}
            AND type = 'share'
            AND tx_id = ${txStr}
            AND context = ${txContextKey}
          LIMIT 1
        `;

        if (already.length > 0) {
          const total = await totalCorePoints(wallet);
          return NextResponse.json({
            success: true,
            awarded: 0,
            total,
            reason: 'tx_channel_already_shared',
            txId: txStr,
            context: txContextKey,
          });
        }
      } catch (e: any) {
        console.error('❌ /api/share/record tx_select_existing failed:', e?.message || e);
        return NextResponse.json(
          {
            success: false,
            error: 'sql_error_tx_select_existing',
            stage: 'tx_select_existing',
            detail: String(e?.message || e),
          },
          { status: 500 },
        );
      }

      try {
        const res = await awardShare({
          wallet,
          channel,
          // context: tx + channel bazlı anahtar
          context: txContextKey,
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
          context: txContextKey,
          mode: 'tx_channel_once',
        });
      } catch (e: any) {
        console.error('❌ /api/share/record tx_award failed:', e?.message || e);
        return NextResponse.json(
          {
            success: false,
            error: 'sql_error_tx_award',
            stage: 'tx_award',
            detail: String(e?.message || e),
          },
          { status: 500 },
        );
      }
    }

    /* ======================================================
       2) TX-ID YOKSA → GLOBAL PAYLAŞIM KURALLARI
       ====================================================== */

    /* ----------- A) COPY → cüzdan + anchor (varsa) + yoksa context başına 1 kez ----------- */
    if (channel === 'copy') {
      // Eğer anchor verilmişse onu kullan (buton bazlı kilit),
      // verilmemişse copy:context fallback'i ile eskisi gibi davran.
      const key = anchor || `copy:${contextRaw || 'global'}`;

      try {
        const alreadyCopy = await sql/* sql */`
          SELECT 1 FROM corepoint_events
          WHERE wallet_address = ${wallet}
            AND type = 'share'
            AND context = ${key}
          LIMIT 1
        `;

        if (alreadyCopy.length > 0) {
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
      } catch (e: any) {
        console.error('❌ /api/share/record copy_select_existing failed:', e?.message || e);
        return NextResponse.json(
          {
            success: false,
            error: 'sql_error_copy_select_existing',
            stage: 'copy_select_existing',
            detail: String(e?.message || e),
          },
          { status: 500 },
        );
      }

      try {
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
      } catch (e: any) {
        console.error('❌ /api/share/record copy_award failed:', e?.message || e);
        return NextResponse.json(
          {
            success: false,
            error: 'sql_error_copy_award',
            stage: 'copy_award',
            detail: String(e?.message || e),
          },
          { status: 500 },
        );
      }
    }

    /* ----------- B) TWITTER → anchor varsa anchor, yoksa context başına 1 kez ----------- */
    if (channel === 'twitter') {
      const key = anchor || contextRaw;

      try {
        const already = await sql/* sql */`
          SELECT 1 FROM corepoint_events
          WHERE wallet_address = ${wallet}
            AND type = 'share'
            AND context = ${key}
          LIMIT 1
        `;

        if (already.length > 0) {
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
      } catch (e: any) {
        console.error('❌ /api/share/record twitter_select_existing failed:', e?.message || e);
        return NextResponse.json(
          {
            success: false,
            error: 'sql_error_twitter_select_existing',
            stage: 'twitter_select_existing',
            detail: String(e?.message || e),
          },
          { status: 500 },
        );
      }

      try {
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
      } catch (e: any) {
        console.error('❌ /api/share/record twitter_award failed:', e?.message || e);
        return NextResponse.json(
          {
            success: false,
            error: 'sql_error_twitter_award',
            stage: 'twitter_award',
            detail: String(e?.message || e),
          },
          { status: 500 },
        );
      }
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
    console.error('❌ /api/share/record failed (outer):', e?.message || e);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
