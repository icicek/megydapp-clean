import { NextResponse } from 'next/server';

export function withDebugHeaders(res: NextResponse, route: string) {
  res.headers.set('x-cc-route', route);
  // Ayrıca cache davranışını netleştirelim
  res.headers.set('cache-control', 'no-store');
  return res;
}