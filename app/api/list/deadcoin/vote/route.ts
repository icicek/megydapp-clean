import { NextResponse } from 'next/server';
import { voteDeadcoin } from '../../_store';

// (Opsiyonel)
export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { mint, vote } = await req.json();

    if (!mint || !['yes', 'no'].includes(vote)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { yes, no, isDeadcoin } = voteDeadcoin(mint, vote as 'yes' | 'no');

    return NextResponse.json({
      mint,
      votes: { yes, no },
      isDeadcoin, // 3+ YES sonrası true olur
    });
  } catch (err) {
    console.error('❌ Error recording deadcoin vote:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
