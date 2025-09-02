// app/api/_lib/admins.ts
import { sql } from '@/app/api/_lib/db';

// ENV -> kök otorite (virgüllü liste)
export function envAdmins(): string[] {
  return (process.env.ADMIN_WALLET || '')
    .split(',').map(s => s.trim()).filter(Boolean);
}

// DB'deki ek adminler (admin_config.key='extra_admins' JSON array)
export async function getExtraAdmins(): Promise<string[]> {
  const rows = await sql`SELECT value FROM admin_config WHERE key='extra_admins' LIMIT 1`;
  const v = (rows as any[])[0]?.value;
  if (!v) return [];
  try {
    const arr = Array.isArray(v?.value) ? v.value : Array.isArray(v) ? v : [];
    return arr.filter((x: any) => typeof x === 'string' && x.length > 0);
  } catch { return []; }
}

export async function setExtraAdmins(wallets: string[], updatedBy: string) {
  const unique = Array.from(new Set(wallets.map(w => w.trim()).filter(Boolean)));
  await sql`
    INSERT INTO admin_config (key, value, updated_by)
    VALUES ('extra_admins', ${ { value: unique } }, ${updatedBy})
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_by = ${updatedBy}, updated_at = now()
  `;
}

export async function isAdminAllowed(wallet: string): Promise<boolean> {
  const env = envAdmins();
  const extra = await getExtraAdmins();
  // fail-closed: hem ENV hem DB boşsa => false
  if (env.length === 0 && extra.length === 0) return false;
  return env.includes(wallet) || extra.includes(wallet);
}
