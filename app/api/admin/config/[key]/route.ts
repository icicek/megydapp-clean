// app/api/admin/config/[key]/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { verifyCsrf } from '@/app/api/_lib/csrf';

// ✅ NEW: classification cache invalidation helpers
import { invalidateClassificationCaches } from '@/app/api/_lib/classification-cache';
import { TOKEN_THRESHOLD_KEYS } from '@/app/api/_lib/token-thresholds';

// Hangi keylerin UI üzerinden yönetilebileceğini beyaz liste ile sınırlıyoruz
const ALLOWED_KEYS = new Set<string>([
  // mevcut config anahtarları
  'claim_open',
  'app_enabled',
  'cron_enabled',
  'distribution_pool',
  'coincarnation_rate',
  'admins',

  // 🔽 Token classification thresholds (DB-backed)
  'healthy_min_liq_usd',
  'healthy_min_vol_usd',
  'walking_dead_min_liq_usd',
  'walking_dead_min_vol_usd',

  // 🔽 CorePoint ağırlıkları
  'cp_usd_per_1',
  'cp_deadcoin_first',
  'cp_share_twitter',
  'cp_share_other',
  'cp_referral_signup',

  // 🔽 CorePoint çarpanları
  'cp_mult_share',
  'cp_mult_usd',
  'cp_mult_deadcoin',
  'cp_mult_referral',
]);

// Basit JSON error helper
function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getConfigRow(key: string) {
  const rows = await sql/* sql */`
    SELECT key, value
    FROM admin_config
    WHERE key = ${key}
    LIMIT 1
  `;
  return (rows as any[])[0] ?? null;
}

/* ---------- GET /api/admin/config/[key] ---------- */
export async function GET(_req: NextRequest, context: any) {
  const key = context?.params?.key as string;

  if (!key || !ALLOWED_KEYS.has(key)) {
    return jsonError('Config key not found', 404);
  }

  const row = await getConfigRow(key);
  if (!row) {
    // Key hiç yoksa “success: true, value: null” dönelim
    return Response.json({ success: true, value: null });
  }

  const raw = row.value ?? {};
  const value =
    typeof raw === 'object' && raw !== null && 'value' in raw
      ? (raw as any).value
      : raw;

  return Response.json({ success: true, value });
}

/* ---------- PUT / POST /api/admin/config/[key] ---------- */
export async function PUT(req: NextRequest, context: any) {
  return saveConfig(req, context);
}

export async function POST(req: NextRequest, context: any) {
  return saveConfig(req, context);
}

async function saveConfig(req: NextRequest, context: any) {
  const key = context?.params?.key as string;

  if (!key || !ALLOWED_KEYS.has(key)) {
    return jsonError('Config key not allowed', 404);
  }

  // Cookie tabanlı admin mutation'larını CSRF'e karşı koru.
  verifyCsrf(req as any);

  // Admin doğrulaması + güncel DB/ENV allowlist kontrolü.
  const adminWallet = await requireAdmin(req as any).catch(() => null);
  if (!adminWallet) {
    return jsonError('Admin auth required', 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // bazı key’ler special format kullanıyor (admins: { wallets: [...] })
  let valueWrapper: any;

  if (key === 'admins') {
    const wallets = Array.isArray(body.wallets) ? body.wallets : [];
    valueWrapper = { wallets };
  } else {
    const val = body.value;
    valueWrapper = { value: val };
  }

  await sql/* sql */`
    INSERT INTO admin_config (key, value, updated_by)
    VALUES (${key}, ${valueWrapper}::jsonb, ${adminWallet})
    ON CONFLICT (key)
    DO UPDATE SET
      value      = EXCLUDED.value,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
  `;

  // ✅ NEW: if threshold key updated, invalidate in-memory caches immediately
  if (TOKEN_THRESHOLD_KEYS.has(key)) {
    invalidateClassificationCaches({ thresholds: true });
  }

  return Response.json({ success: true, key, value: valueWrapper });
}
