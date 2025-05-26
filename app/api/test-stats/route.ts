import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  try {
    const result = await sql`SELECT COUNT(*) FROM participants`;
    return NextResponse.json({ count: result[0].count });
  } catch (err) {
    console.error('❌ STATS API TEST ERROR:', err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
