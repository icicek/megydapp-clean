import jwt from 'jsonwebtoken';

const SECRET = process.env.ADMIN_JWT_SECRET;
if (!SECRET) throw new Error('Missing env: ADMIN_JWT_SECRET');

export function signAdmin(wallet: string, ttlSec = 60 * 60) {
  return jwt.sign({ sub: wallet, role: 'admin' }, SECRET, { expiresIn: ttlSec });
}

export function verifyAdminToken(token: string): string {
  const payload = jwt.verify(token, SECRET) as any;
  return payload.sub as string;
}

/** Authorization: Bearer <token> bekler, wallet döner. ADMIN_WALLET liste kontrolü yapar. */
export async function requireAdmin(req: Request): Promise<string> {
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error('Missing Authorization header');

  const wallet = verifyAdminToken(m[1]);

  // Env: tek veya virgülle çoklu cüzdan destekler
  const allowed = (process.env.ADMIN_WALLET || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (allowed.length && !allowed.includes(wallet)) {
    throw new Error('Not allowed');
  }
  return wallet;
}
