// app/api/list/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getStatus } from '@/app/api/list/repo';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mint = searchParams.get('mint');

    if (!mint || !mint.trim()) {
      return NextResponse.json({ success: false, error: 'Mint is required' }, { status: 400 });
    }

    const { status, statusAt } = await getStatus(mint.trim());
    return NextResponse.json({ success: true, status, statusAt });
  } catch (error) {
    console.error('❌ Status API error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
