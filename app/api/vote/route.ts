import { NextRequest, NextResponse } from 'next/server';
import { recordVote } from '@/app/api/list/repo';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mint, voterWallet, voteYes } = body || {};
    if (!mint || !voterWallet || typeof voteYes !== 'boolean') {
      return NextResponse.json({ success: false, error: 'mint, voterWallet, voteYes are required' }, { status: 400 });
    }
    const res = await recordVote(mint, voterWallet, voteYes);
    return NextResponse.json({ success: true, ...res });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
