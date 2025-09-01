// app/api/admin/token/deadcoin-vote/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { httpErrorFrom } from '@/app/api/_lib/http';

const sql = neon(process.env.DATABASE_URL!);

// Threshold: kaç oyda deadcoin'e dönüşür
const DEADCOIN_VOTE_THRESHOLD = 3;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mint, wallet_address } = body;

    if (!mint || !wallet_address) {
      return NextResponse.json(
        { success: false, error: 'mint and wallet_address are required.' },
        { status: 400 }
      );
    }

    // Önce daha önce vote verilmiş mi kontrol et
    const existingVote = await sql`
      SELECT id FROM deadcoin_votes 
      WHERE mint = ${mint} AND wallet_address = ${wallet_address}
    `;

    if ((existingVote as any[]).length > 0) {
      return NextResponse.json(
        { success: false, error: 'You have already voted for this token.' },
        { status: 400 }
      );
    }

    // Vote'u ekle
    await sql`
      INSERT INTO deadcoin_votes (mint, wallet_address)
      VALUES (${mint}, ${wallet_address})
    `;

    // Şu anki toplam vote sayısını bul
    const voteCountResult = await sql`
      SELECT COUNT(*) as count FROM deadcoin_votes WHERE mint = ${mint}
    `;
    const voteCount = parseInt((voteCountResult as any[])[0].count, 10);

    // tokens tablosunu güncelle (vote sayısı)
    await sql`
      UPDATE tokens
      SET deadcoin_votes = ${voteCount}
      WHERE mint = ${mint}
    `;

    // Eğer threshold geçtiyse, token'ı deadcoin yap
    if (voteCount >= DEADCOIN_VOTE_THRESHOLD) {
      await sql`
        UPDATE tokens
        SET status = 'deadcoin'
        WHERE mint = ${mint}
      `;
    }

    return NextResponse.json({
      success: true,
      message:
        voteCount >= DEADCOIN_VOTE_THRESHOLD
          ? 'Token has been marked as deadcoin.'
          : 'Your deadcoin vote has been recorded.',
      total_votes: voteCount,
    });
  } catch (error: any) {
    const { status, body } = httpErrorFrom(error, 500);
    return NextResponse.json(body, { status });
  }
}
