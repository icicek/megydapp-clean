// app/api/_lib/jwt.ts
import jwt from 'jsonwebtoken';

const SECRET = process.env.ADMIN_JWT_SECRET!;
if (!SECRET) {
  console.warn('ADMIN_JWT_SECRET is not set');
}

export function signAdmin(wallet: string, ttlSec = 3600) {
  return jwt.sign({ sub: wallet, role: 'admin' }, SECRET, { expiresIn: ttlSec });
}

export function verifyAdminToken(token: string): string {
  const payload = jwt.verify(token, SECRET) as any;
  return payload.sub as string;
}

function getCookieFromHeader(header: string | null, name: string): string | null {
  if (!header) return null;
  const parts = header.split(';');
  for (const part of parts) {
    const p = part.trim();
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    const key = decodeURIComponent(p.slice(0, eq).trim());
    if (key === name) {
      return decodeURIComponent(p.slice(eq + 1));
    }
  }
  return null;
}

// API route'larda kullan
export async function requireAdmin(req: Request): Promise<string> {
  // 1) Bearer header
  const hdr = req.headers.get('authorization') || '';
  const bearer = hdr.match(/^Bearer\s+(.+)$/i)?.[1];

  // 2) Cookie header (HttpOnly cookie desteği)
  const cookieHeader = req.headers.get('cookie');
  const cookieTok = getCookieFromHeader(cookieHeader, 'coincarnation_admin');

  const token = bearer ?? cookieTok;
  if (!token) throw new Error('Missing token');

  const wallet = verifyAdminToken(token);

  // Allowed list kontrolü (env varsa uygula)
  const allowed = (process.env.ADMIN_WALLET || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (allowed.length && !allowed.includes(wallet)) {
    throw new Error('Not allowed');
  }
  return wallet;
}
