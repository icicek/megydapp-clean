// app/api/_lib/csrf.ts
import type { NextRequest } from 'next/server';

/**
 * Only enforce for "unsafe" methods.
 * Accept requests whose Origin host matches either:
 *  - NEXT_PUBLIC_APP_URL host (if provided), or
 *  - the current request Host header.
 */
export function verifyCsrf(req: NextRequest) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!host) throw new Error('Forbidden: missing Host');

  // Determine allowed host
  let allowedHost = '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  if (appUrl) {
    try { allowedHost = new URL(appUrl).host; } catch { /* ignore */ }
  }
  if (!allowedHost) allowedHost = host;

  if (!origin) throw new Error('Forbidden: missing Origin');

  let originHost = '';
  try { originHost = new URL(origin).host; } catch {
    throw new Error('Forbidden: invalid Origin');
  }

  if (originHost !== allowedHost) {
    throw new Error('Forbidden: cross-site request blocked');
  }
}
