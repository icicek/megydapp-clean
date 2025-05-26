export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  console.log('🎯 record API route called');

  const body = await req.json();
  console.log('📦 Incoming test body:', body);

  return NextResponse.json({
    success: true,
    number: 999,
    message: '✅ Test yanıtı başarıyla döndü',
  });
}

// 👇 Diğer tüm yöntemler için 405 cevabı döndür
export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method Not Allowed' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method Not Allowed' },
    { status: 405 }
  );
}
