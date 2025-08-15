import { NextRequest, NextResponse } from 'next/server';
import { getDeadcoinStatus } from '@/app/api/list/repo';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mint = searchParams.get('mint');

    if (!mint) {
      return NextResponse.json({ success: false, error: 'Mint is required' }, { status: 400 });
    }

    const status = await getDeadcoinStatus(mint);
    return NextResponse.json({ success: true, ...status });
  } catch (error) {
    console.error('❌ Status API error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
