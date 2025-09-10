// app/api/debug/ping/route.ts
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({ ok: true, t: new Date().toISOString() });
}
