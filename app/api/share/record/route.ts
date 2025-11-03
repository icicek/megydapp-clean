// app/api/share/record/route.ts
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// Channel → CorePoint map (server-source-of-truth)
const CHANNEL_POINTS: Record<string, number> = {
  'x': 30,
  'telegram': 15,
  'whatsapp': 12,
  'discord': 12,
  'email': 10,
  'copy-link': 5,
  'download-image': 0,
  'system': 0,
};

type Body = {
  wallet_address: string;
  channel?: string;         // 'x' | 'telegram' | ...
  context?: string;         // 'profile' | 'contribution' | 'leaderboard' | 'success'
  txId?: string | null;
  imageId?: string | null;
};

// Helper to coerce undefined/null → ''
const nz = (v?: string | null) => (v ?? '');

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const wallet = (body.wallet_address || '').trim();

    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Missing wallet address' }, { status: 400 });
    }

    const channel = (body.channel || '').trim().toLowerCase();
    const context = (body.context || '').trim().toLowerCase();
    const txId = body.txId ? String(body.txId) : '';
    const imageId = body.imageId ? String(body.imageId) : '';

    const points = CHANNEL_POINTS[channel] ?? 0;

    // 1) Idempotency check via unique key (wallet, channel, context, txId)
    //    If unique index exists this INSERT ... ON CONFLICT DO NOTHING pattern is ideal.
    const inserted = await sql/* sql */`
      INSERT INTO shares (wallet_address, channel, context, tx_id, image_id)
      VALUES (${wallet}, ${nz(channel)}, ${nz(context)}, ${nz(txId)}, ${nz(imageId)})
      ON CONFLICT ON CONSTRAINT uq_shares_identity DO NOTHING
      RETURNING wallet_address;
    `;

    const firstTime = inserted.length > 0;

    // 2) If not first time, do not award points again
    if (!firstTime) {
      return NextResponse.json({ success: true, message: 'Already recorded', awarded: 0 });
    }

    // 3) If points > 0, update participant’s CorePoint and breakdown
    if (points > 0) {
      // fetch current
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
          shares: (breakdown.shares || 0) + points, // legacy 'shares' toplamı (genel)
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

    return NextResponse.json({ success: true, awarded: points, firstTime });
  } catch (error) {
    console.error('❌ Share record error:', error);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
