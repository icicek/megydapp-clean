// app/api/admin/_lib/audit.ts
import { sql } from '@/app/api/_lib/db';

export type TokenStatus = 'healthy'|'walking_dead'|'deadcoin'|'redlist'|'blacklist';
export type AdminAuditAction =
  | 'set_status'
  | 'bulk_set_status'
  | 'reclassify'
  | 'login'
  | 'logout'
  | 'other';

function pickIp(headers: Headers) {
  const xf = headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  return headers.get('x-real-ip') ?? null;
}

export async function logAdminAudit(params: {
  req: Request | { headers: Headers };
  adminWallet: string;
  action: AdminAuditAction;
  targetMint?: string | null;
  prevStatus?: TokenStatus | null;
  newStatus?: TokenStatus | null;
  extra?: any; // serileştirilecek
}) {
  const {
    req,
    adminWallet,
    action,
    targetMint = null,
    prevStatus = null,
    newStatus = null,
    extra = null,
  } = params;

  const headers: Headers = (req as any).headers;
  const ip = headers ? pickIp(headers) : null;
  const ua = headers ? headers.get('user-agent') || null : null;

  await sql`
    INSERT INTO admin_audit
      (ts, admin_wallet, action, target_mint, prev_status, new_status, ip, ua, extra)
    VALUES
      (NOW(), ${adminWallet}, ${action}, ${targetMint}, ${prevStatus}, ${newStatus},
       ${ip}, ${ua}, ${JSON.stringify(extra)}::jsonb)
  `;
}
