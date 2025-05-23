// app/api/record/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("📥 New Coincarnation received:", body);

    // Burada ileride: Neon, Supabase, ya da Google Sheet'e yazacağız

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to record Coincarnation:", err);
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
}
