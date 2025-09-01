// app/api/_lib/jwt.ts
import jwt, { JwtPayload } from 'jsonwebtoken';

/** HTTP status + machine-readable code taşıyan hata türü */
export class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** ENV secret'ı doğrula; yoksa 500 fırlat */
function ensureSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    console.warn('ADMIN_JWT_SECRET is not set');
    throw new HttpError(500, 'Server misconfigured', 'server_secret_missing');
  }
  return secret;
}

/** Admin JWT oluşturma (login sonrası cookie/bearer için) */
export function signAdmin(wallet: string, ttlSec = 3600) {
  const secret = ensureSecret();
  return jwt.sign({ sub: wallet, role: 'admin' }, secret, { expiresIn: ttlSec });
}

/** JWT doğrula → wallet (sub) döndür; hataları uygun status ile fırlat */
function verifyAdminTokenOrThrow(token: string): string {
  const secret = ensureSecret();
  try {
    const payload = jwt.verify(token, secret) as JwtPayload & { sub?: string };
    const sub = payload?.sub;
    if (!sub) {
      throw new HttpError(401, 'Invalid token payload', 'auth_invalid');
    }
    return String(sub);
  } catch (err: any) {
    // jsonwebtoken hataları isimle gelir
    if (err?.name === 'TokenExpiredError') {
      throw new HttpError(401, 'Token expired', 'auth_expired');
    }
    if (err?.name === 'JsonWebTokenError' || err?.name === 'NotBeforeError') {
      throw new HttpError(401, 'Invalid token', 'auth_invalid');
    }
    // diğerleri
    throw new HttpError(401, 'Invalid token', 'auth_invalid');
  }
}

/** Basit cookie parser (header üzerinden) */
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

/**
 * API route'larda kullan:
 * - Authorization: Bearer <token> veya
 * - Cookie: coincarnation_admin=<token>
 * Döndürdüğü değer: wallet (JWT sub)
 * Hatalar: HttpError(401/403/500, message, code)
 */
export async function requireAdmin(req: Request): Promise<string> {
  // 1) Bearer token
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1];

  // 2) HttpOnly cookie (opsiyonel)
  const cookieHeader = req.headers.get('cookie');
  const cookieTok = getCookieFromHeader(cookieHeader, 'coincarnation_admin');

  const token = bearer ?? cookieTok;
  if (!token) {
    throw new HttpError(401, 'Missing token', 'auth_missing');
  }

  const wallet = verifyAdminTokenOrThrow(token);

  // İsteğe bağlı allowlist
  const allowed = (process.env.ADMIN_WALLET || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (allowed.length && !allowed.includes(wallet)) {
    throw new HttpError(403, 'Not allowed', 'auth_forbidden');
  }

  return wallet;
}
