import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  try {
    const result = await sql`
      SELECT value FROM config WHERE key = 'distribution_pool' LIMIT 1;
    `;

    const raw = result[0]?.value;

    if (!raw || isNaN(Number(raw))) {
      return NextResponse.json({
        success: false,
        error: 'Invalid or missing value in config table.',
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      value: Number(raw),
    });
  } catch (err) {
    console.error('Error loading distribution_pool from config:', err);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
    }, { status: 500 });
  }
}
