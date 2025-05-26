export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  console.log('🎯 record API route called');

  // İsteği JSON olarak parse et (isteğe bağlı)
  const body = await req.json();
  console.log('📦 Incoming test body:', body);

  // Basit ve geçerli bir JSON yanıtı döndür
  return NextResponse.json({
    success: true,
    number: 999,
    message: '✅ Test yanıtı başarıyla döndü',
  });
}
