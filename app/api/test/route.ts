// ✅ File: app/api/test/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('🧪 TEST API BODY:', body);

    return NextResponse.json({ number: 1234 });
  } catch (err) {
    console.error('❌ Test API Error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
