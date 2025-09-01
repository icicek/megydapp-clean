// app/api/proxy/price/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 3000
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Fetch timed out')), timeout);
    fetch(url, options)
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

function toBool(v: any): boolean {
  if (typeof v === 'boolean') return v;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

function pickInput(req: NextRequest) {
  const u = new URL(req.url);
  const ct = req.headers.get('content-type') || '';
  const query = {
    source: u.searchParams.get('source'),
    mint: u.searchParams.get('mint'),
    isSol: u.searchParams.get('isSol'),
  };
  return { ct, query };
}

async function parseBody(req: NextRequest) {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      return await req.json();
    } catch { /* ignore */ }
  }
  return {};
}

async function handle(req: NextRequest) {
  try {
    const { ct, query } = pickInput(req);
    const body: any = await parseBody(req);

    // Esnek parametre okuma (body seviyesinde veya body.params içinde)
    const sourceRaw = body.source ?? query.source ?? process.env.PRICE_DEFAULT_SOURCE ?? 'coingecko';
    const mintRaw   = body.mint ?? body?.params?.mint ?? query.mint ?? null;
    const isSolRaw  = body.isSol ?? body?.params?.isSol ?? query.isSol ?? false;

    const source = String(sourceRaw).toLowerCase();
    const isSol  = toBool(isSolRaw);
    const mint   = mintRaw ? String(mintRaw) : null;

    // Şimdilik sadece coingecko destekli
    const ALLOWED = new Set(['coingecko']);
    if (!ALLOWED.has(source)) {
      return NextResponse.json(
        { success: false, error: 'Unsupported source', allowed: Array.from(ALLOWED) },
        { status: 400 }
      );
    }

    let apiUrl = '';
    if (source === 'coingecko') {
      if (isSol) {
        // SOL fiyatı (ids=solana)
        apiUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';
      } else {
        if (!mint) {
          return NextResponse.json(
            { success: false, error: 'mint is required for token lookup' },
            { status: 400 }
          );
        }
        // Solana'da token fiyatı: contract_addresses=<mint>
        apiUrl =
          `https://api.coingecko.com/api/v3/simple/token_price/solana?` +
          `contract_addresses=${encodeURIComponent(mint)}&vs_currencies=usd`;
      }
    }

    // İstek
    const response = await fetchWithTimeout(apiUrl, {}, 3000);
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `Fetch failed with status ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Fiyat çıkarımı
    let priceUsd: number | null = null;
    if (source === 'coingecko') {
      if (isSol) {
        priceUsd = data?.solana?.usd ?? null;
      } else {
        // coingecko bu endpointte yanıtı { "<contract_address>": { usd: ... } } şeklinde döndürür.
        // Key casing farklı olabilir; ilk anahtarın usd'sini okuyalım.
        const key = Object.keys(data || {})[0];
        priceUsd = key ? (data[key]?.usd ?? null) : null;
      }
    }

    return NextResponse.json({
      success: true,
      source,
      mint,
      isSol,
      priceUsd,
      data, // debug/şeffaflık için bırakıyoruz; istersen kaldırabilirsin.
    });
  } catch (err: any) {
    console.error('🔥 [proxy] Error:', err?.message || err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest)  { return handle(req); }
