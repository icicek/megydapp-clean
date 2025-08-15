import { NextRequest, NextResponse } from 'next/server';
import { updateFromLv } from '@/app/api/list/repo';

export async function POST(req: NextRequest) {
  try {
    const { mint, isDeadcoin } = await req.json();

    if (!mint || typeof isDeadcoin !== 'boolean') {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }

    const updated = await updateFromLv(mint, isDeadcoin);
    return NextResponse.json({ success: true, ...updated });
  } catch (error) {
    console.error('❌ Update-from-LV API error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
