import { NextRequest, NextResponse } from 'next/server';
import { recordVote } from '@/app/api/list/repo';

export async function POST(req: NextRequest) {
  try {
    const { mint, voterWallet, voteYes } = await req.json();

    if (!mint || !voterWallet || typeof voteYes !== 'boolean') {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }

    const result = await recordVote(mint, voterWallet, voteYes);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Vote API error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
