// app/api/admin/tokens/export.csv/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { verifyCsrf } from '@/app/api/_lib/csrf';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';

const sql = neon(process.env.DATABASE_URL!);

type TokenStatus = 'healthy' | 'walking_dead' | 'deadcoin' | 'redlist' | 'blacklist';
const ALLOWED = ['healthy','walking_dead','deadcoin','redlist','blacklist'] as const satisfies readonly TokenStatus[];

/** Uygulamada kullanacağımız kesin tip (union) */
type TokenRegistryRow = {
  mint: string;
  status: TokenStatus;
  status_at: string | null;
  updated_by: string | null;
  reason: string | null;
  meta: any | null;
  created_at: string;
  updated_at: string;
};

/** DB’nin döndüğü tip (status geniş string) */
type TokenRegistryDbRow = Omit<TokenRegistryRow, 'status'> & { status: string };

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  const needsQuotes = /[",\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function toCsv(exportRows: TokenRegistryRow[]): string {
  const headers = [
    'mint','status','status_at','updated_by','reason','meta','created_at','updated_at',
  ];
  const lines = [headers.join(',')];

  for (const r of exportRows) {
    const metaStr = r.meta ? JSON.stringify(r.meta) : '';
    lines.push([
      csvEscape(r.mint),
      csvEscape(r.status),
      csvEscape(r.status_at),
      csvEscape(r.updated_by),
      csvEscape(r.reason),
      csvEscape(metaStr),
      csvEscape(r.created_at),
      csvEscape(r.updated_at),
    ].join(','));
  }
  return '\uFEFF' + lines.join('\n'); // UTF-8 BOM
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req as any);
    await requireAdmin(req as any); // wallet string dönüyor; istersen kullan

    const body = (await req.json?.()) ?? {};
    const q: string = typeof body.q === 'string' ? body.q : '';
    const status: string = typeof body.status === 'string' ? body.status : '';

    const like = `%${q}%`;

    // ❗ Generic YOK: önce ham sonuçları alıyoruz
    const result = await sql`
      SELECT
        mint,
        status::text AS status,
        status_at,
        updated_by,
        reason,
        meta,
        created_at,
        updated_at
      FROM token_registry
      WHERE 1=1
      ${status && (ALLOWED as readonly string[]).includes(status) ? sql`AND status = ${status}` : sql``}
      ${q ? sql`
        AND (
          mint ILIKE ${like}
          OR reason ILIKE ${like}
          OR updated_by ILIKE ${like}
          OR meta::text ILIKE ${like}
        )
      ` : sql``}
      ORDER BY updated_at DESC
    `;

    // Ham sonuçları tipli diziye çevir
    const dbRows = result as unknown as TokenRegistryDbRow[];

    // Union’a güvenli map
    const exportRows: TokenRegistryRow[] = dbRows.map((r) => ({
      ...r,
      status: (ALLOWED as readonly string[]).includes(r.status)
        ? (r.status as TokenStatus)
        : 'healthy', // istersen burada throw da edebilirsin
    }));

    const csv = toCsv(exportRows);
    const date = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tokens_${date}.csv"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err: any) {
    const { status, body } = httpErrorFrom(err, 500);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'Method Not Allowed' }, { status: 405 });
}
