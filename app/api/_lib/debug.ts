import { NextResponse } from 'next/server';

export function withDebugHeaders<T>(
  res: NextResponse<T>,
  route: string
): NextResponse<T> {
  try {
    res.headers.set('x-cc-route', route);
    res.headers.set('cache-control', 'no-store');
  } catch {
    // header set edilemezse bile response dönsün
  }
  return res;
}