//app/api/_lib/refund-config.ts

import { sql } from '@/app/api/_lib/db';

export async function getRefundFeeLamports(): Promise<number> {
  try {
    const rows = (await sql/* sql */`
      SELECT value
      FROM admin_config
      WHERE key = 'refund_fee_lamports'
      LIMIT 1
    `) as Array<{ value: unknown }>;

    const raw = rows?.[0]?.value;

    let n: number | null = null;

    if (typeof raw === 'number') {
      n = raw;
    } else if (typeof raw === 'string') {
      n = Number(raw);
    } else if (raw && typeof raw === 'object' && 'value' in (raw as any)) {
      n = Number((raw as any).value);
    }

    if (Number.isFinite(n) && (n as number) > 0) {
      return Math.floor(n as number);
    }

    return 1_000_000; // 0.001 SOL fallback
  } catch (err) {
    console.warn('refund fee config read failed, using default:', err);
    return 1_000_000;
  }
}