//app/api/coinographia/metrics/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METRIC_KEYS = [
  'healthy_min_vol_usd',
  'healthy_min_liq_usd',
  'walking_dead_min_vol_usd',
  'walking_dead_min_liq_usd',
] as const;

type MetricKey = typeof METRIC_KEYS[number];

type MetricMap = Record<MetricKey, number | null>;

function extractConfigValue(raw: any): number | null {
  const value =
    typeof raw === 'object' && raw !== null && 'value' in raw
      ? raw.value
      : raw;

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  try {
    const rows = (await sql`
      SELECT key, value
      FROM admin_config
      WHERE key = ANY(${METRIC_KEYS})
    `) as Array<{
      key: MetricKey;
      value: any;
    }>;

    const metrics: MetricMap = {
      healthy_min_vol_usd: null,
      healthy_min_liq_usd: null,
      walking_dead_min_vol_usd: null,
      walking_dead_min_liq_usd: null,
    };

    for (const row of rows) {
      if (row.key in metrics) {
        metrics[row.key] = extractConfigValue(row.value);
      }
    }

    return NextResponse.json({
      success: true,
      metrics,
      cards: [
        {
          key: 'healthy_min_vol_usd',
          label: 'Healthy Min Volume',
          value: metrics.healthy_min_vol_usd,
          unit: 'usd',
          description:
            'Minimum trading volume expected for a token to remain in the healthy zone.',
        },
        {
          key: 'healthy_min_liq_usd',
          label: 'Healthy Min Liquidity',
          value: metrics.healthy_min_liq_usd,
          unit: 'usd',
          description:
            'Minimum liquidity expected for a token to remain in the healthy zone.',
        },
        {
          key: 'walking_dead_min_vol_usd',
          label: 'Walking Dead Min Volume',
          value: metrics.walking_dead_min_vol_usd,
          unit: 'usd',
          description:
            'Minimum trading volume needed to stay above the deadcoin zone.',
        },
        {
          key: 'walking_dead_min_liq_usd',
          label: 'Walking Dead Min Liquidity',
          value: metrics.walking_dead_min_liq_usd,
          unit: 'usd',
          description:
            'Minimum liquidity needed to stay above the deadcoin zone.',
        },
      ],
    });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}