// app/api/debug/health/route.ts

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function secretsMatch(
  received: string,
  expected: string
): boolean {
  if (!received || !expected) {
    return false;
  }

  const receivedBuffer =
    Buffer.from(received);

  const expectedBuffer =
    Buffer.from(expected);

  if (
    receivedBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    receivedBuffer,
    expectedBuffer
  );
}

export async function GET(
  req: NextRequest
) {
  const expected =
    process.env.DEBUG_SECRET?.trim() || '';

  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        error: 'server-misconfig',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  const received =
    req.headers
      .get('x-debug-secret')
      ?.trim() || '';

  if (
    !secretsMatch(
      received,
      expected
    )
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: 'unauthorized',
      },
      {
        status: 401,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      now: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}