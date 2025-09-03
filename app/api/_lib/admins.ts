// app/api/_lib/admins.ts
import { sql } from '@/app/api/_lib/db';
import bs58 from 'bs58';

export function isValidBase58Wallet(w: string): boolean {
  try {
    const b = bs58.decode((w || '').trim());
    return b.length === 32;
  } catch { return false; }
}

export function isEnvAdmin(wallet: string): boolean {
  const w = (wallet || '').trim();
  const allowed = (process.env.ADMIN_WALLET || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return allowed.includes(w);
}

export async function listAdmins(): Promise<string[]> {
  try {
    await sql`CREATE TABLE IF NOT EXISTS admin_wallets (
      wallet    TEXT PRIMARY KEY,
      added_by  TEXT,
      added_at  TIMESTAMPTZ DEFAULT NOW()
    )`;
    const rows = await sql`SELECT wallet FROM admin_wallets ORDER BY added_at ASC`;
    return (rows as any[]).map(r => String(r.wallet));
  } catch {
    return (process.env.ADMIN_WALLET || '')
      .split(',').map(s => s.trim()).filter(Boolean);
  }
}

export async function isAdminAllowed(wallet: string): Promise<boolean> {
  const w = (wallet || '').trim();
  if (!isValidBase58Wallet(w)) return false;
  try {
    const hit = await sql`SELECT 1 FROM admin_wallets WHERE wallet = ${w} LIMIT 1`;
    if ((hit as any[]).length > 0) return true;
  } catch { /* ignore */ }
  const env = (process.env.ADMIN_WALLET || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  return env.includes(w);
}

export async function replaceAdmins(wallets: string[], updatedBy?: string): Promise<string[]> {
  const uniq = Array.from(new Set(wallets.map(w => w.trim()).filter(Boolean)));
  if (uniq.length > 200) throw Object.assign(new Error('too_many_wallets'), { status: 400 });
  for (const w of uniq) {
    if (!isValidBase58Wallet(w)) {
      throw Object.assign(new Error(`invalid_wallet:${w}`), { status: 400, code: 'invalid_wallet' });
    }
  }

  await sql`BEGIN`;
  try {
    await sql`CREATE TABLE IF NOT EXISTS admin_wallets (
      wallet    TEXT PRIMARY KEY,
      added_by  TEXT,
      added_at  TIMESTAMPTZ DEFAULT NOW()
    )`;
    await sql`TRUNCATE admin_wallets`;
    for (const w of uniq) {
      await sql`INSERT INTO admin_wallets (wallet, added_by) VALUES (${w}, ${updatedBy || null})`;
    }
    await sql`COMMIT`;
    return uniq;
  } catch (e) {
    await sql`ROLLBACK`;
    throw e;
  }
}
