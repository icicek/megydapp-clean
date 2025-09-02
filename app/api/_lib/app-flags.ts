import { sql } from '@/app/api/_lib/db';

export async function getFlag(key: 'app_enabled'|'claim_open'): Promise<boolean> {
  const rows = await sql`SELECT value FROM config WHERE key=${key} LIMIT 1`;
  const v = (rows as any[])[0]?.value ?? 'false';
  return String(v).toLowerCase() === 'true';
}

// Uygulamanın yazma/claim gibi kritik uçlarında çağır:
export async function assertAppEnabled() {
  const enabled = await getFlag('app_enabled');
  if (!enabled) {
    const e = Object.assign(new Error('Service Unavailable'), { status: 503, code: 'app_disabled' });
    throw e;
  }
}
